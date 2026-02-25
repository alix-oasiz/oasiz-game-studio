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
import { AudioManager } from "./AudioManager";
import { SettingsManager } from "./SettingsManager";
import type { AudioSceneId } from "./audio/assetManifest";
import { preloadStartupAssets, setStartupLoaderState } from "./preload";
import {
  playCountdownFeedback,
  playGameEndFeedback,
} from "./feedback/mainFlowFeedback";

declare const __APP_VERSION__: string;
declare const __APP_BUILD_TAG__: string;

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

const SPLASH_TIMELINE_SEC = {
  startLogoCue: 0.1,
  showTagline: 0.34,
  fadeTagline: 1.48,
  fadeLogo: 1.9,
  fadeOut: 2.28,
  done: 2.78,
  absoluteSafetyDone: 4.2,
  safetyExtension: 3.0,
} as const;
const START_SCREEN_BUTTONS_REVEAL_DELAY_MS = 1280;

window.addEventListener("beforeunload", () => {
  game.destroy();
});

window.getCurrentSeed = (): number | null => {
  return game.getRngSeed();
};

window.setNextSeed = (seed: number): void => {
  game.setNextRngSeed(seed);
};

function setSplashVersionLabel(): void {
  const splashVersion = document.getElementById("splashVersionLabel");
  if (!splashVersion) {
    return;
  }
  if (!CLIENT_DEBUG_BUILD_ENABLED) {
    splashVersion.style.display = "none";
    return;
  }

  const appVersion =
    typeof __APP_VERSION__ === "string" && __APP_VERSION__.length > 0
      ? __APP_VERSION__
      : "dev";
  const buildTag =
    typeof __APP_BUILD_TAG__ === "string" && __APP_BUILD_TAG__.length > 0
      ? __APP_BUILD_TAG__
      : "local";

  splashVersion.textContent = `v${appVersion} (${buildTag})`;
}

function resolveSceneForPhase(phase: GamePhase): AudioSceneId {
  switch (phase) {
    case "START":
      return "START";
    case "LOBBY":
      return "LOBBY";
    case "COUNTDOWN":
    case "PLAYING":
    case "ROUND_END":
      return "GAMEPLAY";
    case "GAME_END":
      return "RESULTS";
  }
}

function runSplashScreen(): Promise<void> {
  return new Promise((resolve) => {
    const splash = document.getElementById("splashScreen");
    if (!splash) {
      resolve();
      return;
    }

    const fallbackStartMs = performance.now();
    let rafId = 0;
    let safetyDeadlineSec = SPLASH_TIMELINE_SEC.absoluteSafetyDone;
    const stage = {
      showLogo: false,
      showTagline: false,
      fadeTagline: false,
      fadeLogo: false,
      fadeOut: false,
      done: false,
    };

    const applyStage = (stageName: keyof typeof stage): void => {
      if (stage[stageName]) {
        return;
      }
      stage[stageName] = true;
      if (stageName === "showLogo") {
        setStartupLoaderState(false);
        splash.classList.add("show-logo");
        return;
      }
      if (stageName === "showTagline") {
        splash.classList.add("show-tagline");
        return;
      }
      if (stageName === "fadeTagline") {
        splash.classList.add("fade-tagline");
        return;
      }
      if (stageName === "fadeLogo") {
        splash.classList.add("fade-logo");
        return;
      }
      if (stageName === "fadeOut") {
        splash.classList.add("fade-out");
        return;
      }
      if (stageName === "done") {
        splash.classList.add("done");
      }
    };

    const finish = (): void => {
      if (stage.done) {
        return;
      }
      setStartupLoaderState(false);
      applyStage("done");
      cancelAnimationFrame(rafId);
      resolve();
    };

    void AudioManager.playSplashScreenCue();

    const tick = (): void => {
      const fallbackElapsedSec = (performance.now() - fallbackStartMs) / 1000;
      const splashCueElapsedSec = AudioManager.getCuePlaybackTime("SPLASH_STING");
      const timelineElapsedSec =
        splashCueElapsedSec !== null ? splashCueElapsedSec : fallbackElapsedSec;

      if (timelineElapsedSec >= SPLASH_TIMELINE_SEC.startLogoCue) {
        applyStage("showLogo");
      }
      if (timelineElapsedSec >= SPLASH_TIMELINE_SEC.showTagline) {
        applyStage("showTagline");
      }
      if (timelineElapsedSec >= SPLASH_TIMELINE_SEC.fadeTagline) {
        applyStage("fadeTagline");
      }
      if (timelineElapsedSec >= SPLASH_TIMELINE_SEC.fadeLogo) {
        applyStage("fadeLogo");
      }
      if (timelineElapsedSec >= SPLASH_TIMELINE_SEC.fadeOut) {
        applyStage("fadeOut");
      }
      if (timelineElapsedSec >= SPLASH_TIMELINE_SEC.done) {
        finish();
        return;
      }

      if (fallbackElapsedSec >= safetyDeadlineSec) {
        console.log("[Main.runSplashScreen]", "Falling back to safety timeout");
        finish();
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
  });
}

async function init(): Promise<void> {
  console.log("[Main] Initializing Astro Party");
  setSplashVersionLabel();
  await preloadStartupAssets();

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
  let startMenuMusicTimer: ReturnType<typeof setTimeout> | null = null;

  const clearStartMenuMusicTimer = (): void => {
    if (startMenuMusicTimer === null) {
      return;
    }
    clearTimeout(startMenuMusicTimer);
    startMenuMusicTimer = null;
  };

  const scheduleStartMenuMusic = (): void => {
    clearStartMenuMusicTimer();
    startMenuMusicTimer = setTimeout(() => {
      startMenuMusicTimer = null;
      if (currentPhase !== "START") {
        return;
      }
      void AudioManager.playSceneMusic("START", { restart: false });
    }, START_SCREEN_BUTTONS_REVEAL_DELAY_MS);
  };

  const syncAudioToPhase = (
    phase: GamePhase,
    previousPhase: GamePhase | null,
  ): void => {
    if (phase === "START") {
      const shouldWaitForIntro =
        previousPhase === null || previousPhase !== "START";
      if (shouldWaitForIntro) {
        scheduleStartMenuMusic();
      } else {
        clearStartMenuMusicTimer();
        void AudioManager.playSceneMusic("START", { restart: false });
      }
      return;
    }

    clearStartMenuMusicTimer();
    const nextScene = resolveSceneForPhase(phase);
    const previousScene =
      previousPhase !== null ? resolveSceneForPhase(previousPhase) : null;
    const shouldRestart = previousScene !== nextScene;
    void AudioManager.playSceneMusic(nextScene, { restart: shouldRestart });
  };

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
      syncAudioToPhase(phase, previousPhase);
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
  syncAudioToPhase(currentPhase, null);

  SettingsManager.subscribe((settings) => {
    if (settings.music) {
      syncAudioToPhase(currentPhase, currentPhase);
      return;
    }
    clearStartMenuMusicTimer();
    AudioManager.stopMusic();
  });

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
