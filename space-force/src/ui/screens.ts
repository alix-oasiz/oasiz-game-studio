import { Game } from "../Game";
import { PlayerData } from "../types";
import { SettingsManager } from "../SettingsManager";
import { elements } from "./elements";
import { escapeHtml } from "./text";
import { createUIFeedback } from "../feedback/uiFeedback";
import { SeededRNG } from "../../shared/sim/SeededRNG";
import { getCombatComboRules } from "../../shared/sim/scoring";
import { isPlatformRuntime } from "../platform/oasizBridge";
import type { LeaveModalContext } from "./modals";

type Screen = "start" | "lobby" | "game" | "end";

interface StarfieldGradient {
  inner: string;
  mid: string;
  outer: string;
}

const DEFAULT_STARFIELD_GRADIENT: StarfieldGradient = {
  // Classic rotation (map 0) is a selector, not a dedicated live arena theme.
  inner: "#05080d",
  mid: "#111a25",
  outer: "#1f2e42",
};

const MAP_THEME_GRADIENTS: Partial<Record<number, StarfieldGradient>> = {
  1: { inner: "#070609", mid: "#1a1308", outer: "#3a2a12" },
  2: { inner: "#090303", mid: "#261007", outer: "#4a1b12" },
  3: { inner: "#070102", mid: "#22040b", outer: "#4a0919" },
  4: { inner: "#020603", mid: "#0b1f11", outer: "#153a27" },
  5: { inner: "#030608", mid: "#0a1b2a", outer: "#15364d" },
};
const COMBAT_COMBO_RULES = getCombatComboRules();

function formatComboMultiplier(multiplier: number): string {
  const normalized = Math.max(1, Math.round(multiplier * 10) / 10);
  const whole = Math.round(normalized);
  if (Math.abs(normalized - whole) <= 0.001) {
    return whole.toString();
  }
  return normalized.toFixed(1);
}

function getGradientForMap(mapId: number): StarfieldGradient {
  return MAP_THEME_GRADIENTS[mapId] ?? DEFAULT_STARFIELD_GRADIENT;
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
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  return isCoarsePointer ? 600 : 800;
}

function initStarfield(seed: number): void {
  const layer = elements.starsLayer;
  const starCount = resolveStarCount();
  const r = 800;
  const rng = new SeededRNG(seed >>> 0);
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < starCount; i++) {
    const star = document.createElement("div");
    star.className = "star-node";

    const s = 0.2 + rng.nextRange(0, 1);
    const curR = r + rng.nextRange(0, 300);
    const rotY = rng.nextRange(0, 360);
    const rotX = rng.nextRange(-50, 0);
    star.style.transform = `translate3d(0,0,-${curR}px) rotateY(${rotY}deg) rotateX(${rotX}deg) scale(${s},${s})`;
    star.style.transformOrigin = `0 0 ${curR}px`;

    fragment.appendChild(star);
  }
  layer.appendChild(fragment);
}

let starfieldInitialized = false;

export interface ScreenController {
  showScreen: (screen: Screen) => void;
  updateHudControlsVisibility: () => void;
  updateNetworkStats: () => void;
  updateRoundResultOverlay: () => void;
  setRoundResultVisible: (visible: boolean) => void;
  updateControlHints: () => void;
  updateComboHud: () => void;
  updateEndlessTimer: () => void;
  showSystemMessage: (message: string, durationMs?: number) => void;
  updateScoreTrack: (players: PlayerData[]) => void;
  updateGameEnd: (players: PlayerData[]) => void;
  resetEndScreenButtons: () => void;
  updateStarfieldForMap: (mapId: number) => void;
  /** Force the starfield gradient for demo mode, bypassing activeScreen guard. */
  forceDemoStarfield: (mapId: number) => void;
}

