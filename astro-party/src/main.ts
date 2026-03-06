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
import { isDemoSeen, markDemoSeen } from "./preferences/demoSeen";
import {
  gameplayStart as platformGameplayStart,
  gameplayStop as platformGameplayStop,
  getPlayerName as getPlatformPlayerName,
  getRoomCode as getPlatformRoomCode,
  isPlatformRuntime,
  onBackButton as onPlatformBackButton,
  onLeaveGame as onPlatformLeaveGame,
  requestPlatformLeaveGame,
} from "./platform/oasizBridge";

declare const __APP_VERSION__: string;
declare const __APP_BUILD_TAG__: string;

declare global {
  interface Window {
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
    case "MATCH_INTRO":
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
  const lobbyUI = createLobbyUI(game, viewport.isMobile, leaveModal.openLeaveModal);
  bindEndScreenUI(game, leaveModal.openLeaveModal);
  const isPlatform = isPlatformRuntime();
  let currentPhase: GamePhase = "START";
  let waitingForStartIntroAudioCompletion = false;
  let waitingForStartIntroVisualCompletion = false;
  let startMenuMusicTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingDemoStartupAfterIntro: { isFirstVisit: boolean } | null = null;
  let pendingDemoStartupInProgress = false;
  let suppressNextStartPhaseEffects = false;
  let liveMatchIntroShownForSequence = false;
  let liveMatchIntroStartPoll: ReturnType<typeof setInterval> | null = null;
  let liveMatchIntroTrackPoll: ReturnType<typeof setInterval> | null = null;
  let liveMatchIntroZoomPoll: ReturnType<typeof setInterval> | null = null;
  let liveMatchIntroHideTimer: ReturnType<typeof setTimeout> | null = null;
  let touchLayoutSyncRaf = 0;
  const liveIntroOverlay = document.getElementById(
    "demoPlayerIntroOverlay",
  ) as HTMLElement | null;
  const liveIntroRing = document.getElementById(
    "demoPlayerIntroRing",
  ) as HTMLElement | null;
  const demoInputActionSubscribers = new Set<
    (action: "rotate" | "fire" | "dash") => void
  >();
  // Demo state
  let demoController: DemoController | null = null;
  let demoOverlay: DemoOverlayUI | null = null;
  let platformBackInFlight = false;
  let offPlatformBackButton: (() => void) | null = null;
  let offPlatformLeaveGame: (() => void) | null = null;
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
    onIntroVisualComplete: () => {
      if (waitingForStartIntroVisualCompletion) {
        waitingForStartIntroVisualCompletion = false;
      }
      startPendingDemoStartupAfterIntro();
    },
  });
  startUI.setOnActionCommit(() => {
    pendingDemoStartupAfterIntro = null;
    pendingDemoStartupInProgress = false;
  });
  startUI.setOnOpenSettings(() => {
    settingsUI.updateSettingsUI();
    settingsUI.openSettingsModal();
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
      waitingForStartIntroVisualCompletion = false;
      clearStartMenuMusicTimer();
      return;
    }
    const nextScene = resolveSceneForAudioContext(phase);
    const nextMusicAssetId = AudioManager.getSceneMusicAsset(nextScene);
    AudioManager.clearPendingBackgroundMusicForTarget(nextMusicAssetId);
    AudioManager.stopCue("SPLASH_STING");
    if (phase !== "START") {
      pendingDemoStartupAfterIntro = null;
      pendingDemoStartupInProgress = false;
      waitingForStartIntroVisualCompletion = false;
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
        waitingForStartIntroVisualCompletion = true;
        scheduleStartMenuMusic();
      } else {
        waitingForStartIntroAudioCompletion = false;
        waitingForStartIntroVisualCompletion = false;
        clearStartMenuMusicTimer();
        void AudioManager.playSceneMusic("START", { restart: false });
        startPendingDemoStartupAfterIntro();
      }
      return;
    }

    waitingForStartIntroAudioCompletion = false;
    waitingForStartIntroVisualCompletion = false;
    clearStartMenuMusicTimer();
    void AudioManager.playSceneMusic(nextScene);
  };

  const clearLiveMatchIntroTimers = (): void => {
    if (liveMatchIntroStartPoll !== null) {
      clearInterval(liveMatchIntroStartPoll);
      liveMatchIntroStartPoll = null;
    }
    if (liveMatchIntroTrackPoll !== null) {
      clearInterval(liveMatchIntroTrackPoll);
      liveMatchIntroTrackPoll = null;
    }
    if (liveMatchIntroZoomPoll !== null) {
      clearInterval(liveMatchIntroZoomPoll);
      liveMatchIntroZoomPoll = null;
    }
    if (liveMatchIntroHideTimer !== null) {
      clearTimeout(liveMatchIntroHideTimer);
      liveMatchIntroHideTimer = null;
    }
  };

  const hideLiveMatchPlayerIntro = (): void => {
    clearLiveMatchIntroTimers();
    game.setDemoZoomBoost(null);
    if (!liveIntroOverlay || !liveIntroRing) return;
    liveIntroOverlay.classList.add("hidden");
    liveIntroOverlay.classList.remove("spot-panel", "spot-action", "spot-dimmed");
    liveIntroOverlay.style.pointerEvents = "none";
    liveIntroOverlay.style.removeProperty("--spot-r");
    liveIntroOverlay.style.removeProperty("--spot-bg-alpha");
    liveIntroRing.style.opacity = "0";
    liveIntroRing.style.removeProperty("border-color");
    liveIntroRing.style.removeProperty("box-shadow");
    liveIntroRing.style.removeProperty("width");
    liveIntroRing.style.removeProperty("height");
    liveIntroRing.style.removeProperty("left");
    liveIntroRing.style.removeProperty("top");
  };

  const canPlayLiveMatchPlayerIntro = (): boolean => {
    if (demoController?.isDemoActive()) return false;
    if (game.getExperienceContext() !== "LIVE_MATCH") return false;
    const sessionMode = game.getSessionMode();
    if (sessionMode === "online") return true;
    return game.getLocalPlayerCount() === 1;
  };

  const getOverlayShipViewportPos = (): { x: number; y: number } | null => {
    const pos = game.getLocalShipViewportPos();
    if (!pos) return null;
    // On portrait mobile the game canvas is CSS-rotated -90deg so the
    // logical game coords don't map directly to viewport CSS pixels.
    const isPortraitMobile =
      window.matchMedia("(pointer: coarse)").matches &&
      window.matchMedia("(orientation: portrait)").matches;
    if (!isPortraitMobile) return pos;
    const vw = window.innerWidth; // short edge (portrait)
    const vh = window.innerHeight; // long edge (portrait)
    return {
      x: pos.y * (vw / vh),
      y: vh - pos.x * (vh / vw),
    };
  };

  const startLiveMatchPlayerIntro = (): void => {
    if (liveMatchIntroShownForSequence) return;
    if (!canPlayLiveMatchPlayerIntro()) return;
    if (!liveIntroOverlay || !liveIntroRing) return;

    const myPlayerId = game.getMyPlayerId();
    if (!myPlayerId) return;
    const myPlayer = game.getPlayers().find((player) => player.id === myPlayerId);
    const shipColor = myPlayer?.color.primary ?? "#00f0ff";

    const begin = (initialPos: { x: number; y: number }): void => {
      liveMatchIntroShownForSequence = true;
      hideLiveMatchPlayerIntro();

      liveIntroOverlay.classList.remove("hidden");
      liveIntroOverlay.style.pointerEvents = "none";
      liveIntroRing.style.removeProperty("width");
      liveIntroRing.style.removeProperty("height");
      liveIntroRing.style.borderColor = shipColor;
      liveIntroRing.style.boxShadow = `0 0 18px ${shipColor}, 0 0 40px ${shipColor}55`;
      liveIntroRing.style.opacity = "1";
      liveIntroOverlay.style.setProperty("--spot-x", `${initialPos.x}px`);
      liveIntroOverlay.style.setProperty("--spot-y", `${initialPos.y}px`);
      liveIntroOverlay.style.setProperty("--spot-r", "96px");
      liveIntroOverlay.style.setProperty("--spot-bg-alpha", "0.84");
      liveIntroRing.style.left = `${initialPos.x}px`;
      liveIntroRing.style.top = `${initialPos.y}px`;

      const introBoostStart = 1.34;
      const introZoomDurationMs = 1320;
      const introZoomStartAt = performance.now();
      game.setDemoZoomBoost(introBoostStart);
      liveMatchIntroZoomPoll = setInterval(() => {
        const pos = getOverlayShipViewportPos();
        if (!pos) {
          hideLiveMatchPlayerIntro();
          return;
        }
        liveIntroRing.style.left = `${pos.x}px`;
        liveIntroRing.style.top = `${pos.y}px`;
        liveIntroOverlay.style.setProperty("--spot-x", `${pos.x}px`);
        liveIntroOverlay.style.setProperty("--spot-y", `${pos.y}px`);

        const elapsed = performance.now() - introZoomStartAt;
        const t = Math.max(0, Math.min(1, elapsed / introZoomDurationMs));
        const eased = t * t * t * (t * (t * 6 - 15) + 10);
        const boost = 1 + (introBoostStart - 1) * (1 - eased);
        const spotRadius = 96 + (272 - 96) * eased;
        const veilAlpha = 0.84 * (1 - eased);
        game.setDemoZoomBoost(boost);
        liveIntroOverlay.style.setProperty("--spot-r", `${spotRadius.toFixed(1)}px`);
        liveIntroOverlay.style.setProperty(
          "--spot-bg-alpha",
          `${veilAlpha.toFixed(3)}`,
        );
        liveIntroRing.style.opacity = `${Math.max(0, 1 - eased)}`;
        if (t >= 1) {
          hideLiveMatchPlayerIntro();
        }
      }, 16);
    };

    const initialPos = getOverlayShipViewportPos();
    if (initialPos) {
      begin(initialPos);
      return;
    }

    let attempts = 0;
    const maxAttempts = 24;
    liveMatchIntroStartPoll = setInterval(() => {
      attempts += 1;
      const pos = getOverlayShipViewportPos();
      if (pos) {
        begin(pos);
        return;
      }
      if (attempts >= maxAttempts && liveMatchIntroStartPoll !== null) {
        clearInterval(liveMatchIntroStartPoll);
        liveMatchIntroStartPoll = null;
      }
    }, 16);
  };

  const syncPlatformGameplayActivity = (): void => {
    const demoState = demoController?.isDemoActive()
      ? demoController.getState()
      : null;
    const isInteractiveDemo =
      demoState === "TUTORIAL";
    const isGameplayPhase =
      currentPhase === "MATCH_INTRO" ||
      currentPhase === "COUNTDOWN" ||
      currentPhase === "PLAYING" ||
      currentPhase === "ROUND_END";
    if (isGameplayPhase && (demoState === null || isInteractiveDemo)) {
      platformGameplayStart();
      return;
    }
    platformGameplayStop();
  };

  const runWithSuppressedStartPhaseEffects = async <T>(
    action: () => Promise<T>,
  ): Promise<T> => {
    const previous = suppressNextStartPhaseEffects;
    suppressNextStartPhaseEffects = true;
    try {
      return await action();
    } finally {
      suppressNextStartPhaseEffects = previous;
    }
  };

  async function teardownDemoAndShowMenu(): Promise<void> {
    hideLiveMatchPlayerIntro();
    if (!demoController?.isDemoActive()) return;
    demoOverlay?.hideAll();
    await demoController.teardown();
    demoInputActionSubscribers.clear();
    markDemoSeen();
    demoController = null;
    demoOverlay = null;
    // Remove demo-specific starfield state
    elements.starsContainer.classList.remove("demo-stars", "active");
    syncPlatformGameplayActivity();
    screenController.showScreen("start");
    syncDemoTouchLayoutForState();
    startUI.resetStartButtons(false);
    startUI.setBeforeAction(null);
  }

  async function teardownDemoForAction(): Promise<void> {
    hideLiveMatchPlayerIntro();
    const activeDemoController = demoController;
    if (!activeDemoController?.isDemoActive()) return;
    await runWithSuppressedStartPhaseEffects(async () => {
      demoOverlay?.hideAll();
      await activeDemoController.teardown();
      demoInputActionSubscribers.clear();
      markDemoSeen();
      demoController = null;
      demoOverlay = null;
      elements.starsContainer.classList.remove("demo-stars", "active");
      syncPlatformGameplayActivity();
      startUI.setBeforeAction(null);
      if (viewport.isMobile) {
        game.clearTouchLayout();
      }
    });
  }

  const closeSettingsModalIfOpen = (): boolean => {
    if (!settingsUI.isSettingsModalOpen()) return false;
    settingsUI.closeSettingsModal();
    return true;
  };

  const closeAdvancedSettingsIfOpen = (): boolean => {
    if (!elements.advancedSettingsModal.classList.contains("active")) {
      return false;
    }
    elements.advancedSettingsModal.classList.remove("active");
    elements.advancedSettingsBackdrop.classList.remove("active");
    return true;
  };

  const closeMapPickerIfOpen = (): boolean => {
    if (!elements.mapPickerModal.classList.contains("active")) {
      return false;
    }
    lobbyUI.closeMapPicker();
    return true;
  };

  const closeKeySelectIfOpen = (): boolean => {
    if (!elements.keySelectModal.classList.contains("active")) {
      return false;
    }
    elements.keySelectModal.classList.remove("active");
    elements.keySelectBackdrop.classList.remove("active");
    return true;
  };

  const closeJoinSectionIfOpen = (): boolean => {
    if (!startUI.isJoinSectionOpen()) {
      return false;
    }
    startUI.closeJoinSection();
    return true;
  };

  const closeTopmostOverlay = (): boolean => {
    if (leaveModal.isLeaveModalOpen()) {
      leaveModal.closeLeaveModal();
      return true;
    }
    if (closeSettingsModalIfOpen()) return true;
    if (closeAdvancedSettingsIfOpen()) return true;
    if (closeMapPickerIfOpen()) return true;
    if (closeKeySelectIfOpen()) return true;
    if (closeJoinSectionIfOpen()) return true;
    return false;
  };

  const closeAllOverlays = (): void => {
    leaveModal.closeLeaveModal();
    settingsUI.closeSettingsModal();
    elements.advancedSettingsModal.classList.remove("active");
    elements.advancedSettingsBackdrop.classList.remove("active");
    lobbyUI.closeMapPicker();
    elements.keySelectModal.classList.remove("active");
    elements.keySelectBackdrop.classList.remove("active");
    startUI.closeJoinSection();
  };

  const handlePlatformBack = async (): Promise<void> => {
    if (!isPlatform || platformBackInFlight) {
      return;
    }
    platformBackInFlight = true;
    try {
      if (closeTopmostOverlay()) {
        return;
      }

      if (demoController?.isDemoActive()) {
        const demoState = demoController.getState();
        if (demoState === "TUTORIAL") {
          await teardownDemoAndShowMenu();
          return;
        }
        requestPlatformLeaveGame();
        return;
      }

      if (currentPhase === "LOBBY") {
        leaveModal.openLeaveModal("LOBBY_LEAVE");
        return;
      }

      if (
        currentPhase === "MATCH_INTRO" ||
        currentPhase === "COUNTDOWN" ||
        currentPhase === "PLAYING" ||
        currentPhase === "ROUND_END" ||
        currentPhase === "GAME_END"
      ) {
        leaveModal.openLeaveModal("MATCH_LEAVE");
        return;
      }

      requestPlatformLeaveGame();
    } finally {
      platformBackInFlight = false;
    }
  };

  function syncDemoTouchLayoutForState(): void {
    if (!viewport.isMobile) {
      return;
    }
    if (!demoController?.isDemoActive()) {
      const isGameplayPhase =
        currentPhase === "MATCH_INTRO" ||
        currentPhase === "COUNTDOWN" ||
        currentPhase === "PLAYING" ||
        currentPhase === "ROUND_END";
      if (isGameplayPhase) {
        game.updateTouchLayout();
      } else {
        game.clearTouchLayout();
      }
      return;
    }
    const demoState = demoController.getState();
    if (demoState === "TUTORIAL") {
      game.updateTouchLayout();
    } else {
      game.clearTouchLayout();
    }
  }

  function scheduleTouchLayoutSync(): void {
    if (!viewport.isMobile) {
      return;
    }
    if (touchLayoutSyncRaf !== 0) {
      return;
    }
    touchLayoutSyncRaf = requestAnimationFrame(() => {
      touchLayoutSyncRaf = 0;
      syncDemoTouchLayoutForState();
    });
  }

  viewport.subscribeViewportChange(() => {
    scheduleTouchLayoutSync();
  });

  async function startDemoSession(): Promise<void> {
    // Reset cover so re-starts also get a clean fade-in.
    document.getElementById("attractCover")?.classList.remove("revealed");

    // Clean up any existing demo first
    if (demoController?.isDemoActive()) {
      await demoController.teardown().catch(() => {});
    }
    demoInputActionSubscribers.clear();
    demoController = null;
    demoOverlay = null;
    // Leave any active game
    if (game.getPhase() !== "START") {
      await game.leaveGame().catch(() => {});
    }

    demoController = new DemoController(game);
    demoOverlay = new DemoOverlayUI(viewport.isMobile);

    demoOverlay.setCallbacks({
      onTutorialComplete: () => {
        // "Start Playing" promotes tutorial directly into normal live endless.
        demoOverlay?.hideAll();
        demoController?.promoteToLiveMatch();
        demoInputActionSubscribers.clear();
        demoController = null;
        demoOverlay = null;
        startUI.setBeforeAction(null);
        elements.starsContainer.classList.remove("demo-stars");
        markDemoSeen();

        // Re-run normal phase routing now that demo gating is gone.
        syncScreenToPhase(currentPhase, false, currentPhase);
        screenController.updateScoreTrack(game.getPlayers());
        screenController.updateHudControlsVisibility();
        syncAudioToPhase(currentPhase, currentPhase);
        syncDemoTouchLayoutForState();
        syncPlatformGameplayActivity();
      },
      onPauseGame: () => demoController?.pauseGame(),
      onResumeGame: () => demoController?.resumeGame(),
      getShipColor: () => {
        const myId = game.getMyPlayerId();
        const players = game.getPlayers();
        const myPlayer = myId ? players.find((p) => p.id === myId) : players[0];
        return myPlayer?.color.primary ?? "#00f0ff";
      },
      getShipPos: () => getOverlayShipViewportPos(),
      setZoom: (boost) => game.setDemoZoomBoost(boost),
      subscribeInputAction: (handler) => {
        demoInputActionSubscribers.add(handler);
        return () => {
          demoInputActionSubscribers.delete(handler);
        };
      },
      setDemoInputBlock: (blocked) => game.setDemoInputBlock(blocked),
    });

    startUI.setBeforeAction(teardownDemoForAction);

    await demoController.startDemo();
    game.setExperienceContext("ATTRACT_BACKGROUND");
    syncAudioToPhase(currentPhase, currentPhase);
    syncDemoTouchLayoutForState();
    syncPlatformGameplayActivity();

    // Activate starfield once per demo session. In demo flows, this runs
    // before any start-screen overlays are shown.
    elements.starsContainer.classList.add("demo-stars");
    screenController.forceDemoStarfield(game.getMapId());

    // Fade the cover out — gracefully reveals the running attract game.
    document.getElementById("attractCover")?.classList.add("revealed");

    screenController.showScreen("start");
  }

  async function handleDemoStartupFailure(error: unknown): Promise<void> {
    console.error("[Main] Demo failed to start, falling back to menu:", error);
    const ctrl = demoController as DemoController | null;
    if (ctrl?.isDemoActive()) {
      await ctrl.teardown().catch(() => {});
    }
    demoInputActionSubscribers.clear();
    demoController = null;
    demoOverlay = null;
    syncPlatformGameplayActivity();
    screenController.showScreen("start");
    syncDemoTouchLayoutForState();
    startUI.resetStartButtons(false);
    startUI.setBeforeAction(null);
  }

  function queueDemoStartupAfterIntro(isFirstVisit: boolean): void {
    pendingDemoStartupAfterIntro = { isFirstVisit };
    if (isFirstVisit) {
      // Keep buttons hidden until user taps or tap hint times out.
      elements.mainButtons.style.display = "none";
      elements.startSecondaryActions.style.display = "none";
      elements.joinSection.classList.remove("active");
    }
  }

  function triggerAutoTutorial(): void {
    if (!demoController || !demoOverlay) return;
    game.setExperienceContext("ONBOARDING_TUTORIAL");
    demoController.enterTutorial();
    // Hide the start screen so the game canvas is visible beneath the
    // tutorial overlay (which has a transparent/semi-transparent background).
    elements.startScreen.classList.add("hidden");
    syncAudioToPhase(currentPhase, currentPhase);
    syncDemoTouchLayoutForState();
    syncPlatformGameplayActivity();
    demoOverlay.showTutorial(viewport.isMobile);
  }

  startUI.setOnHowToPlay(async () => {
    pendingDemoStartupAfterIntro = null;
    pendingDemoStartupInProgress = false;
    if (!demoController?.isDemoActive()) {
      // Bootstrap the demo session — leaves state at ATTRACT so
      // triggerAutoTutorial() → enterTutorial() succeeds.
      await startDemoSession();
    }
    triggerAutoTutorial();
  });

  function startPendingDemoStartupAfterIntro(): void {
    if (
      waitingForStartIntroAudioCompletion ||
      waitingForStartIntroVisualCompletion ||
      currentPhase !== "START"
    ) {
      return;
    }
    if (pendingDemoStartupInProgress) {
      return;
    }
    if (pendingDemoStartupAfterIntro === null) {
      return;
    }

    const pending = pendingDemoStartupAfterIntro;
    pendingDemoStartupInProgress = true;
    void (async () => {
      try {
        if (
          pendingDemoStartupAfterIntro !== pending ||
          currentPhase !== "START"
        ) {
          return;
        }
        pendingDemoStartupAfterIntro = null;
        // Demo always starts in background as soon as intro settles.
        await startDemoSession();

        if (pending.isFirstVisit) {
          // Show 5s tap hint; tap reveals buttons, timeout launches tutorial.
          const result = await startUI.showTapHint();
          if (result === "tapped") {
            // User engaged — enter menu state and show start buttons.
            demoController?.enterMenu();
            syncAudioToPhase(currentPhase, currentPhase);
            syncDemoTouchLayoutForState();
            syncPlatformGameplayActivity();
            startUI.resetStartButtons(false);
          } else {
            // Timeout — state is still ATTRACT; enterTutorial() will succeed.
            await startUI.playTitleOutro();
            triggerAutoTutorial();
          }
        } else {
          // Returning player — enter menu state immediately and show start buttons.
          demoController?.enterMenu();
          syncAudioToPhase(currentPhase, currentPhase);
          syncDemoTouchLayoutForState();
          syncPlatformGameplayActivity();
          startUI.resetStartButtons(false);
        }
      } catch (error) {
        void handleDemoStartupFailure(error);
      } finally {
        pendingDemoStartupInProgress = false;
      }
    })();
  }

  const syncScreenToPhase = (
    phase: GamePhase,
    triggerPhaseEffects: boolean,
    previousPhase: GamePhase | null,
  ): void => {
    if (phase !== "LOBBY") {
      lobbyUI.closeMapPicker();
    }
    if (phase === "START" || phase === "LOBBY" || phase === "GAME_END") {
      liveMatchIntroShownForSequence = false;
      hideLiveMatchPlayerIntro();
    }

    // During demo: intercept game phases to show background battle without HUD
    if (demoController?.isDemoActive()) {
      const demoState = demoController.getState();
      switch (phase) {
        case "LOBBY":
          // Demo just created room — suppress lobby screen
          return;
        case "MATCH_INTRO":
        case "COUNTDOWN":
        case "PLAYING":
        case "ROUND_END": {
          // Show game canvas + starfield, but suppress HUD and normal game UI
          if (demoState === "MENU") {
            // MENU state: show start screen over the game canvas
            screenController.showScreen("start");
            startUI.resetStartButtons(false);
          } else if (demoState === "TUTORIAL") {
            // TUTORIAL state: hide start screen so the tutorial overlay sits
            // directly on the raw canvas.
            elements.startScreen.classList.add("hidden");
          }
          // STARTING / ATTRACT: no-op — keep the start screen covering the
          // canvas while the demo boots and during the tap-hint window.
          // startDemoSession() explicitly shows the start screen once ready.
          elements.hud.classList.remove("active");
          // Keyboard enabled only when player is in control
          if (demoState !== "TUTORIAL") {
            game.setKeyboardInputEnabled(false);
          }
          if (viewport.isMobile) {
            if (demoState === "TUTORIAL") {
              game.updateTouchLayout();
            } else {
              game.clearTouchLayout();
            }
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
          break;
        }
        if (previousPhase === "LOBBY") {
          void AudioManager.playLobbyExitTransitionCue();
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
        if (previousPhase === "START") {
          void AudioManager.playLobbyEnterTransitionCue();
        }
        screenController.showScreen("lobby");
        lobbyUI.updateRoomCode(game.getRoomCode());
        lobbyUI.updateMapSelector();
        mapPreviewUI.updateMapPreview();
        screenController.resetEndScreenButtons();
        break;
      case "MATCH_INTRO":
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
      syncDemoTouchLayoutForState();
      if (phase === "MATCH_INTRO" && previousPhase !== "MATCH_INTRO") {
        startLiveMatchPlayerIntro();
      }
      syncAudioToPhase(phase, previousPhase);
      syncPlatformGameplayActivity();
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
    onRulesetChange: (ruleset) => {
      if (demoController?.isDemoActive()) return;
      lobbyUI.setRulesetUI(ruleset, "remote");
      lobbyUI.updateMapSelector();
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
    onLocalInputAction: (action) => {
      if (!demoController?.isDemoActive()) {
        return;
      }
      for (const handler of [...demoInputActionSubscribers]) {
        handler(action);
      }
    },
  });

  if (isPlatform) {
    offPlatformBackButton = onPlatformBackButton(() => {
      void handlePlatformBack();
    });
    offPlatformLeaveGame = onPlatformLeaveGame(() => {
      closeAllOverlays();
      AudioManager.stopMusic();
    });

    window.addEventListener(
      "beforeunload",
      () => {
        offPlatformBackButton?.();
        offPlatformLeaveGame?.();
        offPlatformBackButton = null;
        offPlatformLeaveGame = null;
      },
      { once: true },
    );
  }

  settingsUI.updateSettingsUI();
  advancedSettingsUI.updateAdvancedSettingsUI();
  screenController.showScreen("start");
  syncDemoTouchLayoutForState();
  startUI.resetStartButtons(true);
  syncAudioToPhase(currentPhase, null);
  syncPlatformGameplayActivity();

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
        syncDemoTouchLayoutForState();
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

  const injectedRoomCode = getPlatformRoomCode()?.toUpperCase() ?? "";
  if (injectedRoomCode.length > 0) {
    console.log("[Main] Platform injected room code:", injectedRoomCode);
    try {
      game.setSessionMode("online");
      const success = await game.joinRoom(injectedRoomCode);
      if (success) {
        const playerName = getPlatformPlayerName();
        if (playerName) {
          console.log("[Main] Setting player name:", playerName);
          game.setPlayerName(playerName);
        }
      } else {
        console.log("[Main] Failed to auto-join room, staying on start screen");
      }
    } catch (e) {
      console.error("[Main] Error auto-joining room:", e);
    }
    return; // Skip demo when platform-injected room code is present
  }

  // Always start a background AI battle after intro.
  // First visit: show 5s tap hint; tap reveals buttons, timeout launches tutorial.
  // Returning: buttons reveal directly.
  const isFirstVisit = !isDemoSeen();
  queueDemoStartupAfterIntro(isFirstVisit);
  startPendingDemoStartupAfterIntro();
}

// Start when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

