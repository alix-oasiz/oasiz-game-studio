import { Game } from "../Game";
import { PlayerData } from "../types";
import { triggerHaptic } from "./haptics";
import { SettingsManager } from "../SettingsManager";
import { elements } from "./elements";
import { escapeHtml } from "./text";

type Screen = "start" | "lobby" | "game" | "end";

export interface ScreenController {
  showScreen: (screen: Screen) => void;
  updateHudControlsVisibility: () => void;
  updateNetworkStats: () => void;
  updateRoundResultOverlay: () => void;
  setRoundResultVisible: (visible: boolean) => void;
  updateControlHints: () => void;
  showSystemMessage: (message: string, durationMs?: number) => void;
  updateScoreTrack: (players: PlayerData[]) => void;
  updateGameEnd: (players: PlayerData[]) => void;
  resetEndScreenButtons: () => void;
}

export function createScreenController(
  game: Game,
  isMobile: boolean,
): ScreenController {
  let activeScreen: Screen = "start";
  let systemMessageTimeout: ReturnType<typeof setTimeout> | null = null;

  function clearSystemMessage(): void {
    if (systemMessageTimeout) {
      clearTimeout(systemMessageTimeout);
      systemMessageTimeout = null;
    }
    elements.systemMessage.classList.remove("active");
    elements.systemMessage.textContent = "";
  }

  function updateHudControlsVisibility(): void {
    if (activeScreen !== "game") {
      elements.leaveGameBtn.style.display = "none";
      elements.settingsBtn.style.display = "none";
      elements.settingsCenterHotspot.style.display = "none";
      elements.settingsLeaveBtn.style.display = "none";
      elements.settingsModal.classList.remove("main-leave-active");
      return;
    }

    const hideHudLeaveForMobileLocal =
      isMobile && game.getLocalPlayerCount() >= 2;
    elements.leaveGameBtn.style.display = hideHudLeaveForMobileLocal
      ? "none"
      : "flex";
    elements.settingsBtn.style.display = hideHudLeaveForMobileLocal
      ? "none"
      : "flex";
    elements.settingsCenterHotspot.style.display = hideHudLeaveForMobileLocal
      ? "block"
      : "none";
    elements.settingsLeaveBtn.style.display = hideHudLeaveForMobileLocal
      ? "block"
      : "none";
    elements.settingsModal.classList.toggle(
      "main-leave-active",
      !hideHudLeaveForMobileLocal,
    );
  }

  function showScreen(screen: Screen): void {
    const previousScreen = activeScreen;
    activeScreen = screen;
    if (previousScreen !== screen) {
      clearSystemMessage();
    }
    game.setMapElementsVisible(screen === "lobby" || screen === "game");
    elements.startScreen.classList.toggle("hidden", screen !== "start");
    elements.lobbyScreen.classList.toggle("hidden", screen !== "lobby");
    elements.gameEndScreen.classList.toggle("hidden", screen !== "end");
    elements.hud.classList.toggle("active", screen === "game");
    updateControlHints();
    updateHudControlsVisibility();
    game.setKeyboardInputEnabled(screen === "game");
    game.setDevKeysEnabled(screen === "game");
    if (screen !== "game") {
      elements.roundResult.classList.add("hidden");
    }

    if (isMobile) {
      elements.mobileControls.classList.remove("active");
      if (screen === "game") {
        game.updateTouchLayout();
      } else {
        game.clearTouchLayout();
      }
    } else {
      elements.mobileControls.classList.toggle("active", screen === "game");
    }

    elements.netStats.style.display = screen === "game" ? "block" : "none";
  }

  function updateNetworkStats(): void {
    if (activeScreen !== "game") {
      elements.netStats.textContent = "";
      return;
    }

    const stats = game.getNetworkTelemetry();
    const latency = Math.round(stats.latencyMs);
    const jitter = Math.round(stats.jitterMs);
    const age = Math.round(stats.snapshotAgeMs);
    const interval = Math.round(stats.snapshotIntervalMs);
    const transport = stats.webrtcConnected ? "RTC" : "WS";

    const line1 =
      "RTT " + latency + "ms | Jit " + jitter + "ms | Age " + age + "ms";
    const line2 = "Tick " + interval + "ms | " + transport;

    elements.netStats.textContent = line1 + "\n" + line2;
  }

  function updateRoundResultOverlay(): void {
    const result = game.getRoundResult();
    if (!result) {
      elements.roundResult.classList.add("hidden");
      return;
    }

    elements.roundResultTitle.textContent = "ROUND " + result.roundNumber;
    if (result.isTie) {
      elements.roundResultSubtitle.textContent = "TIE";
    } else {
      elements.roundResultSubtitle.textContent =
        "WINNER: " + (result.winnerName ?? "UNKNOWN");
    }
  }

  function setRoundResultVisible(visible: boolean): void {
    elements.roundResult.classList.toggle("hidden", !visible);
  }

  function updateControlHints(): void {
    const settings = SettingsManager.get();
    document.body.classList.toggle("control-hints-off", !settings.controlHints);
    const shouldShow =
      !isMobile && activeScreen === "game" && settings.controlHints;
    if (!shouldShow) {
      elements.controlHints.classList.remove("active");
      elements.controlHints.innerHTML = "";
      return;
    }

    const localPlayers = game.getLocalPlayersInfo();
    if (localPlayers.length === 0) {
      elements.controlHints.classList.remove("active");
      elements.controlHints.innerHTML = "";
      return;
    }

    elements.controlHints.innerHTML = localPlayers
      .map((player) => {
        return (
          '<div class="control-hint" style="--hint-color: ' +
          player.color +
          '">' +
          '<div class="control-hint-name">' +
          escapeHtml(player.name) +
          "</div>" +
          '<div class="control-hint-keys">' +
          escapeHtml(player.keyPreset) +
          "</div>" +
          "</div>"
        );
      })
      .join("");
    elements.controlHints.classList.add("active");
  }

  function showSystemMessage(message: string, durationMs: number = 5000): void {
    clearSystemMessage();
    elements.systemMessage.textContent = message;
    elements.systemMessage.classList.add("active");
    systemMessageTimeout = setTimeout(() => {
      clearSystemMessage();
      systemMessageTimeout = null;
    }, durationMs);
  }

  function updateScoreTrack(players: PlayerData[]): void {
    const myPlayerId = game.getMyPlayerId();
    const roundsToWin = Math.max(
      1,
      Math.floor(game.getAdvancedSettings().roundsToWin),
    );
    elements.scoreTrack.innerHTML = players
      .map((player) => {
        const isSelf = player.id === myPlayerId;
        const dots = Array.from({ length: roundsToWin }, (_, i) => {
          const filled = i < player.roundWins;
          return (
            '<div class="score-dot ' +
            (filled ? "filled" : "") +
            '" style="color: ' +
            player.color.primary +
            '"></div>'
          );
        }).join("");

        return (
          '<div class="score-row' +
          (isSelf ? " self" : "") +
          '" style="color: ' +
          player.color.primary +
          '">' +
          '<span class="score-player-name">' +
          escapeHtml(player.name) +
          "</span>" +
          '<div class="score-dots">' +
          dots +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function updateGameEnd(players: PlayerData[]): void {
    const winner = game.getWinnerName();
    elements.winnerName.textContent = winner || "Unknown";
    const myPlayerId = game.getMyPlayerId();

    const sorted = [...players].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.roundWins !== a.roundWins) return b.roundWins - a.roundWins;
      return b.kills - a.kills;
    });
    const header =
      '<div class="final-score-header">' +
      '<div class="final-score-label">Pilot</div>' +
      '<div class="final-score-label stat">Pts</div>' +
      '<div class="final-score-label stat">Rounds</div>' +
      '<div class="final-score-label stat">Kills</div>' +
      "</div>";
    const rows = sorted
      .map((player) => {
        const isSelf = player.id === myPlayerId;
        return (
          '<div class="final-score-row' +
          (isSelf ? " self" : "") +
          '" style="color: ' +
          player.color.primary +
          '">' +
          '<div class="final-score-name">' +
          escapeHtml(player.name) +
          "</div>" +
          '<div class="final-score-value stat">' +
          player.score.toString() +
          "</div>" +
          '<div class="final-score-value stat">' +
          player.roundWins.toString() +
          "</div>" +
          '<div class="final-score-value stat">' +
          player.kills.toString() +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    elements.finalScores.innerHTML = header + rows;

    if (game.didHostLeave()) {
      elements.playAgainBtn.style.display = "none";
    } else if (game.isLeader()) {
      elements.playAgainBtn.style.display = "block";
      elements.playAgainBtn.textContent = "Play Again";
      elements.playAgainBtn.disabled = false;
    } else {
      elements.playAgainBtn.style.display = "block";
      elements.playAgainBtn.textContent = "Waiting for leader";
      elements.playAgainBtn.disabled = true;
    }

    elements.leaveEndBtn.textContent = "Leave";
    elements.leaveEndBtn.disabled = false;
  }

  function resetEndScreenButtons(): void {
    elements.playAgainBtn.disabled = false;
    elements.playAgainBtn.textContent = "Play Again";
    elements.leaveEndBtn.disabled = false;
    elements.leaveEndBtn.textContent = "Leave";
  }

  SettingsManager.subscribe(() => {
    updateControlHints();
  });

  return {
    showScreen,
    updateHudControlsVisibility,
    updateNetworkStats,
    updateRoundResultOverlay,
    setRoundResultVisible,
    updateControlHints,
    showSystemMessage,
    updateScoreTrack,
    updateGameEnd,
    resetEndScreenButtons,
  };
}

export function bindEndScreenUI(game: Game): void {
  elements.playAgainBtn.addEventListener("click", async () => {
    triggerHaptic("light");
    if (game.isLeader()) {
      elements.playAgainBtn.disabled = true;
      elements.playAgainBtn.textContent = "Restarting...";
      await game.restartGame();
    } else {
      elements.playAgainBtn.textContent = "Waiting for leader";
      elements.playAgainBtn.disabled = true;
    }
  });

  elements.leaveEndBtn.addEventListener("click", async () => {
    triggerHaptic("light");
    elements.leaveEndBtn.disabled = true;
    elements.leaveEndBtn.textContent = "Leaving...";
    await game.leaveGame();
  });
}
