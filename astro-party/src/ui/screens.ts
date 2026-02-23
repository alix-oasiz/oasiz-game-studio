import { Game } from "../Game";
import { PlayerData } from "../types";
import { SettingsManager } from "../SettingsManager";
import { elements } from "./elements";
import { escapeHtml } from "./text";
import { createUIFeedback } from "../feedback/uiFeedback";
import { SeededRNG } from "../../shared/sim/SeededRNG";

type Screen = "start" | "lobby" | "game" | "end";

interface StarfieldGradient {
  inner: string;
  mid: string;
  outer: string;
}

const MAP_THEME_GRADIENTS: Record<number, StarfieldGradient> = {
  0: { inner: "#05080d", mid: "#1a0f28", outer: "#3a1a30" },
  1: { inner: "#050508", mid: "#10101c", outer: "#303015" },
  2: { inner: "#050202", mid: "#1c0505", outer: "#3a101a" },
  3: { inner: "#050202", mid: "#1c0505", outer: "#3a101a" },
  4: { inner: "#020502", mid: "#081c0a", outer: "#103015" },
  5: { inner: "#020505", mid: "#081c1c", outer: "#103030" },
};

function getGradientForMap(mapId: number): StarfieldGradient {
  return MAP_THEME_GRADIENTS[mapId] ?? MAP_THEME_GRADIENTS[0];
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function updateStarfieldGradient(mapId: number): void {
  const gradient = getGradientForMap(mapId);
  const bg = elements.starsBg;
  bg.style.background = `radial-gradient(220% 105% at top center, ${gradient.inner} 10%, ${gradient.mid} 40%, ${gradient.outer})`;
}

function resolveStarCount(): number {
  return 800;
}

function initStarfield(seed: number): void {
  const layer = elements.starsLayer;
  const starCount = resolveStarCount();
  const r = 800;
  const rng = new SeededRNG(seed >>> 0);

  for (let i = 0; i < starCount; i++) {
    const star = document.createElement("div");
    star.className = "star-node";

    const s = 0.2 + rng.nextRange(0, 1);
    const curR = r + rng.nextRange(0, 300);

    const starColor = rng.next() > 0.7 ? "#F7F7B6" : "#ffffff";
    const rgb = hexToRgb(starColor);
    if (rgb) {
      const brightness = 0.5 + rng.nextRange(0, 0.5);
      star.style.background = `rgb(${Math.round(rgb.r * brightness)}, ${Math.round(rgb.g * brightness)}, ${Math.round(rgb.b * brightness)})`;
    }

    const size = 1 + rng.nextRange(0, 2);
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;

    const rotY = rng.nextRange(0, 360);
    const rotX = rng.nextRange(-50, 0);
    star.style.transform = `translate3d(0,0,-${curR}px) rotateY(${rotY}deg) rotateX(${rotX}deg) scale(${s},${s})`;
    star.style.transformOrigin = `0 0 ${curR}px`;

    layer.appendChild(star);
  }
}

let starfieldInitialized = false;

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
  updateStarfieldForMap: (mapId: number) => void;
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

    if (screen === "game") {
      if (!starfieldInitialized) {
        const roundSeed = game.getRngSeed();
        const starfieldSeed =
          roundSeed !== null ? (roundSeed ^ 0x73a5f1c3) >>> 0 : 0x73a5f1c3;
        initStarfield(starfieldSeed);
        starfieldInitialized = true;
      }
      const currentMapId = game.getMapId();
      updateStarfieldGradient(currentMapId);
      elements.starsContainer.classList.add("active");
    } else {
      elements.starsContainer.classList.remove("active");
    }
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
        const isCombatPhase =
          game.getPhase() === "PLAYING" || game.getPhase() === "ROUND_END";
        const isDeparted =
          player.presence === "LEFT" || player.presence === "KICKED";
        const isEliminated =
          !isDeparted && isCombatPhase && player.state === "SPECTATING";
        const isEjected =
          !isDeparted && isCombatPhase && player.state === "EJECTED";
        let statusLabel = "";
        if (player.presence === "KICKED") {
          statusLabel = " (Kicked)";
        } else if (player.presence === "LEFT") {
          statusLabel = " (Left)";
        } else if (isEliminated) {
          statusLabel = " (Out)";
        } else if (isEjected) {
          statusLabel = " (Ejected)";
        }
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
          (isDeparted ? " departed" : "") +
          (isEliminated ? " eliminated" : "") +
          (isEjected ? " ejected" : "") +
          '" style="color: ' +
          player.color.primary +
          '">' +
          '<span class="score-player-name">' +
          escapeHtml(player.name) +
          '<span class="score-player-status">' +
          escapeHtml(statusLabel) +
          "</span>" +
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
        const isDeparted =
          player.presence === "LEFT" || player.presence === "KICKED";
        const statusLabel =
          player.presence === "KICKED"
            ? " (Kicked)"
            : player.presence === "LEFT"
              ? " (Left)"
              : "";
        return (
          '<div class="final-score-row' +
          (isSelf ? " self" : "") +
          (isDeparted ? " departed" : "") +
          '" style="color: ' +
          player.color.primary +
          '">' +
          '<div class="final-score-name">' +
          escapeHtml(player.name) +
          '<span class="final-score-status">' +
          escapeHtml(statusLabel) +
          "</span>" +
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
      elements.continueBtn.style.display = "none";
      elements.playAgainBtn.style.display = "none";
    } else if (game.isLeader()) {
      elements.continueBtn.style.display = "block";
      elements.continueBtn.textContent = "Continue";
      elements.continueBtn.disabled = false;
      elements.playAgainBtn.style.display = "block";
      elements.playAgainBtn.textContent = "Play Again";
      elements.playAgainBtn.disabled = false;
    } else {
      elements.continueBtn.style.display = "block";
      elements.continueBtn.textContent = "Waiting for leader";
      elements.continueBtn.disabled = true;
      elements.playAgainBtn.style.display = "block";
      elements.playAgainBtn.textContent = "Waiting for leader";
      elements.playAgainBtn.disabled = true;
    }

    elements.leaveEndBtn.textContent = "Leave";
    elements.leaveEndBtn.disabled = false;
  }

  function resetEndScreenButtons(): void {
    elements.continueBtn.style.display = "block";
    elements.continueBtn.disabled = false;
    elements.continueBtn.textContent = "Continue";
    elements.playAgainBtn.disabled = false;
    elements.playAgainBtn.textContent = "Play Again";
    elements.leaveEndBtn.disabled = false;
    elements.leaveEndBtn.textContent = "Leave";
  }

  function updateStarfieldForMap(mapId: number): void {
    if (activeScreen === "game" && starfieldInitialized) {
      updateStarfieldGradient(mapId);
    }
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
    updateStarfieldForMap,
  };
}

