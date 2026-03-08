import {
  getRoomCode,
  getState,
  insertCoin,
  isHost,
  myPlayer,
  onPlayerJoin,
  setState,
  type PlayerState,
} from "playroomkit";

type Phase =
  | "lobby"
  | "role_reveal"
  | "clue"
  | "discussion"
  | "voting"
  | "round_result"
  | "match_end";

type Role = "member" | "imposter";

type HapticType = "light" | "medium" | "heavy" | "success" | "error";

type ReactionType = "egg" | "heart" | "question" | "eye";

interface GameConfig {
  imposters: number;
  revealSeconds: number;
  clueSeconds: number;
  clueGapSeconds: number;
  discussionSeconds: number;
  votingSeconds: number;
  resultSeconds: number;
}

interface Settings {
  music: boolean;
  fx: boolean;
  haptics: boolean;
}

interface ClueEntry {
  playerId: string;
  clue: string;
  round: number;
  auto: boolean;
}

interface ChatEntry {
  playerId: string;
  message: string;
  round: number;
}

interface RoundResult {
  round: number;
  winner: "members" | "imposters" | "tied";
  eliminatedId: string;
  eliminatedName: string;
  eliminatedRole: Role;
  voteCounts: Record<string, number>;
}

interface ScoreEntry {
  playerId: string;
  name: string;
  score: number;
  role: Role | "none";
}

declare global {
  interface Window {
    __ROOM_CODE__?: string;
    __PLAYER_NAME__?: string;
    __PLAYER_AVATAR__?: string;
    shareRoomCode?: (roomCode: string | null) => void;
    triggerHaptic?: (type: HapticType) => void;
    submitScore?: (score: number) => void;
  }
}

const SETTINGS_KEY = "imposter-settings";
const COUNTDOWN_SECONDS = 5;
const GAP_COUNTDOWN_SECONDS = 5;
const TIED_RESULT_SECONDS = 15;

const REACTION_TYPES: ReactionType[] = ["egg", "heart", "question", "eye"];

const REACTION_LABELS: Record<ReactionType, string> = {
  egg: "Egg",
  heart: "Love",
  question: "Huh?",
  eye: "Sus",
};

const REACTION_SVGS: Record<ReactionType, string> = {
  egg: '<svg viewBox="0 0 24 24"><path d="M12 2C8.5 2 5 8.5 5 14a7 7 0 0 0 14 0c0-5.5-3.5-12-7-12z"/></svg>',
  heart:
    '<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
  question:
    '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z"/><path d="M11 16h2v2h-2v-2zm1-10c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>',
};

const STATE_KEYS = {
  phase: "imposter_phase",
  config: "imposter_config",
  hostId: "imposter_host_id",
  round: "imposter_round",
  phaseEndsAt: "imposter_phase_ends_at",
  participants: "imposter_participants",
  allParticipants: "imposter_all_participants",
  turnOrder: "imposter_turn_order",
  turnIndex: "imposter_turn_index",
  clues: "imposter_clues",
  clueDone: "imposter_clue_done",
  clueGap: "imposter_clue_gap",
  reactions: "imposter_reactions",
  chat: "imposter_chat",
  result: "imposter_result",
  scoreboard: "imposter_scoreboard",
  matchWinner: "imposter_match_winner",
};

const PLAYER_KEYS = {
  customName: "customName",
  ready: "ready",
  score: "score",
  role: "imposter_role",
  secretWord: "imposter_secret_word",
  revealReady: "imposter_reveal_ready",
  voteTarget: "imposter_vote_target",
  endDiscussion: "imposter_end_discussion",
};

const DEFAULT_CONFIG: GameConfig = {
  imposters: 1,
  revealSeconds: 25,
  clueSeconds: 30,
  clueGapSeconds: 15,
  discussionSeconds: 180,
  votingSeconds: 30,
  resultSeconds: 8,
};

const MAX_PLAYERS = 20;

const WORD_BANK = [
  "Volcano",
  "Passport",
  "Museum",
  "Lantern",
  "Glacier",
  "Jungle",
  "Harbor",
  "Compass",
  "Saturn",
  "Orchestra",
  "Pyramid",
  "Fireworks",
  "Backpack",
  "Dessert",
  "Galaxy",
  "Carnival",
  "Skateboard",
  "Avalanche",
  "Hammock",
  "Fountain",
  "Lighthouse",
  "Postcard",
  "Kite",
  "Submarine",
  "Canyon",
  "Espresso",
  "Moonlight",
  "Violin",
  "Blueprint",
  "Dragon",
  "Treasure",
  "Cabin",
  "Tornado",
  "Mirage",
  "Sunglasses",
  "Carousel",
  "Feather",
  "Potion",
  "Bonfire",
  "Waterfall",
  "Origami",
  "Festival",
  "Telescope",
  "Picnic",
  "Raindrop",
  "Snowflake",
  "Sculpture",
  "Echo",
  "Riddle",
  "Meadow",
  "Airship",
  "Rocket",
  "Comet",
  "Anchor",
  "Notebook",
  "Jigsaw",
  "Lightning",
  "Trophy",
  "Sunset",
  "Dolphin",
  "Cloud",
  "Guitar",
  "Library",
  "Magnet",
  "Keyhole",
  "Bicycle",
  "Train",
  "Garden",
  "Trampoline",
  "Camera",
  "Robot",
  "Umbrella",
];

const startScreen = getEl<HTMLElement>("start-screen");
const loadingScreen = getEl<HTMLElement>("loading-screen");
const lobbyScreen = getEl<HTMLElement>("lobby-screen");
const gameScreen = getEl<HTMLElement>("game-screen");

const startButtons = getEl<HTMLElement>("start-buttons");
const joinRoomSection = getEl<HTMLElement>("join-room-section");
const joinRoomInput = getEl<HTMLInputElement>("join-room-input");
const joinError = getEl<HTMLElement>("join-error");

const loadingText = getEl<HTMLElement>("loading-text");

const createRoomBtn = getEl<HTMLButtonElement>("create-room-btn");
const joinRoomBtn = getEl<HTMLButtonElement>("join-room-btn");
const joinSubmitBtn = getEl<HTMLButtonElement>("join-submit-btn");
const backToStartBtn = getEl<HTMLButtonElement>("back-to-start");
const backBtn = getEl<HTMLButtonElement>("back-btn");

const settingsBtn = getEl<HTMLButtonElement>("settings-btn");
const settingsModal = getEl<HTMLElement>("settings-modal");

let app: ImposterGame | null = null;

function getEl<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error("Missing element with id " + id);
  }
  return element as T;
}

function log(scope: string, message: string): void {
  console.log("[" + scope + "]", message);
}

function sanitizeRoomCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getRoomCodeFromURL(): string | null {
  const hash = window.location.hash;
  const roomMatch = hash.match(/[#&]r=([A-Z0-9]+)/i);
  return roomMatch ? roomMatch[1].toUpperCase() : null;
}

function triggerPlatformHaptic(type: HapticType): void {
  if (typeof window.triggerHaptic === "function") {
    window.triggerHaptic(type);
  }
}

function shareRoomCode(roomCode: string | null): void {
  if (typeof window.shareRoomCode === "function") {
    window.shareRoomCode(roomCode);
  }
}

function showLoading(text: string): void {
  loadingText.textContent = text;
  loadingScreen.classList.remove("hidden");
  startScreen.classList.add("hidden");
  lobbyScreen.classList.add("hidden");
  gameScreen.classList.add("hidden");
}

function showStartScreen(): void {
  startScreen.classList.remove("hidden");
  loadingScreen.classList.add("hidden");
  lobbyScreen.classList.add("hidden");
  gameScreen.classList.add("hidden");
  backBtn.classList.add("hidden");
  settingsBtn.classList.add("hidden");
  settingsModal.classList.add("hidden");

  startButtons.classList.remove("hidden");
  joinRoomSection.classList.add("hidden");
  joinRoomInput.value = "";
  joinError.classList.add("hidden");
}

function hideLoading(): void {
  loadingScreen.classList.add("hidden");
}

async function connectToRoom(roomCode: string): Promise<boolean> {
  showLoading("Connecting to room...");

  try {
    await insertCoin({
      skipLobby: true,
      maxPlayersPerRoom: MAX_PLAYERS,
      roomCode,
      defaultPlayerStates: {
        [PLAYER_KEYS.ready]: false,
        [PLAYER_KEYS.score]: 0,
        [PLAYER_KEYS.role]: "",
        [PLAYER_KEYS.secretWord]: "",
        [PLAYER_KEYS.revealReady]: false,
        [PLAYER_KEYS.voteTarget]: "",
        [PLAYER_KEYS.endDiscussion]: false,
      },
    });

    const connectedCode = getRoomCode();
    log(
      "connectToRoom",
      "Connected to room " + String(connectedCode || roomCode),
    );
    shareRoomCode(connectedCode || roomCode);

    hideLoading();

    startScreen.classList.add("hidden");
    lobbyScreen.classList.remove("hidden");
    backBtn.classList.remove("hidden");
    settingsBtn.classList.remove("hidden");

    if (app) {
      app.destroy();
    }
    app = new ImposterGame();

    return true;
  } catch (error) {
    log("connectToRoom", "Failed to connect " + String(error));
    hideLoading();
    showStartScreen();
    return false;
  }
}

async function leaveRoom(): Promise<void> {
  triggerPlatformHaptic("light");
  shareRoomCode(null);

  if (app) {
    app.destroy();
    app = null;
  }

  showStartScreen();

  try {
    const player = myPlayer();
    if (player) {
      await player.leaveRoom();
    }
  } catch (error) {
    log("leaveRoom", "Failed to leave room cleanly " + String(error));
  }
}

async function attemptJoinRoom(): Promise<void> {
  const code = sanitizeRoomCode(joinRoomInput.value.trim());
  joinRoomInput.value = code;

  if (code.length < 4) {
    joinError.textContent = "Code must be at least 4 characters";
    joinError.classList.remove("hidden");
    triggerPlatformHaptic("error");
    return;
  }

  triggerPlatformHaptic("light");
  const success = await connectToRoom(code);
  if (!success) {
    joinError.textContent = "Could not connect to room";
    joinError.classList.remove("hidden");
  }
}

function setupStartScreen(): void {
  createRoomBtn.addEventListener("click", async () => {
    triggerPlatformHaptic("light");
    const code = generateRoomCode();
    log("setupStartScreen", "Creating room " + code);
    await connectToRoom(code);
  });

  joinRoomBtn.addEventListener("click", () => {
    triggerPlatformHaptic("light");
    startButtons.classList.add("hidden");
    joinRoomSection.classList.remove("hidden");
    joinError.classList.add("hidden");
    joinRoomInput.focus();
  });

  backToStartBtn.addEventListener("click", () => {
    triggerPlatformHaptic("light");
    startButtons.classList.remove("hidden");
    joinRoomSection.classList.add("hidden");
    joinError.classList.add("hidden");
    joinRoomInput.value = "";
  });

  joinRoomInput.addEventListener("input", () => {
    joinRoomInput.value = sanitizeRoomCode(joinRoomInput.value);
    joinError.classList.add("hidden");
  });

  joinRoomInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      await attemptJoinRoom();
    }
  });

  joinSubmitBtn.addEventListener("click", async () => {
    await attemptJoinRoom();
  });

  backBtn.addEventListener("click", () => {
    void leaveRoom();
  });
}

