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
import { DemoController } from "./demo/DemoController";
import { DemoOverlayUI } from "./demo/DemoOverlayUI";
import { elements } from "./ui/elements";

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

const DEMO_SEEN_KEY = "astro-party-demo-seen";

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
  const lobbyUI = createLobbyUI(game, viewport.isMobile);
  bindEndScreenUI(game);
  let currentPhase: GamePhase = "START";
  let waitingForStartIntroAudioCompletion = false;
  let startMenuMusicTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingDemoStartupAfterIntro: { showAttract: boolean } | null = null;
  let suppressNextStartPhaseEffects = false;
  // Demo state
  let demoController: DemoController | null = null;
  let demoOverlay: DemoOverlayUI | null = null;
  let starfieldInitializedForDemo = false;
  const startUI = createStartScreenUI(game, {
    onIntroAudioComplete: () => {
      if (waitingForStartIntroAudioCompletion) {
        waitingForStartIntroAudioCompletion = false;
        clearStartMenuMusicTimer();
        if (currentPhase === "START") {
          void AudioManager.playSceneMusic("START", { restart: false });
        }
      }
      startPendingDemoStartupAfterIntro();
    },
  });

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
      if (!waitingForStartIntroAudioCompletion) {
        startPendingDemoStartupAfterIntro();
        return;
      }
      waitingForStartIntroAudioCompletion = false;
      if (currentPhase !== "START") {
        return;
      }
      void AudioManager.playSceneMusic("START", { restart: false });
      startPendingDemoStartupAfterIntro();
    }, START_SCREEN_BUTTONS_REVEAL_DELAY_MS);
  };

  const resolveSceneForAudioContext = (phase: GamePhase): AudioSceneId => {
    if (!demoController?.isDemoActive()) {
      return resolveSceneForPhase(phase);
    }
    const demoState = demoController.getState();
    if (
      demoState === "STARTING" ||
      demoState === "ATTRACT" ||
      demoState === "MENU"
    ) {
      // Keep menu BGM during background demo playback.
      return "START";
    }
    return resolveSceneForPhase(phase);
  };

  const syncAudioToPhase = (
    phase: GamePhase,
    previousPhase: GamePhase | null,
  ): void => {
    if (phase === "START" && suppressNextStartPhaseEffects) {
      waitingForStartIntroAudioCompletion = false;
      clearStartMenuMusicTimer();
      return;
    }
    const nextScene = resolveSceneForAudioContext(phase);
    const nextMusicAssetId = AudioManager.getSceneMusicAsset(nextScene);
    AudioManager.clearPendingBackgroundMusicForTarget(nextMusicAssetId);
    AudioManager.stopCue("SPLASH_STING");
    if (phase !== "START") {
      pendingDemoStartupAfterIntro = null;
      startUI.cancelTitleIntroAudioSync();
      AudioManager.stopCue("LOGO_STING");
    }

    if (phase === "START") {
      if (waitingForStartIntroAudioCompletion) {
        if (startMenuMusicTimer === null) {
          scheduleStartMenuMusic();
        }
        return;
      }
      const shouldWaitForIntro =
        previousPhase === null || previousPhase !== "START";
      if (shouldWaitForIntro) {
        waitingForStartIntroAudioCompletion = true;
        scheduleStartMenuMusic();
      } else {
        waitingForStartIntroAudioCompletion = false;
        clearStartMenuMusicTimer();
        void AudioManager.playSceneMusic("START", { restart: false });
        startPendingDemoStartupAfterIntro();
      }
      return;
    }

    waitingForStartIntroAudioCompletion = false;
    clearStartMenuMusicTimer();
    void AudioManager.playSceneMusic(nextScene);
  };

  async function teardownDemoAndShowMenu(): Promise<void> {
    if (!demoController?.isDemoActive()) return;
    demoOverlay?.hideAll();
    await demoController.teardown();
    localStorage.setItem(DEMO_SEEN_KEY, "1");
    demoController = null;
    demoOverlay = null;
    starfieldInitializedForDemo = false;
    // Remove demo-specific starfield state
    elements.starsContainer.classList.remove("demo-stars", "active");
    screenController.showScreen("start");
    startUI.resetStartButtons(false);
    startUI.setBeforeAction(null);
  }

  async function teardownDemoForAction(): Promise<void> {
    if (!demoController?.isDemoActive()) return;
    suppressNextStartPhaseEffects = true;
    demoOverlay?.hideAll();
    await demoController.teardown();
    localStorage.setItem(DEMO_SEEN_KEY, "1");
    demoController = null;
    demoOverlay = null;
    starfieldInitializedForDemo = false;
    elements.starsContainer.classList.remove("demo-stars", "active");
    startUI.setBeforeAction(null);
  }

  async function startDemoSession(showAttract = true): Promise<void> {
    // Clean up any existing demo first
    if (demoController?.isDemoActive()) {
      await demoController.teardown().catch(() => {});
    }
    demoController = null;
    demoOverlay = null;
    starfieldInitializedForDemo = false;

    // Leave any active game
    if (game.getPhase() !== "START") {
      await game.leaveGame().catch(() => {});
    }

    demoController = new DemoController(game);
    demoOverlay = new DemoOverlayUI(viewport.isMobile);

    demoOverlay.setCallbacks({
      onTapToStart: () => {
        demoController!.enterTutorial();
        syncAudioToPhase(currentPhase, currentPhase);
        demoOverlay!.showTutorial(viewport.isMobile);
      },
      onTutorialComplete: () => {
        // Tutorial finished → player keeps free-playing with Exit Demo button
        demoController!.enterFreePlay();
        syncAudioToPhase(currentPhase, currentPhase);
        localStorage.setItem(DEMO_SEEN_KEY, "1");
        demoOverlay!.showExitButton(() => {
          // Keep the battle running — transition to MENU state (same as skip)
          demoOverlay?.hideAll();
          demoController?.enterMenu();
          syncAudioToPhase(currentPhase, currentPhase);
          screenController.showScreen("start");
          startUI.resetStartButtons(true);
        });
      },
      onSkipToMenu: () => {
        // Keep background battle alive — just transition to MENU state
        demoOverlay?.hideAll();
        demoController?.enterMenu();
        syncAudioToPhase(currentPhase, currentPhase);
        screenController.showScreen("start");
        startUI.resetStartButtons(true);
        localStorage.setItem(DEMO_SEEN_KEY, "1");
      },
      onPauseGame: () => demoController?.pauseGame(),
      onResumeGame: () => demoController?.resumeGame(),
      getShipColor: () => {
        const myId = game.getMyPlayerId();
        const players = game.getPlayers();
        const myPlayer = myId ? players.find((p) => p.id === myId) : players[0];
        return myPlayer?.color.primary ?? "#00f0ff";
      },
      getShipPos: () => game.getLocalShipViewportPos(),
      setZoom: (boost) => game.setDemoZoomBoost(boost),
    });

    startUI.setBeforeAction(teardownDemoForAction);

    await demoController.startDemo();
    syncAudioToPhase(currentPhase, currentPhase);

    // Activate the starfield immediately so it's visible in the attract overlay.
    // forceDemoStarfield bypasses the activeScreen guard in screens.ts.
    if (!starfieldInitializedForDemo) {
      elements.starsContainer.classList.add("demo-stars");
      screenController.forceDemoStarfield(6 as MapId);
      starfieldInitializedForDemo = true;
    }

    if (showAttract) {
      demoOverlay.showAttract();
    } else {
      // Second visit: skip attract, go straight to background MENU state
      demoController.enterMenu();
      syncAudioToPhase(currentPhase, currentPhase);
      screenController.showScreen("start");
      startUI.resetStartButtons(false);
    }
  }

  async function handleDemoStartupFailure(error: unknown): Promise<void> {
    console.error("[Main] Demo failed to start, falling back to menu:", error);
    const ctrl = demoController as DemoController | null;
    if (ctrl?.isDemoActive()) {
      await ctrl.teardown().catch(() => {});
    }
    demoController = null;
    demoOverlay = null;
    screenController.showScreen("start");
    startUI.resetStartButtons(false);
    startUI.setBeforeAction(null);
  }

  function queueDemoStartupAfterIntro(showAttract: boolean): void {
    pendingDemoStartupAfterIntro = { showAttract };
    if (showAttract) {
      // First-run demo should show attract CTA instead of menu buttons.
      elements.mainButtons.style.display = "none";
      elements.joinSection.classList.remove("active");
    }
  }

  function startPendingDemoStartupAfterIntro(): void {
    if (waitingForStartIntroAudioCompletion || currentPhase !== "START") {
      return;
    }
    if (pendingDemoStartupAfterIntro === null) {
      return;
    }

    const { showAttract } = pendingDemoStartupAfterIntro;
    pendingDemoStartupAfterIntro = null;
    void startDemoSession(showAttract).catch((error) => {
      void handleDemoStartupFailure(error);
    });
  }

  const syncScreenToPhase = (
    phase: GamePhase,
    triggerPhaseEffects: boolean,
    previousPhase: GamePhase | null,
  ): void => {
    if (phase !== "LOBBY") {
      lobbyUI.closeMapPicker();
    }

    // During demo: intercept game phases to show background battle without HUD
    if (demoController?.isDemoActive()) {
      const demoState = demoController.getState();
      switch (phase) {
        case "LOBBY":
          // Demo just created room — suppress lobby screen
          return;
        case "COUNTDOWN":
        case "PLAYING":
        case "ROUND_END": {
          // Show game canvas + starfield, but suppress HUD and normal game UI
          game.setMapElementsVisible(true);
          if (!starfieldInitializedForDemo) {
            elements.starsContainer.classList.add("demo-stars");
            screenController.forceDemoStarfield(6 as MapId);
            starfieldInitializedForDemo = true;
          }
          if (demoState === "MENU") {
            // MENU state: show start screen over the game canvas
            screenController.showScreen("start");
            startUI.resetStartButtons(false);
          } else {
            elements.startScreen.classList.add("hidden");
          }
          elements.hud.classList.remove("active");
          // Keyboard enabled only when player is in control
          if (demoState !== "TUTORIAL" && demoState !== "FREEPLAY") {
            game.setKeyboardInputEnabled(false);
          }
          // Forward to DemoController for countdown skip + respawn timer cleanup
          demoController.onPhaseChange(phase);
          return;
        }
        case "GAME_END":
          // Auto-restart — DemoController handles this via onPhaseChange
          demoController.onPhaseChange(phase);
          return;
        case "START":
          // Demo tore itself down — fall through to normal START handling
          break;
      }
    }

    switch (phase) {
      case "START":
        if (suppressNextStartPhaseEffects) {
          suppressNextStartPhaseEffects = false;
          break;
        }
        screenController.showScreen("start");
        startUI.resetStartButtons(previousPhase !== "START");
        // Restart the background AI battle when returning from a real match.
        // Only when demoController is fully gone (not mid-teardown).
        if (previousPhase !== null && previousPhase !== "START" && demoController === null) {
          queueDemoStartupAfterIntro(false);
        }
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
      // Suppress lobby/HUD updates during demo attract
      if (demoController?.isDemoActive()) return;
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
      if (currentPhase !== "COUNTDOWN") {
        return;
      }
      playCountdownFeedback(count);
    },
    onGameModeChange: (mode: GameMode) => {
      if (demoController?.isDemoActive()) return;
      lobbyUI.setModeUI(mode, "remote");
    },
    onRoundResult: () => {
      if (demoController?.isDemoActive()) return;
      screenController.updateRoundResultOverlay();
    },
    onAdvancedSettingsChange: (settings) => {
      if (demoController?.isDemoActive()) return;
      advancedSettingsUI.updateAdvancedSettingsUI(settings);
      screenController.updateScoreTrack(game.getPlayers());
    },
    onSystemMessage: (message, durationMs) => {
      if (demoController?.isDemoActive()) return;
      screenController.showSystemMessage(message, durationMs);
    },
    onMapChange: (mapId: MapId) => {
      if (demoController?.isDemoActive()) return;
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
      playDemo: async () => {
        try {
          await startDemoSession();
        } catch (e) {
          console.error("[Main] Debug: demo failed to start:", e);
        }
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
    return; // Skip demo when platform-injected room code is present
  }

  // Always start a background AI battle.
  // Show the attract overlay only on first visit; otherwise go straight
  // to the menu with ships visible behind it.
  const showAttractOverlay = !localStorage.getItem(DEMO_SEEN_KEY);
  queueDemoStartupAfterIntro(showAttractOverlay);
  startPendingDemoStartupAfterIntro();
}

// Start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