export function bindEndScreenUI(game: Game): void {
  const feedback = createUIFeedback("endScreen");
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const tapGuardUntilByElement = new WeakMap<EventTarget, number>();
  const END_BUTTON_TAP_GUARD_MS = 450;

  const shouldHandleTap = (target: EventTarget | null): boolean => {
    if (!isCoarsePointer || !target) return true;
    const now = performance.now();
    const guardUntil = tapGuardUntilByElement.get(target) ?? 0;
    if (now < guardUntil) {
      return false;
    }
    tapGuardUntilByElement.set(target, now + END_BUTTON_TAP_GUARD_MS);
    return true;
  };

  elements.continueBtn.addEventListener("click", async (event) => {
    if (!shouldHandleTap(event.currentTarget)) return;
    feedback.subtle();
    if (game.isLeader()) {
      elements.continueBtn.disabled = true;
      elements.playAgainBtn.disabled = true;
      elements.continueBtn.textContent = "Continuing...";
      await game.continueMatchSequence();
    } else {
      elements.continueBtn.textContent = "Waiting for leader";
      elements.continueBtn.disabled = true;
    }
  });

  elements.playAgainBtn.addEventListener("click", async (event) => {
    if (!shouldHandleTap(event.currentTarget)) return;
    feedback.subtle();
    if (game.isLeader()) {
      elements.continueBtn.disabled = true;
      elements.playAgainBtn.disabled = true;
      elements.playAgainBtn.textContent = "Restarting...";
      await game.restartGame();
    } else {
      elements.playAgainBtn.textContent = "Waiting for leader";
      elements.playAgainBtn.disabled = true;
    }
  });

  elements.leaveEndBtn.addEventListener("click", async (event) => {
    if (!shouldHandleTap(event.currentTarget)) return;
    feedback.subtle();
    elements.leaveEndBtn.disabled = true;
    elements.leaveEndBtn.textContent = "Leaving...";
    await game.leaveGame();
  });
}