class AudioEngine {
  private audioContext: AudioContext | null = null;
  private sequenceTimer: ReturnType<typeof setInterval> | null = null;
  private sequenceStep = 0;

  private ensureContext(): AudioContext | null {
    if (this.audioContext) {
      return this.audioContext;
    }
    try {
      this.audioContext = new AudioContext();
      return this.audioContext;
    } catch (error) {
      log(
        "AudioEngine.ensureContext",
        "Audio context unavailable " + String(error),
      );
      return null;
    }
  }

  private playTone(
    frequency: number,
    durationMs: number,
    type: OscillatorType,
    gainValue: number,
  ): void {
    const context = this.ensureContext();
    if (!context) {
      return;
    }
    if (context.state === "suspended") {
      void context.resume();
    }

    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, gainValue),
      context.currentTime + 0.02,
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + durationMs / 1000,
    );
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + durationMs / 1000 + 0.02);
  }

  public stopMusic(): void {
    if (this.sequenceTimer) {
      clearInterval(this.sequenceTimer);
      this.sequenceTimer = null;
      this.sequenceStep = 0;
    }
  }

  public startLobbyMusic(): void {
    this.stopMusic();
    this.sequenceTimer = setInterval(() => {
      const sequence = [220, 247, 294, 330];
      const index = this.sequenceStep % sequence.length;
      this.playTone(sequence[index], 180, "triangle", 0.04);
      this.sequenceStep += 1;
    }, 420);
  }

  public startRoundMusic(): void {
    this.stopMusic();
    this.sequenceTimer = setInterval(() => {
      const sequence = [164, 196, 220, 196, 146, 196];
      const index = this.sequenceStep % sequence.length;
      this.playTone(sequence[index], 140, "sawtooth", 0.035);
      this.sequenceStep += 1;
    }, 350);
  }

  public playClick(): void {
    this.playTone(560, 70, "square", 0.05);
  }

  public playReveal(): void {
    this.playTone(330, 120, "triangle", 0.05);
    setTimeout(() => this.playTone(440, 130, "triangle", 0.05), 80);
  }

  public playVoteLock(): void {
    this.playTone(180, 110, "sawtooth", 0.06);
  }

  public playCountdownTick(): void {
    this.playTone(440, 60, "triangle", 0.06);
  }

  public playCountdownGo(): void {
    this.playTone(523, 200, "triangle", 0.07);
    setTimeout(() => this.playTone(659, 200, "triangle", 0.07), 100);
  }

  public playWin(): void {
    this.playTone(392, 160, "triangle", 0.06);
    setTimeout(() => this.playTone(523, 220, "triangle", 0.06), 120);
  }

  public playLose(): void {
    this.playTone(220, 140, "sawtooth", 0.05);
    setTimeout(() => this.playTone(174, 180, "sawtooth", 0.05), 120);
  }
}

class ImposterGame {
  private players: PlayerState[] = [];
  private phase: Phase = "lobby";
  private hostId = "";
  private config: GameConfig = { ...DEFAULT_CONFIG };
  private round = 1;
  private participants: string[] = [];
  private allParticipants: string[] = [];
  private turnOrder: string[] = [];
  private turnIndex = 0;
  private clues: ClueEntry[] = [];
  private chat: ChatEntry[] = [];
  private reactions: Record<string, string> = {};
  private phaseEndsAt = 0;
  private result: RoundResult | null = null;
  private selectedVoteTarget = "";
  private hasSubmittedScore = false;
  private myEndDiscussion = false;
  private clueGap = false;
  private _prevClueGap = false;
  private _prevTurnIndex = -1;

  private _countdownActive = false;
  private _countdownTimer: ReturnType<typeof setInterval> | null = null;
  private _countdownCurrent = 0;
  private _gapCountdownTriggered = false;

  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private hostTickInterval: ReturnType<typeof setInterval> | null = null;
  private nameDebounce: ReturnType<typeof setTimeout> | null = null;
  private playerJoinCleanup: (() => void) | null = null;
  private abortController: AbortController;
  private isDestroyed = false;
  private isInteractingWithConfig = false;
  private myReadyState = false;

  private settings: Settings;
  private audio: AudioEngine;

  private roomCodeDisplay = getEl<HTMLElement>("room-code-display");
  private copyCodeBtn = getEl<HTMLButtonElement>("copy-code-btn");
  private lobbyStatus = getEl<HTMLElement>("lobby-status");
  private lobbyPlayerCount = getEl<HTMLElement>("lobby-player-count");

  private hostConfigPanel = getEl<HTMLElement>("host-config-panel");
  private impostersInput = getEl<HTMLInputElement>("imposters-input");
  private impostersValue = getEl<HTMLElement>("imposters-value");
  private impostersRecommendation = getEl<HTMLElement>(
    "imposters-recommendation",
  );
  private hostConfigNote = getEl<HTMLElement>("host-config-note");

  private playerNameInput = getEl<HTMLInputElement>("player-name-input");
  private lobbyPlayerList = getEl<HTMLElement>("lobby-player-list");
  private readyBtn = getEl<HTMLButtonElement>("ready-btn");
  private startMatchBtn = getEl<HTMLButtonElement>("start-match-btn");

  private gameHud = getEl<HTMLElement>("game-hud");
  private phasePill = getEl<HTMLElement>("phase-pill");
  private roundLabel = getEl<HTMLElement>("round-label");
  private timerLabel = getEl<HTMLElement>("timer-label");
  private spectatorNote = getEl<HTMLElement>("spectator-note");

  private countdownOverlay = getEl<HTMLElement>("countdown-overlay");
  private countdownTitle = getEl<HTMLElement>("countdown-title");
  private countdownNumber = getEl<HTMLElement>("countdown-number");

  private rolePanel = getEl<HTMLElement>("role-panel");
  private roleBadge = getEl<HTMLElement>("role-badge");
  private roleWord = getEl<HTMLElement>("role-word");
  private roleSubtitle = getEl<HTMLElement>("role-subtitle");
  private roleNote = getEl<HTMLElement>("role-note");
  private revealReadyBtn = getEl<HTMLButtonElement>("reveal-ready-btn");

  private cluePanel = getEl<HTMLElement>("clue-panel");
  private clueTurnName = getEl<HTMLElement>("clue-turn-name");
  private clueTurnSubtitle = getEl<HTMLElement>("clue-turn-subtitle");
  private clueInputArea = getEl<HTMLElement>("clue-input-area");
  private clueInput = getEl<HTMLInputElement>("clue-input");
  private clueFeed = getEl<HTMLElement>("clue-feed");
  private submitClueBtn = getEl<HTMLButtonElement>("submit-clue-btn");
  private clueGapInfo = getEl<HTMLElement>("clue-gap-info");

  private clueReveal = getEl<HTMLElement>("clue-reveal");
  private clueRevealHeader = getEl<HTMLElement>("clue-reveal-header");
  private clueRevealText = getEl<HTMLElement>("clue-reveal-text");
  private clueRevealReactions = getEl<HTMLElement>("clue-reveal-reactions");
  private clueReactionSummary = getEl<HTMLElement>("clue-reaction-summary");

  private discussionPanel = getEl<HTMLElement>("discussion-panel");
  private discussionCluesRef = getEl<HTMLElement>("discussion-clues-ref");
  private chatFeed = getEl<HTMLElement>("chat-feed");
  private chatInput = getEl<HTMLInputElement>("chat-input");
  private sendChatBtn = getEl<HTMLButtonElement>("send-chat-btn");
  private chatCounter = getEl<HTMLElement>("chat-counter");
  private endDiscussionBtn = getEl<HTMLButtonElement>("end-discussion-btn");
  private discussionRoster = getEl<HTMLElement>("discussion-roster");

  private votePanel = getEl<HTMLElement>("vote-panel");
  private voteSubtitle = getEl<HTMLElement>("vote-subtitle");
  private voteGrid = getEl<HTMLElement>("vote-grid");

  private resultPanel = getEl<HTMLElement>("result-panel");
  private resultEliminatedName = getEl<HTMLElement>("result-eliminated-name");
  private resultWinner = getEl<HTMLElement>("result-winner");
  private resultDetail = getEl<HTMLElement>("result-detail");
  private resultNextNote = getEl<HTMLElement>("result-next-note");
  private scoreboard = getEl<HTMLElement>("scoreboard");

  private matchPanel = getEl<HTMLElement>("match-panel");
  private matchSubtitle = getEl<HTMLElement>("match-subtitle");
  private matchWord = getEl<HTMLElement>("match-word");
  private matchScoreboard = getEl<HTMLElement>("match-scoreboard");
  private playAgainBtn = getEl<HTMLButtonElement>("play-again-btn");

  private settingsCloseBtn = getEl<HTMLButtonElement>("settings-close");
  private musicToggle = getEl<HTMLButtonElement>("toggle-music");
  private fxToggle = getEl<HTMLButtonElement>("toggle-fx");
  private hapticsToggle = getEl<HTMLButtonElement>("toggle-haptics");

  constructor() {
    log("ImposterGame.constructor", "Initializing in-room controller");
    this.abortController = new AbortController();
    this.settings = this.loadSettings();
    this.audio = new AudioEngine();

    this.setupSettingsListeners();
    this.setupLobbyListeners();
    this.setupGameListeners();
    this.setupPlayroomListeners();

    this.syncPlayerIdentity();
    this.ensureHostConfigState();
    this.startPolling();
    this.renderAll();
  }