export function createScreenController(
  game: Game,
  isMobile: boolean,
): ScreenController {
  const isPlatform = isPlatformRuntime();
  const comboHintMultiplierByPlayerId = new Map<string, number>();
  let comboHintRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
  let comboHudPrevMultiplier = 1;
  let comboFlashTimeoutId: ReturnType<typeof setTimeout> | null = null;
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

  function clearComboHintRefreshTimer(): void {
    if (!comboHintRefreshTimeout) return;
    clearTimeout(comboHintRefreshTimeout);
    comboHintRefreshTimeout = null;
  }

  function scheduleComboHintRefresh(delayMs: number): void {
    clearComboHintRefreshTimer();
    comboHintRefreshTimeout = setTimeout(() => {
      comboHintRefreshTimeout = null;
      updateControlHints();
    }, Math.max(50, Math.floor(delayMs)));
  }

  function updateHudControlsVisibility(): void {
    if (activeScreen !== "game") {
      elements.leaveGameBtn.style.display = "none";
      elements.endMatchBtn.style.display = "none";
      elements.settingsBtn.style.display = "none";
      elements.settingsCenterHotspot.style.display = "none";
      elements.settingsLeaveBtn.style.display = "none";
      elements.settingsModal.classList.remove("main-leave-active");
      return;
    }

    const hideHudLeaveForMobileLocal =
      isMobile && game.getLocalPlayerCount() >= 2;
    const hideHudLeave = hideHudLeaveForMobileLocal || isPlatform;
    elements.leaveGameBtn.style.display = hideHudLeave
      ? "none"
      : "flex";
    elements.endMatchBtn.style.display = "none";
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
    } else {
      elements.mobileControls.classList.toggle("active", screen === "game");
    }

    if (screen !== "game") elements.netStats.style.display = "none";

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
      // Preserve starfield when demo-stars is active (background battle visible)
      if (!elements.starsContainer.classList.contains("demo-stars")) {
        elements.starsContainer.classList.remove("active");
      }
    }
  }

  function updateNetworkStats(): void {
    if (activeScreen !== "game" || game.getSessionMode() === "local") {
      elements.netStats.style.display = "none";
      return;
    }

    elements.netStats.style.display = "block";
    const stats = game.getNetworkTelemetry();
    elements.netStats.textContent = Math.round(stats.latencyMs) + "ms";
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
      comboHintMultiplierByPlayerId.clear();
      clearComboHintRefreshTimer();
      return;
    }

    const localPlayers = game.getLocalPlayersInfo();
    if (localPlayers.length === 0) {
      elements.controlHints.classList.remove("active");
      elements.controlHints.innerHTML = "";
      comboHintMultiplierByPlayerId.clear();
      clearComboHintRefreshTimer();
      return;
    }

    const visibleLocalPlayerIds = new Set<string>();
    elements.controlHints.innerHTML = localPlayers
      .map((player) => {
        visibleLocalPlayerIds.add(player.id);
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
    for (const playerId of [...comboHintMultiplierByPlayerId.keys()]) {
      if (!visibleLocalPlayerIds.has(playerId)) {
        comboHintMultiplierByPlayerId.delete(playerId);
      }
    }
    elements.controlHints.classList.add("active");
    clearComboHintRefreshTimer();
  }

  function updateComboHud(): void {
    if (activeScreen !== "game") {
      elements.comboHud.classList.remove("active");
      comboHudPrevMultiplier = 1;
      if (comboFlashTimeoutId) { clearTimeout(comboFlashTimeoutId); comboFlashTimeoutId = null; }
      return;
    }

    const myPlayerId = game.getMyPlayerId();
    if (!myPlayerId) {
      elements.comboHud.classList.remove("active");
      return;
    }

    const players = game.getPlayers();
    const self = players.find((p) => p.id === myPlayerId);
    if (!self) {
      elements.comboHud.classList.remove("active");
      return;
    }

    const nowMs = game.getHostSimTimeMs();
    const comboRemainingMs = Math.max(0, Math.floor(self.comboExpiresAtMs - nowMs));
    const isActive = self.comboMultiplier > 1 && comboRemainingMs > 0;

    if (!isActive) {
      elements.comboHud.classList.remove("active");
      comboHudPrevMultiplier = 1;
      if (comboFlashTimeoutId) { clearTimeout(comboFlashTimeoutId); comboFlashTimeoutId = null; }
      return;
    }

    const isIncrement = self.comboMultiplier > comboHudPrevMultiplier + 0.01;
    comboHudPrevMultiplier = self.comboMultiplier;

    if (isIncrement) {
      if (comboFlashTimeoutId) { clearTimeout(comboFlashTimeoutId); comboFlashTimeoutId = null; }
      elements.comboHud.innerHTML =
        '<div class="hud-combo-tag">combo</div>' +
        '<div class="hud-combo-val">×' + formatComboMultiplier(self.comboMultiplier) + "</div>";
      elements.comboHud.style.color = self.color.primary;
      elements.comboHud.style.textShadow = `0 0 16px ${self.color.primary}`;
      elements.comboHud.classList.add("active");
      comboFlashTimeoutId = setTimeout(() => {
        elements.comboHud.classList.remove("active");
        comboFlashTimeoutId = null;
      }, 1500);
    }
  }

  function updateEndlessTimer(): void {
    const isEndless = game.getRuleset() === "ENDLESS_RESPAWN";
    if (!isEndless || activeScreen !== "game") {
      elements.endlessTimer.classList.remove("active", "warning", "urgent");
      return;
    }

    const { endlessTimeLimitSeconds } = game.getAdvancedSettings();
    if (endlessTimeLimitSeconds === null) {
      elements.endlessTimer.classList.remove("active", "warning", "urgent");
      return;
    }

    const startAtMs = game.getPlayingStartAtMs();
    if (startAtMs === null) {
      elements.endlessTimer.classList.remove("active", "warning", "urgent");
      return;
    }

    const nowMs = game.getHostSimTimeMs();
    const elapsedMs = nowMs - startAtMs;
    const remainingMs = Math.max(0, endlessTimeLimitSeconds * 1000 - elapsedMs);
    const remainingSecs = Math.ceil(remainingMs / 1000);

    const minutes = Math.floor(remainingSecs / 60);
    const seconds = remainingSecs % 60;
    const formatted =
      minutes.toString().padStart(2, "0") +
      ":" +
      seconds.toString().padStart(2, "0");

    elements.endlessTimer.classList.add("active");
    elements.endlessTimer.classList.toggle("warning", remainingSecs <= 60 && remainingSecs > 15);
    elements.endlessTimer.classList.toggle("urgent", remainingSecs <= 15);
    elements.endlessTimer.textContent = formatted;
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
    const isLocalMultiplayer =
      game.getSessionMode() === "local" && game.getLocalPlayerCount() > 1;
    if (isLocalMultiplayer) {
      elements.scoreTrack.innerHTML = "";
      elements.scoreTrack.style.display = "none";
      return;
    }
    elements.scoreTrack.style.display = "";

    const myPlayerId = game.getMyPlayerId();
    const isEndless = game.getRuleset() === "ENDLESS_RESPAWN";
    const settings = game.getAdvancedSettings();
    const roundsToWin = isEndless
      ? 0
      : Math.max(1, Math.floor(settings.roundsToWin));
    const killLimit = isEndless ? settings.endlessKillLimit : null;

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
        let statsMarkup: string;
        if (isEndless) {
          const killsHtml =
            killLimit !== null
              ? '<div class="score-kills">' +
                player.kills.toString() +
                '<span class="score-kills-limit">/' +
                killLimit.toString() +
                "</span></div>"
              : "";
          statsMarkup =
            '<div class="score-row-stats">' +
            '<div class="score-points">' +
            player.score.toString() +
            "</div>" +
            killsHtml +
            "</div>";
        } else {
          statsMarkup =
            '<div class="score-dots">' +
            Array.from({ length: roundsToWin }, (_, i) => {
              const filled = i < player.roundWins;
              return (
                '<div class="score-dot ' +
                (filled ? "filled" : "") +
                '" style="color: ' +
                player.color.primary +
                '"></div>'
              );
            }).join("") +
            "</div>";
        }

        return (
          '<div class="score-row' +
          (isSelf ? " self" : "") +
          (isDeparted ? " departed" : "") +
          (isEliminated ? " eliminated" : "") +
          (isEjected ? " ejected" : "") +
          '" style="color: ' +
          player.color.primary +
          '">' +
          '<div class="score-player-dot"></div>' +
          '<span class="score-player-name">' +
          escapeHtml(player.name) +
          "</span>" +
          statsMarkup +
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

  /**
   * Force starfield gradient for demo mode — bypasses the activeScreen guard.
   * Initialises the star nodes if not done yet, sets gradient, and ensures
   * the container is visible. Call this instead of updateStarfieldForMap
   * whenever the game screen is not "game" (e.g. attract / menu demo states).
   */
  function forceDemoStarfield(mapId: number): void {
    if (!starfieldInitialized) {
      initStarfield(0x73a5f1c3 >>> 0);
      starfieldInitialized = true;
    }
    updateStarfieldGradient(mapId);
    elements.starsContainer.classList.add("active");
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
    updateComboHud,
    updateEndlessTimer,
    showSystemMessage,
    updateScoreTrack,
    updateGameEnd,
    resetEndScreenButtons,
    updateStarfieldForMap,
    forceDemoStarfield,
  };
}

export function bindEndScreenUI(
  game: Game,
  openLeaveModal: (context?: LeaveModalContext) => void,
): void {
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
    feedback.button();
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
    feedback.button();
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

  elements.leaveEndBtn.addEventListener("click", (event) => {
    if (!shouldHandleTap(event.currentTarget)) return;
    feedback.subtle();
    openLeaveModal("MATCH_LEAVE");
  });
}
