import { Game } from "./Game";
import { GamePhase, GameMode, MapId, PlayerData } from "./types";
import { createViewportController, tryLockOrientation } from "./ui/viewport";
import { createScreenController, bindEndScreenUI } from "./ui/screens";
import { createStartScreenUI } from "./ui/startScreen";
import { createLobbyUI } from "./ui/lobby";
import { createLeaveModal } from "./ui/modals";
import { createSettingsUI } from "./ui/settings";
import { createAdvancedSettingsUI } from "./ui/advancedSettings";
import { createMapPreviewUI } from "./ui/mapPreview";
import { CLIENT_DEBUG_BUILD_ENABLED } from "./debug/debugTools";
import {
  playCountdownFeedback,
  playGameEndFeedback,
} from "./feedback/mainFlowFeedback";

// Declare platform-injected variables
declare global {
  interface Window {
    __ROOM_CODE__?: string;
    __PLAYER_NAME__?: string;
    __PLAYER_AVATAR__?: string;
    getCurrentSeed?: () => number | null;
    setNextSeed?: (seed: number) => void;
  }
}

const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const game = new Game(canvas);

window.addEventListener("beforeunload", () => {
  game.destroy();
});

window.getCurrentSeed = (): number | null => {
  return game.getRngSeed();
};

window.setNextSeed = (seed: number): void => {
  game.setNextRngSeed(seed);
};

function runSplashScreen(): Promise<void> {
  return new Promise((resolve) => {
    const splash = document.getElementById("splashScreen");
    if (!splash) {
      resolve();
      return;
    }

    const showLogo = (): void => {
      splash.classList.add("show-logo");

      setTimeout(() => {
        splash.classList.add("show-tagline");

        setTimeout(() => {
          splash.classList.add("fade-tagline");

          setTimeout(() => {
            splash.classList.add("fade-logo");

            setTimeout(() => {
              splash.classList.add("fade-out");

              setTimeout(() => {
                splash.classList.add("done");
                resolve();
              }, 500);
            }, 400);
          }, 400);
        }, 1200);
      }, 300);
    };

    setTimeout(showLogo, 100);
  });
}

async function init(): Promise<void> {
  console.log("[Main] Initializing Astro Party");

  await runSplashScreen();

  const viewport = createViewportController(game);
  await tryLockOrientation(viewport.isMobile);

  const screenController = createScreenController(game, viewport.isMobile);
  const leaveModal = createLeaveModal(game);
  const settingsUI = createSettingsUI(leaveModal.openLeaveModal);
  const advancedSettingsUI = createAdvancedSettingsUI(game);
  const mapPreviewUI = createMapPreviewUI(game);
  const startUI = createStartScreenUI(game);
  const lobbyUI = createLobbyUI(game, viewport.isMobile);
  bindEndScreenUI(game);
  let currentPhase: GamePhase = "START";

  const syncScreenToPhase = (
    phase: GamePhase,
    triggerPhaseEffects: boolean,
    previousPhase: GamePhase | null,
  ): void => {
    if (phase !== "LOBBY") {
      lobbyUI.closeMapPicker();
    }

    switch (phase) {
      case "START":
        screenController.showScreen("start");
        startUI.resetStartButtons(previousPhase !== "START");
        break;
      case "LOBBY":
        screenController.showScreen("lobby");
        lobbyUI.updateRoomCode(game.getRoomCode());
        lobbyUI.updateMapSelector();
        mapPreviewUI.updateMapPreview();
        screenController.resetEndScreenButtons();
        break;
      case "COUNTDOWN":
      case "PLAYING":
        screenController.showScreen("game");
        screenController.setRoundResultVisible(false);
        screenController.updateControlHints();
        break;
      case "ROUND_END":
        screenController.showScreen("game");
        screenController.updateRoundResultOverlay();
        screenController.setRoundResultVisible(true);
        screenController.updateControlHints();
        break;
      case "GAME_END":
        screenController.showScreen("end");
        screenController.updateGameEnd(game.getPlayers());
        if (triggerPhaseEffects) {
          playGameEndFeedback();
        }
        screenController.updateControlHints();
        break;
    }
  };

  game.setUICallbacks({
    onPhaseChange: (phase: GamePhase) => {
      console.log("[Main] Phase changed:", phase);
      const previousPhase = currentPhase;
      currentPhase = phase;
      syncScreenToPhase(phase, true, previousPhase);
    },

    onPlayersUpdate: (players: PlayerData[]) => {
      lobbyUI.updateLobbyUI(players);
      screenController.updateScoreTrack(players);
      screenController.updateHudControlsVisibility();
      game.setAllowAltKeyBindings(game.getLocalPlayerCount() <= 1);

      if (game.getPhase() === "GAME_END") {
        screenController.updateGameEnd(players);
      }

      screenController.updateControlHints();

      if (viewport.isMobile && game.getPhase() === "PLAYING") {
        game.updateTouchLayout();
      }
    },

    onCountdownUpdate: (count: number) => {
      playCountdownFeedback(count);
    },
    onGameModeChange: (mode: GameMode) => {
      lobbyUI.setModeUI(mode, "remote");
    },
    onRoundResult: () => {
      screenController.updateRoundResultOverlay();
    },
    onAdvancedSettingsChange: (settings) => {
      advancedSettingsUI.updateAdvancedSettingsUI(settings);
      screenController.updateScoreTrack(game.getPlayers());
    },
    onSystemMessage: (message, durationMs) => {
      screenController.showSystemMessage(message, durationMs);
    },
    onMapChange: (mapId: MapId) => {
      lobbyUI.setMapUI(mapId, "remote");
      lobbyUI.updateMapSelector();
      mapPreviewUI.updateMapPreview(mapId);
      screenController.updateStarfieldForMap(mapId);
    },
  });

  settingsUI.updateSettingsUI();
  advancedSettingsUI.updateAdvancedSettingsUI();
  screenController.showScreen("start");
  startUI.resetStartButtons(true);

  if (CLIENT_DEBUG_BUILD_ENABLED) {
    const { mountDebugPanel } = await import("./debug/debugPanel");
    mountDebugPanel({
      game,
      screenController,
      restoreLiveUi: () => {
        syncScreenToPhase(game.getPhase(), false, currentPhase);
      },
    });
  }

  game.start();

  setInterval(screenController.updateNetworkStats, 250);

  if (window.__ROOM_CODE__) {
    console.log("[Main] Platform injected room code:", window.__ROOM_CODE__);
    try {
      game.setSessionMode("online");
      const success = await game.joinRoom(window.__ROOM_CODE__);
      if (success) {
        if (window.__PLAYER_NAME__) {
          console.log("[Main] Setting player name:", window.__PLAYER_NAME__);
          game.setPlayerName(window.__PLAYER_NAME__);
        }
      } else {
        console.log("[Main] Failed to auto-join room, staying on start screen");
      }
    } catch (e) {
      console.error("[Main] Error auto-joining room:", e);
    }
  }
}

// Start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