  private loadSettings(): Settings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Settings;
        return {
          music: Boolean(parsed.music),
          fx: Boolean(parsed.fx),
          haptics: Boolean(parsed.haptics),
        };
      }
    } catch (error) {
      log(
        "ImposterGame.loadSettings",
        "Failed to load settings " + String(error),
      );
    }
    return { music: true, fx: true, haptics: true };
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (error) {
      log(
        "ImposterGame.saveSettings",
        "Failed to save settings " + String(error),
      );
    }
  }

  private setupSettingsListeners(): void {
    const signal = this.abortController.signal;
    settingsBtn.addEventListener(
      "click",
      () => {
        this.triggerHaptic("light");
        this.playFx("click");
        settingsModal.classList.remove("hidden");
      },
      { signal },
    );
    this.settingsCloseBtn.addEventListener(
      "click",
      () => {
        this.triggerHaptic("light");
        this.playFx("click");
        settingsModal.classList.add("hidden");
      },
      { signal },
    );
    settingsModal.addEventListener(
      "click",
      (event) => {
        if (event.target === settingsModal) {
          this.triggerHaptic("light");
          settingsModal.classList.add("hidden");
        }
      },
      { signal },
    );
    this.musicToggle.addEventListener(
      "click",
      () => {
        this.settings.music = !this.settings.music;
        this.applySettingsState();
        this.saveSettings();
        this.triggerHaptic("light");
        if (this.settings.music) {
          this.applyMusicForPhase();
        } else {
          this.audio.stopMusic();
        }
      },
      { signal },
    );
    this.fxToggle.addEventListener(
      "click",
      () => {
        this.settings.fx = !this.settings.fx;
        this.applySettingsState();
        this.saveSettings();
        this.triggerHaptic("light");
        this.playFx("click");
      },
      { signal },
    );
    this.hapticsToggle.addEventListener(
      "click",
      () => {
        this.settings.haptics = !this.settings.haptics;
        this.applySettingsState();
        this.saveSettings();
        if (typeof window.triggerHaptic === "function") {
          window.triggerHaptic("light");
        }
      },
      { signal },
    );
    this.applySettingsState();
  }

  private applySettingsState(): void {
    this.musicToggle.classList.toggle("active", this.settings.music);
    this.fxToggle.classList.toggle("active", this.settings.fx);
    this.hapticsToggle.classList.toggle("active", this.settings.haptics);
  }

  private setupLobbyListeners(): void {
    const signal = this.abortController.signal;
    this.copyCodeBtn.addEventListener(
      "click",
      () => {
        const code = getRoomCode();
        if (!code) {
          return;
        }
        void navigator.clipboard
          .writeText(code)
          .then(() => {
            this.triggerHaptic("light");
            this.playFx("click");
            this.copyCodeBtn.innerHTML =
              '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.41 1.41L9 19 21 7l-1.41-1.41Z"/></svg>';
            setTimeout(() => {
              this.copyCodeBtn.innerHTML =
                '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H5a2 2 0 0 0-2 2v12h2V3h11V1Zm3 4H9a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H9V7h10v14Z"/></svg>';
            }, 1200);
          })
          .catch((error) => {
            log(
              "setupLobbyListeners.copyCode",
              "Clipboard failed " + String(error),
            );
          });
      },
      { signal },
    );
    this.playerNameInput.addEventListener(
      "input",
      () => {
        if (this.nameDebounce) {
          clearTimeout(this.nameDebounce);
        }
        this.nameDebounce = setTimeout(() => {
          this.savePlayerName();
        }, 220);
      },
      { signal },
    );
    this.playerNameInput.addEventListener(
      "blur",
      () => {
        this.savePlayerName();
      },
      { signal },
    );
    this.readyBtn.addEventListener(
      "click",
      () => {
        this.triggerHaptic("light");
        this.playFx("click");
        this.toggleReady();
      },
      { signal },
    );
    this.startMatchBtn.addEventListener(
      "click",
      () => {
        this.triggerHaptic("medium");
        this.playFx("vote");
        this.startMatchIfHost();
      },
      { signal },
    );
    const configInputs = [this.impostersInput];
    for (const input of configInputs) {
      input.addEventListener(
        "input",
        () => {
          this.isInteractingWithConfig = true;
          this.onHostConfigInput();
        },
        { signal },
      );
      input.addEventListener(
        "pointerdown",
        () => {
          this.isInteractingWithConfig = true;
        },
        { signal },
      );
      input.addEventListener(
        "pointerup",
        () => {
          this.isInteractingWithConfig = false;
        },
        { signal },
      );
      input.addEventListener(
        "change",
        () => {
          this.isInteractingWithConfig = false;
        },
        { signal },
      );
    }
  }

  private setupGameListeners(): void {
    const signal = this.abortController.signal;
    this.revealReadyBtn.addEventListener(
      "click",
      () => {
        this.markRevealReady();
      },
      { signal },
    );
    this.submitClueBtn.addEventListener(
      "click",
      () => {
        this.submitClue();
      },
      { signal },
    );
    this.clueInput.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter") {
          this.submitClue();
        }
      },
      { signal },
    );
    this.sendChatBtn.addEventListener(
      "click",
      () => {
        this.submitChat();
      },
      { signal },
    );
    this.chatInput.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter") {
          this.submitChat();
        }
      },
      { signal },
    );
    this.endDiscussionBtn.addEventListener(
      "click",
      () => {
        this.toggleEndDiscussion();
      },
      { signal },
    );
    this.playAgainBtn.addEventListener(
      "click",
      () => {
        this.restartToLobby();
      },
      { signal },
    );
  }

  private setupPlayroomListeners(): void {
    const cleanupMaybe = onPlayerJoin((player) => {
      const alreadyExists = this.players.some(
        (entry) => entry.id === player.id,
      );
      if (!alreadyExists) {
        this.players.push(player);
      }
      log("setupPlayroomListeners.onPlayerJoin", "Player joined " + player.id);
      this.renderLobby();
      if (isHost()) {
        this.ensureHostConfigState();
      }
      player.onQuit(() => {
        log("setupPlayroomListeners.onQuit", "Player left " + player.id);
        this.players = this.players.filter((entry) => entry.id !== player.id);
        if (this.selectedVoteTarget === player.id) {
          this.selectedVoteTarget = "";
        }
        this.renderAll();
      });
    });
    const cleanupUnknown = cleanupMaybe as unknown;
    if (typeof cleanupUnknown === "function") {
      this.playerJoinCleanup = cleanupUnknown as () => void;
    }
  }

  private startPolling(): void {
    this.pollInterval = setInterval(() => {
      if (this.isDestroyed) {
        return;
      }
      this.pullState();
      this.renderAll();
      this.syncRoleCard();
      this.updateTimer();
      this.checkGapCountdown();
      this.submitScoreAtMatchEndIfNeeded();
    }, 120);

    this.hostTickInterval = setInterval(() => {
      if (this.isDestroyed || !isHost()) {
        return;
      }
      this.hostTick();
    }, 200);
  }

  private pullState(): void {
    const phase = (getState(STATE_KEYS.phase) as Phase | undefined) || "lobby";
    if (phase !== this.phase) {
      this.phase = phase;
      this.onPhaseChanged();
    }

    const config = getState(STATE_KEYS.config) as GameConfig | undefined;
    if (config) {
      this.config = this.sanitizeConfig(config);
    }

    this.hostId = String(getState(STATE_KEYS.hostId) || "");
    const round = (getState(STATE_KEYS.round) as number | undefined) || 1;
    this.round = Math.max(1, Math.floor(round));

    this.participants = (
      (getState(STATE_KEYS.participants) as string[] | undefined) || []
    ).slice();
    this.allParticipants = (
      (getState(STATE_KEYS.allParticipants) as string[] | undefined) || []
    ).slice();
    this.turnOrder = (
      (getState(STATE_KEYS.turnOrder) as string[] | undefined) || []
    ).slice();

    const newTurnIndex =
      (getState(STATE_KEYS.turnIndex) as number | undefined) !== undefined
        ? Math.max(0, Number(getState(STATE_KEYS.turnIndex) as number))
        : 0;
    this.turnIndex = newTurnIndex;

    this.phaseEndsAt =
      (getState(STATE_KEYS.phaseEndsAt) as number | undefined) || 0;
    this.clues = (
      (getState(STATE_KEYS.clues) as ClueEntry[] | undefined) || []
    ).slice();
    this.chat = (
      (getState(STATE_KEYS.chat) as ChatEntry[] | undefined) || []
    ).slice();
    this.reactions =
      (getState(STATE_KEYS.reactions) as Record<string, string> | undefined) ||
      {};
    this.result =
      (getState(STATE_KEYS.result) as RoundResult | null | undefined) || null;

    const newClueGap = getState(STATE_KEYS.clueGap) === true;
    if (newClueGap && !this._prevClueGap && this.phase === "clue") {
      this.onClueGapStarted();
    }
    if (!newClueGap && this._prevClueGap) {
      if (this._countdownActive) {
        this.cancelCountdown();
      }
      this._gapCountdownTriggered = false;
    }
    this._prevClueGap = newClueGap;
    this.clueGap = newClueGap;

    if (
      newTurnIndex !== this._prevTurnIndex &&
      this._prevTurnIndex >= 0 &&
      this.phase === "clue" &&
      !newClueGap
    ) {
      this.onNewClueTurnStarted();
    }
    this._prevTurnIndex = newTurnIndex;

    if (this.players.length === 0) {
      this.lobbyStatus.textContent = "Waiting for player sync...";
    }
  }

  private onClueGapStarted(): void {
    log("onClueGapStarted", "Clue gap started, showing clue reveal");
    this._gapCountdownTriggered = false;
  }

  private checkGapCountdown(): void {
    if (
      !this.clueGap ||
      this.phase !== "clue" ||
      this._gapCountdownTriggered ||
      this._countdownActive
    ) {
      return;
    }

    const remaining = Math.max(
      0,
      Math.ceil((this.phaseEndsAt - Date.now()) / 1000),
    );

    if (remaining <= GAP_COUNTDOWN_SECONDS) {
      this._gapCountdownTriggered = true;
      const nextIdx = this.turnIndex + 1;

      let title: string;
      if (nextIdx >= this.turnOrder.length) {
        title = "Discussion starts in";
      } else {
        const nextPlayer = this.players.find(
          (p) => p.id === this.turnOrder[nextIdx],
        );
        const nextName = nextPlayer
          ? this.getPlayerName(nextPlayer)
          : "Next player";
        title = nextName + " going next";
      }

      this.showCountdown(title, remaining, () => {});
    }
  }

  private onNewClueTurnStarted(): void {
    this.clueInput.value = "";
  }

  private showCountdown(
    title: string,
    seconds: number,
    onComplete: () => void,
  ): void {
    this.cancelCountdown();
    this._countdownActive = true;
    this._countdownCurrent = seconds;

    this.countdownTitle.textContent = title;
    this.countdownNumber.textContent = String(seconds);
    this.countdownOverlay.classList.remove("hidden");

    this.countdownNumber.classList.remove("pulse");
    void this.countdownNumber.offsetWidth;
    this.countdownNumber.classList.add("pulse");

    this.triggerHaptic("light");
    this.playFx("countdownTick");

    this._countdownTimer = setInterval(() => {
      this._countdownCurrent -= 1;

      if (this._countdownCurrent <= 0) {
        this.cancelCountdown();
        this.playFx("countdownGo");
        this.triggerHaptic("medium");
        onComplete();
        return;
      }

      this.countdownNumber.textContent = String(this._countdownCurrent);
      this.countdownNumber.classList.remove("pulse");
      void this.countdownNumber.offsetWidth;
      this.countdownNumber.classList.add("pulse");

      this.triggerHaptic("light");
      this.playFx("countdownTick");
    }, 1000);
  }

  private cancelCountdown(): void {
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
    this._countdownActive = false;
    this._countdownCurrent = 0;
    this.countdownOverlay.classList.add("hidden");
  }

  private onPhaseChanged(): void {
    log("onPhaseChanged", "Phase changed to " + this.phase);
    this.cancelCountdown();
    this._gapCountdownTriggered = false;

    this._lastCluesRefHtml = "";
    this._lastChatHtml = "";
    this._lastRosterHtml = "";
    this._lastVoteHtml = "";
    this._lastReactionsHtml = "";

    if (this.phase === "lobby") {
      this.myReadyState = false;
    }

    this.applyMusicForPhase();

    if (this.phase === "role_reveal") {
      this.selectedVoteTarget = "";
      this.playFx("reveal");
      this.triggerHaptic("medium");
    }

    if (this.phase === "clue") {
      this.selectedVoteTarget = "";
      this.clueInput.value = "";
      const title =
        this.round === 1 && this.turnIndex === 0
          ? "Game starts in"
          : "Round " + String(this.round) + " starts in";
      this.showCountdown(title, COUNTDOWN_SECONDS, () => {});
    }

    if (this.phase === "discussion") {
      this.myEndDiscussion = false;
      this.showCountdown("Discussion starts in", COUNTDOWN_SECONDS, () => {});
    }

    if (this.phase === "voting") {
      this.selectedVoteTarget = "";
      this.showCountdown("Voting starts in", COUNTDOWN_SECONDS, () => {});
    }

    if (this.phase === "round_result" && this.result) {
      const myRole = this.getMyRole();
      if (
        (this.result.winner === "members" && myRole === "member") ||
        (this.result.winner === "imposters" && myRole === "imposter")
      ) {
        this.playFx("win");
        this.triggerHaptic("success");
      } else {
        this.playFx("lose");
        this.triggerHaptic("error");
      }
    }

    if (this.phase === "match_end") {
      this.playFx("win");
      this.triggerHaptic("success");
    }
  }

  private applyMusicForPhase(): void {
    if (!this.settings.music) {
      this.audio.stopMusic();
      return;
    }
    if (this.phase === "lobby") {
      this.audio.startLobbyMusic();
      return;
    }
    if (
      this.phase === "role_reveal" ||
      this.phase === "clue" ||
      this.phase === "discussion" ||
      this.phase === "voting"
    ) {
      this.audio.startRoundMusic();
      return;
    }
    this.audio.stopMusic();
  }

  private syncPlayerIdentity(): void {
    const profile = myPlayer()?.getProfile();
    const injectedName = window.__PLAYER_NAME__;
    const fallbackName = injectedName || profile?.name || "Player";
    this.playerNameInput.value = fallbackName;
    this.myReadyState = false;
    const me = myPlayer();
    if (me) {
      me.setState(PLAYER_KEYS.customName, fallbackName, true);
      me.setState(PLAYER_KEYS.ready, false, true);
      me.setState(PLAYER_KEYS.score, 0, true);
    }
  }

  private savePlayerName(): void {
    const me = myPlayer();
    if (!me) {
      return;
    }
    const name = this.playerNameInput.value.trim().slice(0, 18);
    if (!name) {
      return;
    }
    this.playerNameInput.value = name;
    me.setState(PLAYER_KEYS.customName, name, true);
  }

  private toggleReady(): void {
    if (this.phase !== "lobby") {
      return;
    }
    const me = myPlayer();
    if (!me) {
      return;
    }
    this.myReadyState = !this.myReadyState;
    me.setState(PLAYER_KEYS.ready, this.myReadyState, true);
    this.readyBtn.textContent = this.myReadyState ? "Unready" : "Ready";
  }

  private onHostConfigInput(): void {
    if (!isHost() || this.phase !== "lobby") {
      this.applyConfigInputs();
      return;
    }
    const rawConfig: GameConfig = {
      ...this.config,
      imposters: Number(this.impostersInput.value),
    };
    const next = this.sanitizeConfig(rawConfig);
    this.config = next;
    setState(STATE_KEYS.config, next, true);
    this.applyConfigInputs();
    this.triggerHaptic("light");
  }

  private sanitizeConfig(input: GameConfig): GameConfig {
    const imposters = clamp(Math.floor(input.imposters), 1, 9);
    return { ...DEFAULT_CONFIG, ...input, imposters };
  }

  private ensureHostConfigState(): void {
    if (!isHost()) {
      return;
    }
    const current = getState(STATE_KEYS.config) as GameConfig | undefined;
    if (!current) {
      setState(STATE_KEYS.config, this.config, true);
    } else {
      this.config = this.sanitizeConfig(current);
    }
    const me = myPlayer();
    if (me && this.hostId !== me.id) {
      setState(STATE_KEYS.hostId, me.id, true);
    }
    const currentPhase = getState(STATE_KEYS.phase) as Phase | undefined;
    if (!currentPhase) {
      setState(STATE_KEYS.phase, "lobby", true);
      setState(STATE_KEYS.round, 1, true);
      setState(STATE_KEYS.participants, [], true);
      setState(STATE_KEYS.allParticipants, [], true);
      setState(STATE_KEYS.turnOrder, [], true);
      setState(STATE_KEYS.turnIndex, 0, true);
      setState(STATE_KEYS.clues, [], true);
      setState(STATE_KEYS.clueDone, false, true);
      setState(STATE_KEYS.clueGap, false, true);
      setState(STATE_KEYS.reactions, {}, true);
      setState(STATE_KEYS.chat, [], true);
      setState(STATE_KEYS.result, null, true);
      setState(STATE_KEYS.scoreboard, [], true);
      setState(STATE_KEYS.matchWinner, "", true);
      setState(STATE_KEYS.phaseEndsAt, 0, true);
    }
  }

  private startMatchIfHost(): void {
    if (!isHost() || this.phase !== "lobby") {
      return;
    }
    const livePlayers = [...this.players];
    if (livePlayers.length < 2) {
      return;
    }
    const myId = myPlayer()?.id || "";
    const allReady = livePlayers.every((player) =>
      player.id === myId
        ? this.myReadyState
        : player.getState(PLAYER_KEYS.ready) === true,
    );
    if (!allReady) {
      return;
    }
    const maxImposters = Math.max(1, Math.floor((livePlayers.length - 1) / 2));
    this.config = {
      ...this.sanitizeConfig(this.config),
      imposters: clamp(this.config.imposters, 1, maxImposters),
    };
    setState(STATE_KEYS.config, this.config, true);

    const participantIds = livePlayers.map((player) => player.id);
    this.participants = participantIds;
    this.allParticipants = participantIds.slice();
    this.round = 1;
    setState(STATE_KEYS.round, this.round, true);
    setState(STATE_KEYS.participants, participantIds, true);
    setState(STATE_KEYS.allParticipants, participantIds, true);

    for (const player of livePlayers) {
      player.setState(PLAYER_KEYS.score, 0, true);
      player.setState(PLAYER_KEYS.voteTarget, "", true);
      player.setState(PLAYER_KEYS.revealReady, false, true);
      player.setState(PLAYER_KEYS.endDiscussion, false, true);
    }
    this.assignRolesForRound();
  }

  private assignRolesForRound(): void {
    if (!isHost()) {
      return;
    }
    const players = this.getParticipantPlayers();
    if (players.length === 0) {
      return;
    }

    const shuffled = shuffle(players.map((player) => player.id));
    const imposterIds = new Set(shuffled.slice(0, this.config.imposters));
    const secretWord = randomFrom(WORD_BANK);

    for (const player of players) {
      const role: Role = imposterIds.has(player.id) ? "imposter" : "member";
      player.setState(PLAYER_KEYS.role, role, true);
      player.setState(
        PLAYER_KEYS.secretWord,
        role === "member" ? secretWord : "",
        true,
      );
      player.setState(PLAYER_KEYS.revealReady, false, true);
      player.setState(PLAYER_KEYS.voteTarget, "", true);
      player.setState(PLAYER_KEYS.endDiscussion, false, true);
    }

    setState(STATE_KEYS.turnOrder, [], true);
    setState(STATE_KEYS.turnIndex, 0, true);
    setState(STATE_KEYS.clues, [], true);
    setState(STATE_KEYS.clueDone, false, true);
    setState(STATE_KEYS.clueGap, false, true);
    setState(STATE_KEYS.reactions, {}, true);
    setState(STATE_KEYS.chat, [], true);
    setState(STATE_KEYS.result, null, true);
    setState(STATE_KEYS.matchWinner, "", true);

    this.setPhase("role_reveal", this.config.revealSeconds);
  }

  private setPhase(nextPhase: Phase, durationSeconds: number): void {
    const endsAt = Date.now() + durationSeconds * 1000;
    setState(STATE_KEYS.phase, nextPhase, true);
    setState(STATE_KEYS.phaseEndsAt, endsAt, true);
    this.phase = nextPhase;
    this.phaseEndsAt = endsAt;
    this.onPhaseChanged();
  }

  private startCluePhase(): void {
    if (!isHost()) {
      return;
    }
    const order = shuffle(this.participants.slice());
    setState(STATE_KEYS.turnOrder, order, true);
    setState(STATE_KEYS.turnIndex, 0, true);
    setState(STATE_KEYS.clues, [], true);
    setState(STATE_KEYS.clueDone, false, true);
    setState(STATE_KEYS.clueGap, false, true);
    setState(STATE_KEYS.reactions, {}, true);
    this.turnOrder = order;
    this.turnIndex = 0;
    this.clues = [];
    this.setPhase("clue", this.config.clueSeconds + COUNTDOWN_SECONDS);
  }

  private startDiscussionPhase(): void {
    if (!isHost()) {
      return;
    }
    setState(STATE_KEYS.chat, [], true);
    setState(STATE_KEYS.clueGap, false, true);
    setState(STATE_KEYS.reactions, {}, true);
    for (const player of this.getParticipantPlayers()) {
      player.setState(PLAYER_KEYS.endDiscussion, false, true);
    }
    this.setPhase(
      "discussion",
      this.config.discussionSeconds + COUNTDOWN_SECONDS,
    );
  }

  private startVotingPhase(): void {
    if (!isHost()) {
      return;
    }
    for (const player of this.getParticipantPlayers()) {
      player.setState(PLAYER_KEYS.voteTarget, "", true);
    }
    this.selectedVoteTarget = "";
    this.setPhase("voting", this.config.votingSeconds + COUNTDOWN_SECONDS);
  }

  private startClueGap(): void {
    if (!isHost()) {
      return;
    }
    setState(STATE_KEYS.clueDone, false, true);
    setState(STATE_KEYS.clueGap, true, true);
    setState(STATE_KEYS.reactions, {}, true);
    const gapEndsAt = Date.now() + this.config.clueGapSeconds * 1000;
    setState(STATE_KEYS.phaseEndsAt, gapEndsAt, true);
    this.phaseEndsAt = gapEndsAt;
  }

  private endRoundAndPrepareNext(): void {
    if (!isHost() || !this.result) {
      return;
    }

    if (this.result.winner === "tied") {
      this.round += 1;
      setState(STATE_KEYS.round, this.round, true);
      const participantPlayers = this.getParticipantPlayers();
      for (const player of participantPlayers) {
        player.setState(PLAYER_KEYS.voteTarget, "", true);
        player.setState(PLAYER_KEYS.endDiscussion, false, true);
      }
      this.startCluePhase();
      return;
    }

    const eliminatedId = this.result.eliminatedId;
    const nextParticipants = this.participants.filter(
      (id) => id !== eliminatedId,
    );
    setState(STATE_KEYS.participants, nextParticipants, true);
    this.participants = nextParticipants;

    const participantPlayers = this.players.filter((p) =>
      nextParticipants.includes(p.id),
    );
    let imposterCount = 0;
    let memberCount = 0;
    for (const player of participantPlayers) {
      const role = String(player.getState(PLAYER_KEYS.role) || "member");
      if (role === "imposter") {
        imposterCount += 1;
      } else {
        memberCount += 1;
      }
    }

    if (imposterCount === 0) {
      setState(STATE_KEYS.matchWinner, "members", true);
      this.finishMatch();
      return;
    }
    if (memberCount <= 1 && imposterCount > 0) {
      setState(STATE_KEYS.matchWinner, "imposters", true);
      this.finishMatch();
      return;
    }

    this.round += 1;
    setState(STATE_KEYS.round, this.round, true);
    for (const player of participantPlayers) {
      player.setState(PLAYER_KEYS.voteTarget, "", true);
      player.setState(PLAYER_KEYS.endDiscussion, false, true);
    }
    this.startCluePhase();
  }

  private finishMatch(): void {
    if (!isHost()) {
      return;
    }
    const standings = this.buildScoreEntries();
    setState(STATE_KEYS.scoreboard, standings, true);
    setState(STATE_KEYS.phase, "match_end", true);
    setState(STATE_KEYS.phaseEndsAt, 0, true);
  }

  private restartToLobby(): void {
    if (!isHost()) {
      return;
    }
    this.triggerHaptic("light");
    this.playFx("click");
    this.myReadyState = false;
    for (const player of this.players) {
      player.setState(PLAYER_KEYS.ready, false, true);
      player.setState(PLAYER_KEYS.score, 0, true);
      player.setState(PLAYER_KEYS.role, "", true);
      player.setState(PLAYER_KEYS.secretWord, "", true);
      player.setState(PLAYER_KEYS.revealReady, false, true);
      player.setState(PLAYER_KEYS.voteTarget, "", true);
      player.setState(PLAYER_KEYS.endDiscussion, false, true);
    }
    this.hasSubmittedScore = false;
    this.myEndDiscussion = false;
    setState(STATE_KEYS.phase, "lobby", true);
    setState(STATE_KEYS.round, 1, true);
    setState(STATE_KEYS.participants, [], true);
    setState(STATE_KEYS.allParticipants, [], true);
    setState(STATE_KEYS.turnOrder, [], true);
    setState(STATE_KEYS.turnIndex, 0, true);
    setState(STATE_KEYS.clues, [], true);
    setState(STATE_KEYS.clueDone, false, true);
    setState(STATE_KEYS.clueGap, false, true);
    setState(STATE_KEYS.reactions, {}, true);
    setState(STATE_KEYS.chat, [], true);
    setState(STATE_KEYS.result, null, true);
    setState(STATE_KEYS.scoreboard, [], true);
    setState(STATE_KEYS.matchWinner, "", true);
    setState(STATE_KEYS.phaseEndsAt, 0, true);
  }

  private hostTick(): void {
    const me = myPlayer();
    if (me && this.hostId !== me.id) {
      setState(STATE_KEYS.hostId, me.id, true);
    }
    const now = Date.now();

    if (this.phase === "role_reveal") {
      const players = this.getParticipantPlayers();
      if (players.length === 0) {
        return;
      }
      const allReady = players.every(
        (player) => player.getState(PLAYER_KEYS.revealReady) === true,
      );
      if (allReady || now >= this.phaseEndsAt) {
        this.startCluePhase();
      }
      return;
    }

    if (this.phase === "clue") {
      if (this.turnOrder.length === 0) {
        this.startCluePhase();
        return;
      }
      if (this.turnIndex >= this.turnOrder.length) {
        this.startDiscussionPhase();
        return;
      }

      const isGap = getState(STATE_KEYS.clueGap) === true;

      if (isGap) {
        if (now >= this.phaseEndsAt) {
          this.advanceClueTurn();
        }
        return;
      }

      const clueDone = getState(STATE_KEYS.clueDone) === true;
      if (clueDone) {
        this.startClueGap();
        return;
      }

      if (now >= this.phaseEndsAt) {
        const currentPlayerId = this.turnOrder[this.turnIndex];
        const alreadyHasClue = this.clues.some(
          (entry) =>
            entry.round === this.round && entry.playerId === currentPlayerId,
        );
        if (!alreadyHasClue) {
          const autoClue: ClueEntry = {
            playerId: currentPlayerId,
            clue: "No clue",
            round: this.round,
            auto: true,
          };
          setState(STATE_KEYS.clues, [...this.clues, autoClue], true);
        }
        this.startClueGap();
      }
      return;
    }

    if (this.phase === "discussion") {
      const participants = this.getParticipantPlayers();
      const allEnded =
        participants.length > 0 &&
        participants.every(
          (player) => player.getState(PLAYER_KEYS.endDiscussion) === true,
        );
      if (allEnded || now >= this.phaseEndsAt) {
        this.startVotingPhase();
      }
      return;
    }

    if (this.phase === "voting") {
      if (now >= this.phaseEndsAt) {
        this.finalizeVoting();
      }
      return;
    }

    if (this.phase === "round_result") {
      if (now >= this.phaseEndsAt) {
        this.endRoundAndPrepareNext();
      }
    }
  }

  private advanceClueTurn(): void {
    if (!isHost()) {
      return;
    }
    const nextIndex = this.turnIndex + 1;
    if (nextIndex >= this.turnOrder.length) {
      this.startDiscussionPhase();
      return;
    }
    const nextEndsAt = Date.now() + this.config.clueSeconds * 1000;
    setState(STATE_KEYS.turnIndex, nextIndex, true);
    setState(STATE_KEYS.phaseEndsAt, nextEndsAt, true);
    setState(STATE_KEYS.clueDone, false, true);
    setState(STATE_KEYS.clueGap, false, true);
    setState(STATE_KEYS.reactions, {}, true);
    this.turnIndex = nextIndex;
    this.phaseEndsAt = nextEndsAt;
  }

  private finalizeVoting(): void {
    if (!isHost()) {
      return;
    }
    const participants = this.getParticipantPlayers();
    if (participants.length === 0) {
      return;
    }

    const counts: Record<string, number> = {};
    for (const player of participants) {
      const target = String(player.getState(PLAYER_KEYS.voteTarget) || "");
      if (!target) {
        continue;
      }
      counts[target] = (counts[target] || 0) + 1;
    }

    let maxVotes = 0;
    let tiedCandidates: string[] = [];
    for (const [playerId, voteCount] of Object.entries(counts)) {
      if (voteCount > maxVotes) {
        maxVotes = voteCount;
        tiedCandidates = [playerId];
      } else if (voteCount === maxVotes) {
        tiedCandidates.push(playerId);
      }
    }

    const isTied =
      maxVotes === 0 ||
      tiedCandidates.length === 0 ||
      tiedCandidates.length > 1;

    if (isTied) {
      const result: RoundResult = {
        round: this.round,
        winner: "tied",
        eliminatedId: "",
        eliminatedName: "",
        eliminatedRole: "member",
        voteCounts: counts,
      };
      setState(STATE_KEYS.result, result, true);
      this.setPhase("round_result", TIED_RESULT_SECONDS);
      return;
    }

    const eliminatedId = tiedCandidates[0];
    const eliminatedPlayer =
      participants.find((player) => player.id === eliminatedId) ||
      participants[0];
    const eliminatedRoleRaw = String(
      eliminatedPlayer.getState(PLAYER_KEYS.role) || "member",
    );
    const eliminatedRole: Role =
      eliminatedRoleRaw === "imposter" ? "imposter" : "member";
    const winner: "members" | "imposters" =
      eliminatedRole === "imposter" ? "members" : "imposters";

    for (const player of participants) {
      const roleRaw = String(player.getState(PLAYER_KEYS.role) || "member");
      const role: Role = roleRaw === "imposter" ? "imposter" : "member";
      const currentScore = Number(player.getState(PLAYER_KEYS.score) || 0);
      let delta = 0;
      if (winner === "members" && role === "member") {
        delta = 1;
      }
      if (winner === "imposters" && role === "imposter") {
        delta = 2;
      }
      player.setState(PLAYER_KEYS.score, currentScore + delta, true);
    }

    const result: RoundResult = {
      round: this.round,
      winner,
      eliminatedId,
      eliminatedName: this.getPlayerName(eliminatedPlayer),
      eliminatedRole,
      voteCounts: counts,
    };
    setState(STATE_KEYS.result, result, true);
    this.setPhase("round_result", this.config.resultSeconds);
  }

  private markRevealReady(): void {
    if (this.phase !== "role_reveal" || !this.isMyParticipant()) {
      return;
    }
    const me = myPlayer();
    if (!me) {
      return;
    }
    me.setState(PLAYER_KEYS.revealReady, true, true);
    this.triggerHaptic("medium");
    this.playFx("reveal");
  }

  private submitClue(): void {
    if (this.phase !== "clue" || !this.isMyParticipant() || this.clueGap) {
      return;
    }
    const me = myPlayer();
    if (!me) {
      return;
    }
    const turnPlayerId = this.turnOrder[this.turnIndex] || "";
    if (turnPlayerId !== me.id) {
      return;
    }

    const clue = this.clueInput.value.trim().slice(0, 48);
    if (!clue) {
      this.triggerHaptic("error");
      return;
    }

    const existingIndex = this.clues.findIndex(
      (entry) => entry.round === this.round && entry.playerId === me.id,
    );
    const nextEntry: ClueEntry = {
      playerId: me.id,
      clue,
      round: this.round,
      auto: false,
    };
    let nextClues: ClueEntry[];
    if (existingIndex >= 0) {
      nextClues = this.clues.slice();
      nextClues[existingIndex] = nextEntry;
    } else {
      nextClues = [...this.clues, nextEntry];
    }
    setState(STATE_KEYS.clues, nextClues, true);
    setState(STATE_KEYS.clueDone, true, true);

    this.triggerHaptic("light");
    this.playFx("click");
  }

  private submitReaction(reaction: ReactionType): void {
    if (this.phase !== "clue" || !this.isMyParticipant() || !this.clueGap) {
      return;
    }
    const me = myPlayer();
    if (!me) {
      return;
    }

    const currentPlayerId = this.turnOrder[this.turnIndex] || "";
    if (currentPlayerId === me.id) {
      return;
    }

    const currentReaction = this.reactions[me.id] || "";
    const nextReactions = { ...this.reactions };

    if (currentReaction === reaction) {
      delete nextReactions[me.id];
    } else {
      nextReactions[me.id] = reaction;
    }

    setState(STATE_KEYS.reactions, nextReactions, true);
    this.triggerHaptic("light");
    this.playFx("click");
  }

  private submitChat(): void {
    if (this.phase !== "discussion" || !this.isMyParticipant()) {
      return;
    }
    const me = myPlayer();
    if (!me) {
      return;
    }
    const myMessages = this.chat.filter(
      (entry) => entry.round === this.round && entry.playerId === me.id,
    );
    if (myMessages.length >= 3) {
      this.triggerHaptic("error");
      return;
    }
    const message = this.chatInput.value.trim().slice(0, 120);
    if (!message) {
      this.triggerHaptic("error");
      return;
    }
    const nextEntry: ChatEntry = {
      playerId: me.id,
      message,
      round: this.round,
    };
    setState(STATE_KEYS.chat, [...this.chat, nextEntry], true);
    this.chatInput.value = "";
    this.triggerHaptic("light");
    this.playFx("click");
  }

  private toggleEndDiscussion(): void {
    if (this.phase !== "discussion" || !this.isMyParticipant()) {
      return;
    }
    const me = myPlayer();
    if (!me) {
      return;
    }
    this.myEndDiscussion = !this.myEndDiscussion;
    me.setState(PLAYER_KEYS.endDiscussion, this.myEndDiscussion, true);
    this.triggerHaptic("light");
    this.playFx("click");
  }

  private renderAll(): void {
    if (this.isDestroyed) {
      return;
    }
    this.renderRoomHeader();
    this.renderLobby();
    this.renderGame();
  }

  private renderRoomHeader(): void {
    const code = getRoomCode();
    if (code) {
      this.roomCodeDisplay.textContent = code;
    }
  }

  private renderLobby(): void {
    this.applyConfigInputs();
    this.lobbyPlayerCount.textContent =
      String(this.players.length) + "/" + String(MAX_PLAYERS);
    const me = myPlayer();
    const myId = me?.id || "";
    this.readyBtn.textContent = this.myReadyState ? "Unready" : "Ready";
    const canHostControl = isHost() && this.phase === "lobby";
    this.impostersInput.disabled = !canHostControl;
    this.startMatchBtn.disabled = !canHostControl;
    this.hostConfigPanel.style.opacity = canHostControl ? "1" : "0.75";

    this.lobbyPlayerList.innerHTML = this.players
      .map((player) => {
        const name = this.escapeHtml(this.getPlayerName(player));
        const isMe = player.id === myId;
        const ready = isMe
          ? this.myReadyState
          : player.getState(PLAYER_KEYS.ready) === true;
        const host = this.hostId === player.id;
        const statusParts: string[] = [];
        if (host) {
          statusParts.push("Host");
        }
        if (isMe) {
          statusParts.push("You");
        }
        if (!ready) {
          statusParts.push("Not ready");
        }
        return (
          '<li class="lobby-player-item"><div class="player-label"><span class="player-dot ' +
          (ready ? "ready" : "") +
          '"></span><span class="player-name">' +
          name +
          '</span></div><div class="player-meta">' +
          this.escapeHtml(statusParts.join(" / ")) +
          "</div></li>"
        );
      })
      .join("");

    if (this.phase !== "lobby") {
      this.lobbyStatus.textContent = "Match in progress";
      this.startMatchBtn.disabled = true;
      return;
    }
    if (isHost()) {
      const readyCount = this.players.filter((player) =>
        player.id === myId
          ? this.myReadyState
          : player.getState(PLAYER_KEYS.ready) === true,
      ).length;
      if (this.players.length < 2) {
        this.lobbyStatus.textContent = "Need at least 2 players to start";
        this.startMatchBtn.disabled = true;
      } else if (readyCount < this.players.length) {
        this.lobbyStatus.textContent = "Waiting for all players to ready up";
        this.startMatchBtn.disabled = true;
      } else {
        this.lobbyStatus.textContent = "All set. Start the match when ready.";
        this.startMatchBtn.disabled = false;
      }
      this.hostConfigNote.textContent =
        "Set number of imposters. Supports up to " +
        String(MAX_PLAYERS) +
        " players.";
    } else {
      this.lobbyStatus.textContent = "Waiting for host to start";
      this.hostConfigNote.textContent = "Only host can update match settings.";
      this.startMatchBtn.disabled = true;
    }
  }

  private renderGame(): void {
    const inLobby = this.phase === "lobby";
    lobbyScreen.classList.toggle("hidden", !inLobby);
    gameScreen.classList.toggle("hidden", inLobby);
    if (inLobby) {
      return;
    }

    this.roundLabel.textContent = "Round " + String(this.round);
    this.phasePill.textContent = this.formatPhaseLabel(this.phase);
    this.spectatorNote.classList.toggle("hidden", this.isMyParticipant());

    this.rolePanel.classList.add("hidden");
    this.cluePanel.classList.add("hidden");
    this.discussionPanel.classList.add("hidden");
    this.votePanel.classList.add("hidden");
    this.resultPanel.classList.add("hidden");
    this.matchPanel.classList.add("hidden");

    if (this._countdownActive) {
      return;
    }

    if (this.phase === "role_reveal") {
      this.rolePanel.classList.remove("hidden");
      this.renderRolePanel();
    } else if (this.phase === "clue") {
      this.cluePanel.classList.remove("hidden");
      this.renderCluePanel();
    } else if (this.phase === "discussion") {
      this.discussionPanel.classList.remove("hidden");
      this.renderDiscussionPanel();
    } else if (this.phase === "voting") {
      this.votePanel.classList.remove("hidden");
      this.renderVotePanel();
    } else if (this.phase === "round_result") {
      this.resultPanel.classList.remove("hidden");
      this.renderResultPanel();
    } else if (this.phase === "match_end") {
      this.matchPanel.classList.remove("hidden");
      this.renderMatchPanel();
    }
  }

  private renderRolePanel(): void {
    const role = this.getMyRole();
    const secretWord = this.getMySecretWord();
    const me = myPlayer();
    const acknowledged = me?.getState(PLAYER_KEYS.revealReady) === true;

    if (!this.isMyParticipant()) {
      this.roleBadge.textContent = "Spectator";
      this.roleBadge.classList.remove("member", "imposter");
      this.roleWord.textContent = "Waiting for next round";
      this.roleSubtitle.textContent = "This round is already in progress.";
      this.roleNote.textContent =
        "You will join automatically when the next round starts.";
      this.revealReadyBtn.disabled = true;
      this.revealReadyBtn.textContent = "Spectating";
      return;
    }

    const isImposter = role === "imposter";
    this.roleBadge.textContent = isImposter ? "Imposter" : "Member";
    this.roleBadge.classList.toggle("imposter", isImposter);
    this.roleBadge.classList.toggle("member", !isImposter);
    this.roleWord.textContent = isImposter
      ? "You get no word"
      : secretWord || "...";
    this.roleSubtitle.textContent = isImposter
      ? "Blend in during clues and avoid detection."
      : "Share one subtle clue without saying the word.";
    this.roleNote.textContent = "Keep this card private from other players.";
    this.revealReadyBtn.disabled = acknowledged;
    this.revealReadyBtn.textContent = acknowledged ? "Ready" : "I Understand";
  }

  private _lastReactionsHtml = "";

  private renderCluePanel(): void {
    const currentPlayerId = this.turnOrder[this.turnIndex] || "";
    const currentPlayer = this.players.find(
      (player) => player.id === currentPlayerId,
    );
    const currentName = currentPlayer
      ? this.getPlayerName(currentPlayer)
      : "Waiting";

    const me = myPlayer();
    const isMyTurn = Boolean(me && me.id === currentPlayerId);
    const canType = this.isMyParticipant() && isMyTurn && !this.clueGap;

    if (this.clueGap) {
      this.clueInputArea.classList.add("hidden");
      this.clueReveal.classList.remove("hidden");

      const currentClue = this.clues.find(
        (entry) =>
          entry.round === this.round && entry.playerId === currentPlayerId,
      );
      const clueText = currentClue ? currentClue.clue : "No clue";

      if (isMyTurn) {
        this.clueTurnName.textContent = "You";
        this.clueRevealHeader.textContent = "Your Clue is:";
      } else {
        this.clueTurnName.textContent = currentName;
        this.clueRevealHeader.textContent =
          this.escapeHtml(currentName) + "'s Clue is:";
      }
      this.clueTurnSubtitle.textContent = "";
      this.clueRevealText.textContent = '"' + clueText + '"';

      const myReaction = me ? String(this.reactions[me.id] || "") : "";
      const canReact = this.isMyParticipant() && !isMyTurn;

      const reactionCounts: Record<string, number> = {};
      for (const r of REACTION_TYPES) {
        reactionCounts[r] = 0;
      }
      for (const val of Object.values(this.reactions)) {
        if (reactionCounts[val] !== undefined) {
          reactionCounts[val] += 1;
        }
      }

      const reactionsHtml = REACTION_TYPES.map((r) => {
        const selected = myReaction === r ? " selected" : "";
        const disabledAttr = canReact ? "" : " disabled";
        const count = reactionCounts[r] || 0;
        return (
          '<button class="reaction-btn' +
          selected +
          '" data-reaction="' +
          r +
          '"' +
          disabledAttr +
          ">" +
          REACTION_SVGS[r] +
          '<span class="reaction-count">' +
          (count > 0 ? String(count) : REACTION_LABELS[r]) +
          "</span></button>"
        );
      }).join("");

      if (reactionsHtml !== this._lastReactionsHtml) {
        this.clueRevealReactions.innerHTML = reactionsHtml;
        this._lastReactionsHtml = reactionsHtml;

        if (canReact) {
          const btns = Array.from(
            this.clueRevealReactions.querySelectorAll(".reaction-btn"),
          );
          for (const btn of btns) {
            btn.addEventListener("click", () => {
              const r = btn.getAttribute("data-reaction") as ReactionType;
              if (r) {
                this.submitReaction(r);
                this._lastReactionsHtml = "";
              }
            });
          }
        }
      }

      const totalReactions = Object.keys(this.reactions).length;
      this.clueReactionSummary.textContent =
        totalReactions > 0
          ? String(totalReactions) +
            " reaction" +
            (totalReactions > 1 ? "s" : "")
          : "";

      const nextIdx = this.turnIndex + 1;
      if (nextIdx < this.turnOrder.length) {
        const nextPlayer = this.players.find(
          (p) => p.id === this.turnOrder[nextIdx],
        );
        const nextName = nextPlayer
          ? this.getPlayerName(nextPlayer)
          : "Next player";
        this.clueGapInfo.textContent = "Next up: " + nextName;
      } else {
        this.clueGapInfo.textContent = "Discussion up next";
      }
      this.clueGapInfo.classList.remove("hidden");
    } else {
      this.clueReveal.classList.add("hidden");
      this.clueGapInfo.classList.add("hidden");
      this.clueInputArea.classList.toggle("hidden", !canType);

      if (isMyTurn) {
        this.clueTurnName.textContent = "Your Turn";
        this.clueTurnSubtitle.textContent = "Give a one-word clue";
      } else {
        this.clueTurnName.textContent = currentName;
        this.clueTurnSubtitle.textContent = "is thinking of a clue...";
      }

      this.clueInput.disabled = !canType;
      this.submitClueBtn.disabled = !canType;
      this.clueInput.placeholder = canType ? "Type one short clue" : "";
    }

    const clueFeedHtml = this.clues
      .filter((entry) => entry.round === this.round)
      .map((entry) => {
        const player = this.players.find(
          (candidate) => candidate.id === entry.playerId,
        );
        const name = player ? this.getPlayerName(player) : "Player";
        const clueText = this.escapeHtml(entry.clue);
        const marker = entry.auto ? " (auto)" : "";
        return (
          '<li class="clue-item"><span class="clue-name">' +
          this.escapeHtml(name) +
          '</span>"' +
          clueText +
          '"' +
          this.escapeHtml(marker) +
          "</li>"
        );
      })
      .join("");

    if (this.clueFeed.innerHTML !== clueFeedHtml) {
      this.clueFeed.innerHTML = clueFeedHtml;
    }
  }

  private _lastCluesRefHtml = "";
  private _lastChatHtml = "";
  private _lastRosterHtml = "";

  private renderDiscussionPanel(): void {
    const cluesRefHtml = this.clues
      .filter((entry) => entry.round === this.round)
      .map((entry) => {
        const player = this.players.find(
          (candidate) => candidate.id === entry.playerId,
        );
        const name = player ? this.getPlayerName(player) : "Player";
        return (
          '<li class="clue-ref-item"><span class="clue-name">' +
          this.escapeHtml(name) +
          "</span>" +
          this.escapeHtml(entry.clue) +
          "</li>"
        );
      })
      .join("");

    if (cluesRefHtml !== this._lastCluesRefHtml) {
      this.discussionCluesRef.innerHTML = cluesRefHtml;
      this._lastCluesRefHtml = cluesRefHtml;
    }

    const roundChat = this.chat.filter((entry) => entry.round === this.round);
    const chatHtml = roundChat
      .map((entry) => {
        const player = this.players.find(
          (candidate) => candidate.id === entry.playerId,
        );
        const name = player ? this.getPlayerName(player) : "Player";
        const isMe = entry.playerId === myPlayer()?.id;
        return (
          '<div class="chat-bubble' +
          (isMe ? " mine" : "") +
          '"><span class="chat-author">' +
          this.escapeHtml(name) +
          '</span><span class="chat-text">' +
          this.escapeHtml(entry.message) +
          "</span></div>"
        );
      })
      .join("");

    if (chatHtml !== this._lastChatHtml) {
      this.chatFeed.innerHTML = chatHtml;
      this._lastChatHtml = chatHtml;
      if (this.chatFeed.scrollHeight > this.chatFeed.clientHeight) {
        this.chatFeed.scrollTop = this.chatFeed.scrollHeight;
      }
    }

    const me = myPlayer();
    const myMsgCount = roundChat.filter(
      (entry) => entry.playerId === me?.id,
    ).length;
    const remaining = 3 - myMsgCount;
    this.chatCounter.textContent = String(remaining) + "/3 left";
    this.chatInput.disabled = !this.isMyParticipant() || remaining <= 0;
    this.sendChatBtn.disabled = !this.isMyParticipant() || remaining <= 0;
    this.chatInput.placeholder =
      remaining <= 0 ? "No messages left" : "Type a message...";

    const endDiscBtn = this.endDiscussionBtn;
    const meEndDisc = me?.getState(PLAYER_KEYS.endDiscussion) === true;
    this.myEndDiscussion = meEndDisc;
    endDiscBtn.classList.toggle("active", meEndDisc);
    endDiscBtn.textContent = meEndDisc
      ? "Return to Discussion"
      : "End Discussion";
    endDiscBtn.disabled = !this.isMyParticipant();

    const participantPlayers = this.getParticipantPlayers();
    const rosterHtml = participantPlayers
      .map((player) => {
        const name = this.escapeHtml(this.getPlayerName(player));
        const ended = player.getState(PLAYER_KEYS.endDiscussion) === true;
        const isMe = player.id === me?.id;
        return (
          '<div class="roster-item' +
          (ended ? " ended" : "") +
          (isMe ? " me" : "") +
          '"><span class="roster-dot' +
          (ended ? " done" : "") +
          '"></span><span class="roster-name">' +
          name +
          "</span></div>"
        );
      })
      .join("");

    if (rosterHtml !== this._lastRosterHtml) {
      this.discussionRoster.innerHTML = rosterHtml;
      this._lastRosterHtml = rosterHtml;
    }
  }

  private _lastVoteHtml = "";

  private renderVotePanel(): void {
    const me = myPlayer();
    if (!this.isMyParticipant()) {
      this.voteSubtitle.textContent = "You are spectating this round.";
    } else {
      this.voteSubtitle.textContent =
        "Tap a player to select. Your vote is final when the timer ends.";
    }

    const allParticipants = this.getParticipantPlayers();
    const liveCounts: Record<string, number> = {};
    for (const player of allParticipants) {
      const target = String(player.getState(PLAYER_KEYS.voteTarget) || "");
      if (target) {
        liveCounts[target] = (liveCounts[target] || 0) + 1;
      }
    }

    const voteOptions = allParticipants.filter(
      (player) => player.id !== me?.id,
    );
    const voteHtml = voteOptions
      .map((player) => {
        const selected = this.selectedVoteTarget === player.id;
        const selectedClass = selected ? " selected" : "";
        const lockedClass = !this.isMyParticipant() ? " locked" : "";
        const count = liveCounts[player.id] || 0;
        const countBadge =
          count > 0
            ? '<span class="vote-count-badge">' + String(count) + "</span>"
            : "";
        return (
          '<button class="vote-card' +
          selectedClass +
          lockedClass +
          '" data-player-id="' +
          this.escapeHtml(player.id) +
          '"><span class="vote-card-name">' +
          this.escapeHtml(this.getPlayerName(player)) +
          "</span>" +
          countBadge +
          (selected ? '<span class="vote-check-icon"></span>' : "") +
          "</button>"
        );
      })
      .join("");

    if (voteHtml !== this._lastVoteHtml) {
      this.voteGrid.innerHTML = voteHtml;
      this._lastVoteHtml = voteHtml;
      const cards = Array.from(this.voteGrid.querySelectorAll(".vote-card"));
      for (const card of cards) {
        card.addEventListener("click", () => {
          if (!this.isMyParticipant()) {
            return;
          }
          const target = card.getAttribute("data-player-id") || "";
          this.selectedVoteTarget = target;
          const mePlayer = myPlayer();
          if (mePlayer) {
            mePlayer.setState(PLAYER_KEYS.voteTarget, target, true);
          }
          this.triggerHaptic("light");
          this.playFx("click");
          this._lastVoteHtml = "";
          this.renderVotePanel();
        });
      }
    }
  }

  private renderResultPanel(): void {
    if (!this.result) {
      this.resultEliminatedName.textContent = "";
      this.resultWinner.textContent = "Waiting for result";
      this.resultDetail.textContent = "Calculating...";
      this.scoreboard.innerHTML = "";
      return;
    }

    const isTied = this.result.winner === "tied";

    this.resultEliminatedName.classList.toggle("tied-name", isTied);
    this.resultWinner.classList.toggle(
      "member",
      this.result.winner === "members",
    );
    this.resultWinner.classList.toggle(
      "imposter",
      this.result.winner === "imposters",
    );
    this.resultWinner.classList.toggle("tied", isTied);

    if (isTied) {
      this.resultEliminatedName.textContent = "No One Was Eliminated";
      this.resultWinner.textContent = "Votes were tied";
      this.resultDetail.textContent =
        "Nobody received the most votes. A new round will start soon...";
      this.resultNextNote.textContent = "Next round starting soon...";
    } else {
      this.resultEliminatedName.textContent = this.result.eliminatedName;
      this.resultWinner.textContent =
        this.result.winner === "members"
          ? "Members win this round"
          : "Imposters win this round";
      this.resultDetail.textContent =
        this.result.eliminatedName +
        " was voted out and revealed as " +
        (this.result.eliminatedRole === "imposter" ? "Imposter" : "Member") +
        ".";
      this.resultNextNote.textContent = "Next round preparing...";
    }

    const scoreHtml = this.buildScoreEntries()
      .map((entry) => {
        const mine = entry.playerId === myPlayer()?.id;
        const eliminated =
          !isTied &&
          !this.participants.includes(entry.playerId) &&
          this.result?.eliminatedId === entry.playerId;
        return (
          '<li class="score-item' +
          (mine ? " me" : "") +
          (eliminated ? " eliminated" : "") +
          '"><span>' +
          this.escapeHtml(entry.name) +
          (eliminated ? " (out)" : "") +
          "</span><strong>" +
          String(entry.score) +
          "</strong></li>"
        );
      })
      .join("");
    if (this.scoreboard.innerHTML !== scoreHtml) {
      this.scoreboard.innerHTML = scoreHtml;
    }
  }

  private renderMatchPanel(): void {
    const scoreboardState =
      (getState(STATE_KEYS.scoreboard) as ScoreEntry[] | undefined) ||
      this.buildScoreEntries();
    const matchWinner = String(getState(STATE_KEYS.matchWinner) || "");

    if (matchWinner === "members") {
      this.matchSubtitle.textContent = "Members Win!";
      this.matchSubtitle.classList.add("member-win");
      this.matchSubtitle.classList.remove("imposter-win");
    } else if (matchWinner === "imposters") {
      this.matchSubtitle.textContent = "Imposters Win!";
      this.matchSubtitle.classList.add("imposter-win");
      this.matchSubtitle.classList.remove("member-win");
    } else {
      this.matchSubtitle.textContent = "Match Over";
      this.matchSubtitle.classList.remove("member-win", "imposter-win");
    }

    const memberPlayer = this.players.find(
      (p) =>
        this.allParticipants.includes(p.id) &&
        String(p.getState(PLAYER_KEYS.role) || "") === "member",
    );
    const secretWord = memberPlayer
      ? String(memberPlayer.getState(PLAYER_KEYS.secretWord) || "???")
      : "???";
    this.matchWord.textContent = "The secret word was: " + secretWord;

    const sorted = scoreboardState
      .slice()
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    this.matchScoreboard.innerHTML = sorted
      .map((entry, index) => {
        const mine = entry.playerId === myPlayer()?.id;
        return (
          '<li class="score-item' +
          (mine ? " me" : "") +
          '"><span>' +
          String(index + 1) +
          ". " +
          this.escapeHtml(entry.name) +
          "</span><strong>" +
          String(entry.score) +
          "</strong></li>"
        );
      })
      .join("");
    this.playAgainBtn.disabled = !isHost();
  }

  private buildScoreEntries(): ScoreEntry[] {
    const idsToShow =
      this.allParticipants.length > 0
        ? this.allParticipants
        : this.participants;
    const idSet = new Set(idsToShow);
    return this.players
      .filter((player) => idSet.has(player.id))
      .map((player) => {
        const roleRaw = String(player.getState(PLAYER_KEYS.role) || "");
        const role: Role | "none" =
          roleRaw === "imposter" || roleRaw === "member" ? roleRaw : "none";
        return {
          playerId: player.id,
          name: this.getPlayerName(player),
          score: Number(player.getState(PLAYER_KEYS.score) || 0),
          role,
        };
      })
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  private updateTimer(): void {
    if (!this.phaseEndsAt || this.phase === "match_end") {
      this.timerLabel.textContent = "--";
      return;
    }
    const totalSeconds = Math.max(
      0,
      Math.ceil((this.phaseEndsAt - Date.now()) / 1000),
    );
    if (totalSeconds >= 60) {
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      this.timerLabel.textContent =
        String(mins) + ":" + (secs < 10 ? "0" : "") + String(secs);
    } else {
      this.timerLabel.textContent = String(totalSeconds) + "s";
    }
  }

  private syncRoleCard(): void {
    if (this.phase !== "role_reveal") {
      return;
    }
    const me = myPlayer();
    if (!me || !this.isMyParticipant()) {
      return;
    }
    const role = this.getMyRole();
    const word = this.getMySecretWord();
    if (role === "imposter") {
      this.roleBadge.textContent = "Imposter";
      this.roleWord.textContent = "You get no word";
    }
    if (role === "member") {
      this.roleBadge.textContent = "Member";
      this.roleWord.textContent = word || "...";
    }
  }

  private getRecommendedImposters(playerCount: number): number {
    if (playerCount <= 4) return 1;
    if (playerCount <= 6) return 1;
    if (playerCount <= 8) return 2;
    if (playerCount <= 10) return 2;
    if (playerCount <= 13) return 3;
    if (playerCount <= 16) return 3;
    return 4;
  }

  private applyConfigInputs(): void {
    this.impostersValue.textContent = String(this.config.imposters);
    const playerCount = this.players.length;
    const rec = this.getRecommendedImposters(playerCount);
    const maxAllowed = Math.max(1, Math.floor((playerCount - 1) / 2));
    if (playerCount < 2) {
      this.impostersRecommendation.textContent =
        "Recommended: " +
        String(rec) +
        " imposter for " +
        String(playerCount) +
        " players";
    } else {
      this.impostersRecommendation.textContent =
        "Recommended: " +
        String(rec) +
        (rec === 1 ? " imposter" : " imposters") +
        " for " +
        String(playerCount) +
        " players (max " +
        String(maxAllowed) +
        ")";
    }
    if (this.isInteractingWithConfig) {
      return;
    }
    this.impostersInput.value = String(this.config.imposters);
  }

  private formatPhaseLabel(phase: Phase): string {
    if (phase === "role_reveal") {
      return "Role Reveal";
    }
    if (phase === "round_result") {
      return "Round Result";
    }
    if (phase === "match_end") {
      return "Match End";
    }
    if (phase === "clue") {
      return "Clues";
    }
    if (phase === "discussion") {
      return "Discussion";
    }
    if (phase === "voting") {
      return "Voting";
    }
    return "Lobby";
  }

  private getParticipantPlayers(): PlayerState[] {
    if (this.participants.length === 0) {
      return [];
    }
    const idSet = new Set(this.participants);
    return this.players.filter((player) => idSet.has(player.id));
  }

  private isMyParticipant(): boolean {
    const me = myPlayer();
    if (!me) {
      return false;
    }
    if (this.phase === "lobby") {
      return true;
    }
    return this.participants.includes(me.id);
  }

  private getMyRole(): Role {
    const me = myPlayer();
    if (!me) {
      return "member";
    }
    const raw = String(me.getState(PLAYER_KEYS.role) || "member");
    return raw === "imposter" ? "imposter" : "member";
  }

  private getMySecretWord(): string {
    const me = myPlayer();
    if (!me) {
      return "";
    }
    return String(me.getState(PLAYER_KEYS.secretWord) || "");
  }

  private getPlayerName(player: PlayerState): string {
    const custom = String(player.getState(PLAYER_KEYS.customName) || "").trim();
    const profile = player.getProfile();
    if (custom) {
      return custom;
    }
    if (profile?.name) {
      return profile.name;
    }
    return "Player " + player.id.slice(0, 4).toUpperCase();
  }

  private escapeHtml(raw: string): string {
    const div = document.createElement("div");
    div.textContent = raw;
    return div.innerHTML;
  }

  private triggerHaptic(type: HapticType): void {
    if (!this.settings.haptics) {
      return;
    }
    if (typeof window.triggerHaptic === "function") {
      window.triggerHaptic(type);
    }
  }

  private playFx(
    kind:
      | "click"
      | "reveal"
      | "vote"
      | "win"
      | "lose"
      | "countdownTick"
      | "countdownGo",
  ): void {
    if (!this.settings.fx) {
      return;
    }
    if (kind === "click") {
      this.audio.playClick();
      return;
    }
    if (kind === "reveal") {
      this.audio.playReveal();
      return;
    }
    if (kind === "vote") {
      this.audio.playVoteLock();
      return;
    }
    if (kind === "win") {
      this.audio.playWin();
      return;
    }
    if (kind === "countdownTick") {
      this.audio.playCountdownTick();
      return;
    }
    if (kind === "countdownGo") {
      this.audio.playCountdownGo();
      return;
    }
    this.audio.playLose();
  }

  private submitScoreAtMatchEndIfNeeded(): void {
    if (this.phase !== "match_end" || this.hasSubmittedScore) {
      return;
    }
    const me = myPlayer();
    if (!me) {
      return;
    }
    const rawScore = Number(me.getState(PLAYER_KEYS.score) || 0);
    const finalScore = Math.max(0, Math.floor(rawScore));
    log(
      "submitScoreAtMatchEndIfNeeded",
      "Submitting score " + String(finalScore),
    );
    if (typeof window.submitScore === "function") {
      window.submitScore(finalScore);
    }
    this.hasSubmittedScore = true;
  }

  public destroy(): void {
    log("destroy", "Destroying game controller");
    this.isDestroyed = true;
    this.abortController.abort();
    this.audio.stopMusic();
    this.cancelCountdown();
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.hostTickInterval) {
      clearInterval(this.hostTickInterval);
      this.hostTickInterval = null;
    }
    if (this.nameDebounce) {
      clearTimeout(this.nameDebounce);
      this.nameDebounce = null;
    }
    if (this.playerJoinCleanup) {
      this.playerJoinCleanup();
      this.playerJoinCleanup = null;
    }
    settingsModal.classList.add("hidden");
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function randomFrom<T>(items: T[]): T {
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

async function init(): Promise<void> {
  setupStartScreen();
  showStartScreen();

  if (window.__ROOM_CODE__) {
    log("init", "Auto joining injected room " + window.__ROOM_CODE__);
    await connectToRoom(window.__ROOM_CODE__);
    return;
  }

  const urlRoomCode = getRoomCodeFromURL();
  if (urlRoomCode) {
    log("init", "Joining room from URL " + urlRoomCode);
    await connectToRoom(urlRoomCode);
  }
}

void init();
