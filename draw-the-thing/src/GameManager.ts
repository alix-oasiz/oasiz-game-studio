import {
  isHost,
  myPlayer,
  onPlayerJoin,
  getState,
  setState,
  getRoomCode,
  PlayerState,
} from "playroomkit";
import { oasiz } from "@oasiz/sdk";
import * as Tone from "tone";
import { WORDS } from "./words";
import { DrawingCanvas } from "./DrawingCanvas";
import { PlayerBar } from "./PlayerBar";
import { ChatArea } from "./ChatArea";

const ROUND_DURATION = 60;
const ROUND_END_DELAY = 4000;
const MIN_PLAYERS_TO_START = 1; // Set to 1 for testing, 2 for production

type GamePhase = "lobby" | "playing" | "round_end";

interface Settings {
  fx: boolean;
  music: boolean;
  haptics: boolean;
}

// SVG icons for lobby
const USER_ICON = `<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
const CROWN_ICON = `<svg viewBox="0 0 24 24"><path d="M5 16L3 6l5.5 4L12 4l3.5 6L21 6l-2 10H5z"/></svg>`;

export class GameManager {
  private players: PlayerState[] = [];
  private drawingCanvas: DrawingCanvas | null = null;
  private playerBar: PlayerBar | null = null;
  private chatArea: ChatArea | null = null;

  private currentWord: string = "";
  private playerDrawingId: string = "";
  private timer: number = ROUND_DURATION;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private gamePhase: GamePhase = "lobby";
  private settings: Settings;
  private hostId: string = "";

  // Background music
  private bgMusic: HTMLAudioElement;

  // Sound effects
  private guessSynth: Tone.Synth;
  private correctSynth: Tone.PolySynth;
  private wrongSynth: Tone.Synth;
  private winSynth: Tone.PolySynth;
  private loseSynth: Tone.Synth;
  private drawSynth: Tone.Synth;

  // DOM Elements
  private gameContainer: HTMLElement;
  private lobbyScreen: HTMLElement;
  private roundEndOverlay: HTMLElement;
  private headerTitle: HTMLElement;
  private wordDisplay: HTMLElement;
  private timerDisplay: HTMLElement;
  private revealedWord: HTMLElement;
  private settingsBtn: HTMLElement;
  private settingsModal: HTMLElement;
  private lobbyPlayersList: HTMLElement;
  private playerCountEl: HTMLElement;
  private roomCodeDisplay: HTMLElement;
  private startGameBtn: HTMLElement;
  private lobbyStatus: HTMLElement;
  private playerNameInput: HTMLInputElement;

  constructor() {
    console.log("[GameManager] Initializing...");

    // Load settings from localStorage
    this.settings = this.loadSettings();

    // Initialize background music
    this.bgMusic = new Audio(
      "https://assets.oasiz.ai/audio/soundscrate-plucky-walk.mp3",
    );
    this.bgMusic.loop = true;
    this.bgMusic.volume = 0.3;

    // Initialize sound effects
    // Guess submit sound - soft click
    this.guessSynth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.005, decay: 0.05, sustain: 0, release: 0.05 },
    }).toDestination();
    this.guessSynth.volume.value = -10;

    // Correct guess - cheerful chime
    this.correctSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.3 },
    }).toDestination();
    this.correctSynth.volume.value = -8;

    // Wrong guess - soft thud
    this.wrongSynth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 },
    }).toDestination();
    this.wrongSynth.volume.value = -12;

    // Win sound - triumphant fanfare
    this.winSynth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0.2, release: 0.5 },
    }).toDestination();
    this.winSynth.volume.value = -6;

    // Lose sound - sad descending
    this.loseSynth = new Tone.Synth({
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.4 },
    }).toDestination();
    this.loseSynth.volume.value = -10;

    // Draw sound - soft brush
    this.drawSynth = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.02, sustain: 0, release: 0.02 },
    }).toDestination();
    this.drawSynth.volume.value = -20;

    // Get DOM elements
    this.gameContainer = document.getElementById("game-container")!;
    this.lobbyScreen = document.getElementById("lobby-screen")!;
    this.roundEndOverlay = document.getElementById("round-end-overlay")!;
    this.headerTitle = document.getElementById("header-title")!;
    this.wordDisplay = document.getElementById("word-display")!;
    this.timerDisplay = document.getElementById("timer")!;
    this.revealedWord = document.getElementById("revealed-word")!;
    this.settingsBtn = document.getElementById("settings-btn")!;
    this.settingsModal = document.getElementById("settings-modal")!;
    this.lobbyPlayersList = document.getElementById("lobby-players-list")!;
    this.playerCountEl = document.getElementById("player-count")!;
    this.roomCodeDisplay = document.getElementById("room-code-display")!;
    this.startGameBtn = document.getElementById("start-game-btn")!;
    this.lobbyStatus = document.getElementById("lobby-status")!;
    this.playerNameInput = document.getElementById(
      "player-name-input",
    ) as HTMLInputElement;

    // Setup UI event listeners
    this.setupLobbyListeners();
    this.setupSettingsListeners();

    // Set up player join listener
    onPlayerJoin((player) => {
      console.log("[GameManager] Player joined:", player.id, "isHost:", isHost());
      this.players.push(player);

      // Track the host
      if (isHost()) {
        this.hostId = myPlayer()?.id || player.id;
      }

      this.updateLobbyUI();
      this.updateHostUI(); // Re-check host status when players join

      player.onQuit(() => {
        console.log("[GameManager] Player left:", player.id);
        this.players = this.players.filter((p) => p.id !== player.id);

        // Handle host leaving during game
        if (this.gamePhase === "playing") {
          this.playerBar?.updatePlayers(this.players);
          this.checkForNextTurn();
        } else {
          this.updateLobbyUI();
        }

        // If we're the new host, update UI
        if (isHost()) {
          this.hostId = myPlayer()?.id || "";
          this.updateHostUI();
        }
      });
    });

    // Start listening for state changes
    this.setupStateListeners();

    // Show lobby
    this.showLobby();
  }

  private loadSettings(): Settings {
    try {
      const saved = localStorage.getItem("draw-the-thing-settings");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.log("[GameManager] Could not load settings");
    }
    return { fx: true, music: true, haptics: true };
  }

  private saveSettings(): void {
    try {
      localStorage.setItem(
        "draw-the-thing-settings",
        JSON.stringify(this.settings),
      );
    } catch (e) {
      console.log("[GameManager] Could not save settings");
    }
  }

  private setupLobbyListeners(): void {
    // Room code copy button
    const copyBtn = document.getElementById("copy-code-btn");
    copyBtn?.addEventListener("click", () => {
      const code = getRoomCode();
      if (code) {
        navigator.clipboard.writeText(code).then(() => {
          this.triggerHaptic("light");
          // Visual feedback
          copyBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="#22c55e"/></svg>`;
          setTimeout(() => {
            copyBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;
          }, 2000);
        });
      }
    });

    // Player name input - debounced to avoid spamming
    let nameTimeout: ReturnType<typeof setTimeout> | null = null;
    this.playerNameInput.addEventListener("input", () => {
      const name = this.playerNameInput.value.trim();
      if (name && myPlayer()) {
        // Debounce to avoid spamming state updates
        if (nameTimeout) clearTimeout(nameTimeout);
        nameTimeout = setTimeout(() => {
          // Store custom name in player state with reliable=true for sync
          myPlayer()!.setState("customName", name, true);
          console.log("[GameManager] Name updated:", name);
        }, 300);
      }
    });

    // Also handle blur to save name immediately
    this.playerNameInput.addEventListener("blur", () => {
      const name = this.playerNameInput.value.trim();
      if (name && myPlayer()) {
        if (nameTimeout) clearTimeout(nameTimeout);
        myPlayer()!.setState("customName", name, true);
        console.log("[GameManager] Name saved on blur:", name);
      }
    });

    // Load injected name if available
    if (oasiz.playerName) {
      this.playerNameInput.value = oasiz.playerName;
    }

    // Start game button (host only)
    this.startGameBtn.addEventListener("click", () => {
      if (!isHost()) return;

      const playerCount = this.players.length;
      if (playerCount < MIN_PLAYERS_TO_START) {
        console.log("[GameManager] Not enough players to start");
        return;
      }

      this.triggerHaptic("medium");
      this.startGame();
    });
  }

  private setupSettingsListeners(): void {
    // Settings button
    this.settingsBtn.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.settingsModal.classList.add("active");
    });

    // Close settings
    const closeBtn = document.getElementById("settings-close");
    closeBtn?.addEventListener("click", () => {
      this.triggerHaptic("light");
      this.settingsModal.classList.remove("active");
    });

    // Toggle FX
    const toggleFx = document.getElementById("toggle-fx");
    if (toggleFx) {
      toggleFx.classList.toggle("active", this.settings.fx);
      toggleFx.addEventListener("click", () => {
        this.settings.fx = !this.settings.fx;
        toggleFx.classList.toggle("active", this.settings.fx);
        this.saveSettings();
        this.triggerHaptic("light");
      });
    }

    // Toggle Music
    const toggleMusic = document.getElementById("toggle-music");
    if (toggleMusic) {
      toggleMusic.classList.toggle("active", this.settings.music);
      toggleMusic.addEventListener("click", () => {
        this.settings.music = !this.settings.music;
        toggleMusic.classList.toggle("active", this.settings.music);
        this.saveSettings();
        this.triggerHaptic("light");

        // Play or pause music
        if (this.settings.music && this.gamePhase === "playing") {
          this.bgMusic
            .play()
            .catch((e) => console.log("[GameManager] Audio play failed:", e));
        } else {
          this.bgMusic.pause();
        }
      });
    }

    // Toggle Haptics
    const toggleHaptics = document.getElementById("toggle-haptics");
    if (toggleHaptics) {
      toggleHaptics.classList.toggle("active", this.settings.haptics);
      toggleHaptics.addEventListener("click", () => {
        this.settings.haptics = !this.settings.haptics;
        toggleHaptics.classList.toggle("active", this.settings.haptics);
        this.saveSettings();
        // Always trigger this one so user can feel the toggle
        oasiz.triggerHaptic("light");
      });
    }
  }

  private setupStateListeners(): void {
    // Poll for state changes
    setInterval(() => {
      // Check for game phase changes (from host)
      const newPhase = getState("gamePhase") as GamePhase;
      if (newPhase && newPhase !== this.gamePhase) {
        this.gamePhase = newPhase;
        this.onGamePhaseChanged();
      }

      // Only process game state if we're playing
      if (this.gamePhase !== "playing") return;

      const newWord = getState("currentWord") as string;
      const newDrawer = getState("playerDrawing") as string;
      const newTimer = getState("timer") as number;
      const picture = (getState("drawingData") as string) || (getState("picture") as string);
      const guesses =
        (getState("guesses") as Array<{ playerId: string; guess: string }>) ||
        [];

      if (newWord && newWord !== this.currentWord) {
        this.currentWord = newWord;
        this.updateWordDisplay();
      }

      if (newDrawer && newDrawer !== this.playerDrawingId) {
        this.playerDrawingId = newDrawer;
        this.onDrawerChanged();
      }

      if (newTimer !== undefined && newTimer !== this.timer) {
        this.timer = newTimer;
        this.updateTimerDisplay();
      }

      if (picture && !this.amIDrawing()) {
        this.drawingCanvas?.displayImage(picture);
      }

      if (guesses) {
        this.chatArea?.updateGuesses(guesses, this.players);

        // Host checks if all guessers have guessed (polling for player state changes)
        if (isHost()) {
          this.checkForNextTurn();
        }
      }

      // Update player bar for guessed states
      this.playerBar?.updatePlayers(this.players);
    }, 100);
  }

  private showLobby(): void {
    this.gamePhase = "lobby";
    this.lobbyScreen.classList.remove("hidden");
    this.gameContainer.style.display = "none";
    this.roundEndOverlay.classList.remove("active");
    this.settingsBtn.style.display = "flex";

    // Pause music in lobby
    this.bgMusic.pause();

    // Display room code
    const code = getRoomCode();
    if (code) {
      this.roomCodeDisplay.textContent = code;
    }

    // Set name from profile or injected
    const profile = myPlayer()?.getProfile();
    if (oasiz.playerName) {
      this.playerNameInput.value = oasiz.playerName;
      myPlayer()?.setState("customName", oasiz.playerName, true);
    } else if (profile?.name) {
      this.playerNameInput.value = profile.name;
      // Also sync the profile name as custom name
      myPlayer()?.setState("customName", profile.name, true);
    }

    this.updateLobbyUI();
    this.updateHostUI();

    // Re-check host status after a short delay (Playroom may need time to determine host)
    setTimeout(() => {
      this.updateHostUI();
      this.updateLobbyUI();
    }, 500);

    // Start polling for lobby updates (player states change, new joins, etc.)
    this.startLobbyPolling();
  }

  private lobbyPollingInterval: ReturnType<typeof setInterval> | null = null;

  private startLobbyPolling(): void {
    // Stop any existing polling
    this.stopLobbyPolling();

    // Poll every 500ms for lobby updates
    this.lobbyPollingInterval = setInterval(() => {
      if (this.gamePhase === "lobby") {
        this.updateLobbyUI();
        this.updateHostUI();
      } else {
        this.stopLobbyPolling();
      }
    }, 500);
  }

  private stopLobbyPolling(): void {
    if (this.lobbyPollingInterval) {
      clearInterval(this.lobbyPollingInterval);
      this.lobbyPollingInterval = null;
    }
  }

  private updateLobbyUI(): void {
    // Update player count
    this.playerCountEl.textContent = `${this.players.length}/8`;


    // Update players list
    this.lobbyPlayersList.innerHTML = this.players
      .map((player) => {
        const profile = player.getProfile();
        const customName = player.getState("customName") as string;
        const displayName = customName || profile?.name || "Player";
        const hasPhoto = profile?.photo;
        const isMe = player.id === myPlayer()?.id;
        const isPlayerHost = isHost() && player.id === myPlayer()?.id;

        const avatarClasses = [
          "lobby-player-avatar",
          isPlayerHost ? "is-host" : "",
          isMe ? "is-me" : "",
        ]
          .filter(Boolean)
          .join(" ");

        const hostBadge = isPlayerHost
          ? `<div class="host-badge">${CROWN_ICON}</div>`
          : "";

        const avatarContent = hasPhoto
          ? `<img src="${profile.photo}" alt="${displayName}">`
          : USER_ICON;

        return `
        <div class="lobby-player">
          <div class="${avatarClasses}">
            ${avatarContent}
            ${hostBadge}
          </div>
          <div class="lobby-player-name">${this.escapeHtml(displayName)}</div>
        </div>
      `;
      })
      .join("");
  }

  private updateHostUI(): void {
    if (isHost()) {
      // Show start button for host
      this.startGameBtn.style.display = "block";

      // Update status message
      const canStart = this.players.length >= MIN_PLAYERS_TO_START;
      if (canStart) {
        this.lobbyStatus.innerHTML = `<span>Ready to start!</span>`;
        this.lobbyStatus.classList.remove("waiting");
        this.startGameBtn.removeAttribute("disabled");
      } else {
        this.lobbyStatus.innerHTML = `
          <span>Need at least ${MIN_PLAYERS_TO_START} player(s)</span>
          <div class="waiting-dots">
            <div class="waiting-dot"></div>
            <div class="waiting-dot"></div>
            <div class="waiting-dot"></div>
          </div>
        `;
        this.lobbyStatus.classList.add("waiting");
        this.startGameBtn.setAttribute("disabled", "true");
      }
    } else {
      // Hide start button for non-host
      this.startGameBtn.style.display = "none";
      this.lobbyStatus.innerHTML = `
        <span>Waiting for host to start</span>
        <div class="waiting-dots">
          <div class="waiting-dot"></div>
          <div class="waiting-dot"></div>
          <div class="waiting-dot"></div>
        </div>
      `;
      this.lobbyStatus.classList.add("waiting");
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  private startGame(): void {
    if (!isHost()) return;

    console.log("[GameManager] Host starting game...");

    // Set game phase to playing (all clients will receive this)
    setState("gamePhase", "playing", true);
  }

  private onGamePhaseChanged(): void {
    console.log("[GameManager] Game phase changed to:", this.gamePhase);

    switch (this.gamePhase) {
      case "lobby":
        this.showLobby();
        break;
      case "playing":
        this.showGame();
        break;
      case "round_end":
        this.showRoundEnd();
        break;
    }
  }

  private showGame(): void {
    console.log("[GameManager] Showing game...");

    // Initialize game components if not already
    if (!this.drawingCanvas) {
      this.drawingCanvas = new DrawingCanvas(this);
    }
    if (!this.playerBar) {
      this.playerBar = new PlayerBar(this);
    }
    if (!this.chatArea) {
      this.chatArea = new ChatArea(this);
    }

    // Hide lobby, show game
    this.lobbyScreen.classList.add("hidden");
    this.gameContainer.style.display = "flex";
    this.roundEndOverlay.classList.remove("active");

    // Start background music if enabled
    if (this.settings.music) {
      this.bgMusic
        .play()
        .catch((e) => console.log("[GameManager] Audio play failed:", e));
    }

    // Update player bar
    this.playerBar.updatePlayers(this.players);

    // Host starts the first round
    if (isHost()) {
      this.startNewRound();
    }
  }

  private startNewRound(): void {
    if (!isHost()) return;

    console.log("[GameManager] Starting new round...");

    // Pick a random word
    const randomWord = WORDS[Math.floor(Math.random() * WORDS.length)];
    setState("currentWord", randomWord, true);

    // Pick next drawer (or first player if none)
    const currentDrawerIndex = this.players.findIndex(
      (p) => p.id === this.playerDrawingId,
    );
    const nextDrawerIndex = (currentDrawerIndex + 1) % this.players.length;
    const nextDrawer = this.players[nextDrawerIndex];

    if (nextDrawer) {
      setState("playerDrawing", nextDrawer.id, true);
    }

    // Reset timer
    setState("timer", ROUND_DURATION, true);

    // Clear picture and guesses
    setState("picture", null, true);
    setState("guesses", [], true);

    // Reset all players' guessed state
    this.players.forEach((player) => {
      player.setState("guessed", false, true);
    });
  }

  private onDrawerChanged(): void {
    const amIDrawing = this.amIDrawing();

    console.log("[GameManager] Drawer changed. Am I drawing?", amIDrawing);

    // Update layout based on role
    if (amIDrawing) {
      this.gameContainer.classList.add("is-drawer");
    } else {
      this.gameContainer.classList.remove("is-drawer");
    }

    // Update UI
    this.drawingCanvas?.setDrawingMode(amIDrawing);
    this.chatArea?.setDisabled(amIDrawing || this.hasGuessedCorrectly());
    this.updateWordDisplay();

    // Clear canvas for drawer
    if (amIDrawing) {
      this.drawingCanvas?.clear();
      this.startLocalTimer();
      this.triggerHaptic("medium");
    } else {
      this.stopLocalTimer();
    }
  }

  private startLocalTimer(): void {
    this.stopLocalTimer();

    this.timerInterval = setInterval(() => {
      if (isHost()) {
        const currentTimer = (getState("timer") as number) || 0;
        if (currentTimer > 0) {
          setState("timer", currentTimer - 1, true);

          // Sync the picture
          const imageData = this.drawingCanvas?.getImageData();
          if (imageData) {
            setState("picture", imageData, true);
          }
        } else {
          this.endRound();
        }
      }
    }, 1000);
  }

  private stopLocalTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private updateWordDisplay(): void {
    const amIDrawing = this.amIDrawing();
    const hasGuessed = this.hasGuessedCorrectly();

    if (amIDrawing) {
      this.headerTitle.textContent = "Your turn to draw!";
      this.wordDisplay.textContent = this.currentWord.toUpperCase();
    } else if (hasGuessed) {
      this.headerTitle.textContent = "You got it!";
      this.wordDisplay.textContent = this.currentWord.toUpperCase();
    } else {
      this.headerTitle.textContent = "Guess the word!";
      // Show underscores for unguessed word
      this.wordDisplay.textContent = this.currentWord
        .split("")
        .map((c) => (c === " " ? "  " : "_"))
        .join(" ");
    }
  }

  private updateTimerDisplay(): void {
    this.timerDisplay.textContent = String(this.timer);
    if (this.timer <= 10) {
      this.timerDisplay.classList.add("urgent");
    } else {
      this.timerDisplay.classList.remove("urgent");
    }
  }

  private showRoundEnd(): void {
    this.revealedWord.textContent = this.currentWord.toUpperCase();

    // Get elements
    const titleEl = document.getElementById("round-end-title");
    const winnerSection = document.getElementById("winner-section");
    const winnerPlayersEl = document.getElementById("winner-players");

    // Find players who guessed correctly
    const winners = this.players.filter((p) => p.getState("guessed") === true);

    if (winners.length > 0) {
      // Someone won!
      if (titleEl) {
        titleEl.textContent = "🎉 Nice!";
        titleEl.classList.add("winner");
      }

      if (winnerSection) {
        winnerSection.style.display = "block";
      }

      if (winnerPlayersEl) {
        winnerPlayersEl.innerHTML = winners
          .map((player) => {
            const profile = player.getProfile();
            const customName = player.getState("customName") as string;
            const displayName = customName || profile?.name || "Player";
            const score = (player.getState("score") as number) || 0;
            const hasPhoto = profile?.photo;

            const avatarContent = hasPhoto
              ? `<img src="${profile.photo}" alt="${displayName}">`
              : `<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;

            return `
              <div class="winner-player">
                <div class="winner-avatar">${avatarContent}</div>
                <div class="winner-name">${this.escapeHtml(displayName)}</div>
                <div class="winner-score">+1 (${score} total)</div>
              </div>
            `;
          })
          .join("");
      }

      // Success haptic and sound for winners
      if (this.hasGuessedCorrectly()) {
        this.triggerHaptic("success");
        this.playWinSound();
      } else if (!this.amIDrawing()) {
        this.triggerHaptic("error");
        this.playLoseSound();
      }
    } else {
      // No one guessed
      if (titleEl) {
        titleEl.textContent = "TIME'S UP!";
        titleEl.classList.remove("winner");
      }
      // Everyone loses if no one guessed
      if (!this.amIDrawing()) {
        this.playLoseSound();
      }

      if (winnerSection) {
        winnerSection.style.display = "none";
      }

      // Trigger error haptic for everyone except drawer
      if (!this.amIDrawing()) {
        this.triggerHaptic("error");
      }
    }

    this.roundEndOverlay.classList.add("active");
  }

  private endRound(): void {
    if (!isHost()) return;

    console.log("[GameManager] Ending round...");
    this.stopLocalTimer();
    setState("gamePhase", "round_end", true);

    // Wait and then start next round
    setTimeout(() => {
      this.startNewRound();
      setState("gamePhase", "playing", true);
    }, ROUND_END_DELAY);
  }

  private checkForNextTurn(): void {
    // Only host manages round transitions
    if (!isHost()) return;

    // Don't check during round end transition
    if (this.gamePhase !== "playing") return;

    const drawer = this.players.find((p) => p.id === this.playerDrawingId);
    if (!drawer) {
      // Drawer left, start new round
      console.log("[GameManager] Drawer left, starting new round");
      this.startNewRound();
      return;
    }

    // Get all players who are NOT the drawer (these are guessers)
    const guessers = this.players.filter((p) => p.id !== this.playerDrawingId);

    // If there are no guessers (only 1 player), don't end
    if (guessers.length === 0) return;

    // Check how many have guessed correctly
    const guessedPlayers = guessers.filter((p) => p.getState("guessed") === true);
    const allGuessed = guessedPlayers.length === guessers.length;

    if (allGuessed) {
      // Everyone guessed correctly! End round early
      console.log(
        "[GameManager] All guessers done!",
        guessedPlayers.length,
        "/",
        guessers.length,
      );
      this.endRound();
    }
  }

  // Public methods for components
  public submitGuess(guess: string): void {
    if (this.amIDrawing() || this.hasGuessedCorrectly()) return;

    console.log("[GameManager] Submitting guess:", guess);

    // Play guess sound
    this.playGuessSound();

    const currentGuesses =
      (getState("guesses") as Array<{ playerId: string; guess: string }>) || [];
    const newGuesses = [...currentGuesses, { playerId: myPlayer()!.id, guess }];
    setState("guesses", newGuesses, true);

    // Check if correct
    if (this.isCorrectGuess(guess)) {
      myPlayer()!.setState("guessed", true, true);

      // Award score
      const currentScore = (myPlayer()!.getState("score") as number) || 0;
      const newScore = currentScore + 1;
      myPlayer()!.setState("score", newScore, true);

      // Submit score to platform
      this.submitScore(newScore);
      this.triggerHaptic("success");
      this.playCorrectSound();

      // Check if everyone has guessed
      this.checkForNextTurn();
    } else {
      this.triggerHaptic("light");
      this.playWrongSound();
    }
  }

  public isCorrectGuess(guess: string): boolean {
    return guess.toLowerCase().trim() === this.currentWord.toLowerCase().trim();
  }

  public amIDrawing(): boolean {
    return this.playerDrawingId === myPlayer()?.id;
  }

  public hasGuessedCorrectly(): boolean {
    return myPlayer()?.getState("guessed") === true;
  }

  public getPlayerDrawingId(): string {
    return this.playerDrawingId;
  }

  public getCurrentWord(): string {
    return this.currentWord;
  }

  public getSettings(): Settings {
    return this.settings;
  }

  // Platform integration
  private submitScore(score: number): void {
    console.log("[GameManager] Submitting score:", score);
    oasiz.submitScore(score);
  }

  public triggerHaptic(
    type: "light" | "medium" | "heavy" | "success" | "error",
  ): void {
    if (this.settings.haptics) {
      oasiz.triggerHaptic(type);
    }
  }

  // Sound effects
  private async ensureToneStarted(): Promise<void> {
    if (Tone.getContext().state !== "running") {
      await Tone.start();
    }
  }

  public async playGuessSound(): Promise<void> {
    if (!this.settings.fx) return;
    await this.ensureToneStarted();
    this.guessSynth.triggerAttackRelease("C5", "16n");
  }

  public async playCorrectSound(): Promise<void> {
    if (!this.settings.fx) return;
    await this.ensureToneStarted();
    // Cheerful ascending arpeggio
    const now = Tone.now();
    this.correctSynth.triggerAttackRelease("C5", "8n", now);
    this.correctSynth.triggerAttackRelease("E5", "8n", now + 0.1);
    this.correctSynth.triggerAttackRelease("G5", "8n", now + 0.2);
    this.correctSynth.triggerAttackRelease("C6", "4n", now + 0.3);
  }

  public async playWrongSound(): Promise<void> {
    if (!this.settings.fx) return;
    await this.ensureToneStarted();
    this.wrongSynth.triggerAttackRelease("E3", "8n");
  }

  public async playWinSound(): Promise<void> {
    if (!this.settings.fx) return;
    await this.ensureToneStarted();
    // Triumphant fanfare
    const now = Tone.now();
    this.winSynth.triggerAttackRelease(["C4", "E4", "G4"], "4n", now);
    this.winSynth.triggerAttackRelease(["C5", "E5", "G5"], "4n", now + 0.3);
    this.winSynth.triggerAttackRelease(["E5", "G5", "C6"], "2n", now + 0.6);
  }

  public async playLoseSound(): Promise<void> {
    if (!this.settings.fx) return;
    await this.ensureToneStarted();
    // Sad descending notes
    const now = Tone.now();
    this.loseSynth.triggerAttackRelease("E4", "8n", now);
    this.loseSynth.triggerAttackRelease("D4", "8n", now + 0.15);
    this.loseSynth.triggerAttackRelease("C4", "4n", now + 0.3);
  }

  public async playDrawSound(): Promise<void> {
    if (!this.settings.fx) return;
    await this.ensureToneStarted();
    // Soft brush sound - random pitch for variety
    const notes = ["C4", "D4", "E4", "F4", "G4"];
    const note = notes[Math.floor(Math.random() * notes.length)];
    this.drawSynth.triggerAttackRelease(note, "32n");
  }

  // Clean up resources when leaving room
  public destroy(): void {
    console.log("[GameManager] Destroying...");

    // Stop music
    this.bgMusic.pause();
    this.bgMusic.currentTime = 0;

    // Clear timer
    this.stopLocalTimer();

    // Clear components
    this.drawingCanvas = null;
    this.playerBar = null;
    this.chatArea = null;

    // Reset state
    this.players = [];
    this.currentWord = "";
    this.playerDrawingId = "";
    this.gamePhase = "lobby";
  }
}
