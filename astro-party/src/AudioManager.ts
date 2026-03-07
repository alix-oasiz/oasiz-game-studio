// ============= AUDIO MANAGER =============
// Handles game audio through Howler using the asset manifest.

import { Howl } from "howler";
import { SettingsManager } from "./SettingsManager";
import {
  AUDIO_ASSETS,
  AUDIO_CUE_ASSETS,
  AUDIO_SCENE_MUSIC,
  resolveAudioAssetUrl,
  type AudioAssetChannel,
  type AudioAssetId,
  type AudioCueId,
  type AudioSceneId,
} from "./audio/assetManifest";

interface PlayMusicOptions {
  restart?: boolean;
  /** Override the fade-in duration in ms. Defaults to MUSIC_FADE_IN_MS. */
  fadeInMs?: number;
}

function collectBackgroundMusicAssetIds(): ReadonlySet<AudioAssetId> {
  const ids = new Set<AudioAssetId>();
  const sceneAssets = Object.values(AUDIO_SCENE_MUSIC);
  for (const sceneAssetId of sceneAssets) {
    if (sceneAssetId !== null) {
      ids.add(sceneAssetId);
    }
  }
  return ids;
}

const BACKGROUND_MUSIC_ASSET_IDS = collectBackgroundMusicAssetIds();
const MUSIC_FADE_IN_MS = 220;
const MUSIC_FADE_OUT_MS = 180;
/** Slow fade-in used only for the gameplay BGM (not menu/results music). */
const GAMEPLAY_BGM_FADE_IN_MS = 2500;
const FIRE_SFX_MIN_INTERVAL_MS = 70;
const GAMEPLAY_FX_ASSET_IDS: ReadonlySet<AudioAssetId> = new Set<AudioAssetId>([
  "sfxFire",
  "sfxExplosion",
  "sfxHit",
  "sfxHitSoft",
  "sfxDash",
  "sfxCountdown",
  "sfxFight",
  "sfxWin",
  "sfxKill",
  "sfxRespawn",
  "sfxPowerup",
  "sfxPilotEject",
  "sfxPilotDeath",
]);

interface PendingFadeStopEntry {
  timer: ReturnType<typeof setTimeout>;
  soundId: number;
  onFade: (...args: unknown[]) => void;
}

class AudioManagerClass {
  private assetPlayers: Map<AudioAssetId, Howl> = new Map();
  private activeSoundIdByAsset: Map<AudioAssetId, number> = new Map();
  private activeMusicAssetId: AudioAssetId | null = null;
  private activeMusicSoundId: number | null = null;
  private autoplayBlocked: boolean = false;
  private pendingBackgroundMusicAssetId: AudioAssetId | null = null;
  private gestureUnlockHandler: (() => void) | null = null;
  private pendingFadeStopTimersByAsset: Map<AudioAssetId, PendingFadeStopEntry> =
    new Map();
  private gameplayFxSuppressed: boolean = false;
  private gameplayFxVolumeMultiplier: number = 1;
  private lastPlaybackAtMsByAsset: Map<AudioAssetId, number> = new Map();

  constructor() {
    this.setupUserGestureUnlock();
  }

  private setupUserGestureUnlock(): void {
    if (typeof window === "undefined") {
      return;
    }
    if (this.gestureUnlockHandler !== null) {
      return;
    }

    const handleUnlockGesture = (): void => {
      if (!this.autoplayBlocked) {
        return;
      }

      this.autoplayBlocked = false;
      console.log("[AudioManager.setupUserGestureUnlock]", "User gesture received, retrying BGM");
      this.resumePendingBackgroundMusic();
    };
    this.gestureUnlockHandler = handleUnlockGesture;

    window.addEventListener("pointerdown", handleUnlockGesture, {
      capture: true,
      passive: true,
    });
    window.addEventListener("keydown", handleUnlockGesture, {
      capture: true,
    });
    window.addEventListener("touchstart", handleUnlockGesture, {
      capture: true,
      passive: true,
    });
    window.addEventListener("mousedown", handleUnlockGesture, {
      capture: true,
      passive: true,
    });
    window.addEventListener("click", handleUnlockGesture, {
      capture: true,
      passive: true,
    });
  }

  private teardownUserGestureUnlock(): void {
    if (typeof window === "undefined" || this.gestureUnlockHandler === null) {
      return;
    }
    const handleUnlockGesture = this.gestureUnlockHandler;

    window.removeEventListener("pointerdown", handleUnlockGesture, {
      capture: true,
    });
    window.removeEventListener("keydown", handleUnlockGesture, {
      capture: true,
    });
    window.removeEventListener("touchstart", handleUnlockGesture, {
      capture: true,
    });
    window.removeEventListener("mousedown", handleUnlockGesture, {
      capture: true,
    });
    window.removeEventListener("click", handleUnlockGesture, {
      capture: true,
    });
    this.gestureUnlockHandler = null;
  }

  private isAutoplayBlockError(error: unknown): boolean {
    const message = String(error).toLowerCase();
    if (message.includes("notallowederror")) {
      return true;
    }
    if (message.includes("not allowed")) {
      return true;
    }
    if (message.includes("user gesture")) {
      return true;
    }
    if (message.includes("audiocontext") && message.includes("start")) {
      return true;
    }
    return false;
  }

  private isBackgroundMusicAsset(assetId: AudioAssetId): boolean {
    return BACKGROUND_MUSIC_ASSET_IDS.has(assetId);
  }

  private isGameplayFxAsset(assetId: AudioAssetId): boolean {
    return GAMEPLAY_FX_ASSET_IDS.has(assetId);
  }

  private resolveAssetVolume(assetId: AudioAssetId): number {
    const definition = AUDIO_ASSETS[assetId];
    if (!this.isGameplayFxAsset(assetId)) {
      return definition.volume;
    }
    return definition.volume * this.gameplayFxVolumeMultiplier;
  }

  private rememberPendingBackgroundMusic(assetId: AudioAssetId): void {
    if (!this.isBackgroundMusicAsset(assetId)) {
      return;
    }
    this.pendingBackgroundMusicAssetId = assetId;
  }

  private resumePendingBackgroundMusic(): void {
    if (!SettingsManager.shouldPlayMusic()) {
      this.pendingBackgroundMusicAssetId = null;
      return;
    }

    const pendingAssetId = this.pendingBackgroundMusicAssetId;
    this.pendingBackgroundMusicAssetId = null;
    if (pendingAssetId !== null) {
      void this.playMusicAsset(pendingAssetId, { restart: false });
    }
  }

  private handlePlayError(
    assetId: AudioAssetId,
    soundId: number,
    error: unknown,
  ): void {
    if (!this.isAutoplayBlockError(error)) {
      return;
    }

    this.autoplayBlocked = true;
    if (this.isBackgroundMusicAsset(assetId) && SettingsManager.shouldPlayMusic()) {
      this.rememberPendingBackgroundMusic(assetId);
    }

    const player = this.assetPlayers.get(assetId);
    if (player) {
      player.stop(soundId);
    }

    this.activeSoundIdByAsset.delete(assetId);
    if (this.activeMusicAssetId === assetId) {
      this.activeMusicSoundId = null;
    }
    console.log(
      "[AudioManager.handlePlayError]",
      "Autoplay blocked for " + assetId + ", waiting for user gesture",
    );
  }

  private isPreloadEnabled(preload: "none" | "metadata" | "auto"): boolean {
    return preload !== "none";
  }

  private canPlayChannel(channel: AudioAssetChannel): boolean {
    if (channel === "music") {
      return SettingsManager.shouldPlayMusic();
    }
    return SettingsManager.shouldPlayFx();
  }

  private getNowMs(): number {
    if (
      typeof performance !== "undefined" &&
      typeof performance.now === "function"
    ) {
      return performance.now();
    }
    return Date.now();
  }

  private getOrCreateAssetPlayer(assetId: AudioAssetId): Howl {
    const existing = this.assetPlayers.get(assetId);
    if (existing) {
      return existing;
    }

    const asset = AUDIO_ASSETS[assetId];
    const url = this.getAssetUrl(assetId);
    const player = new Howl({
      src: [url],
      loop: asset.loop,
      volume: asset.volume,
      preload: this.isPreloadEnabled(asset.preload),
      onloaderror: (_soundId: number, error: unknown) => {
        console.log("[AudioManager.getOrCreateAssetPlayer]", "Load failed for " + assetId);
        console.log("[AudioManager.getOrCreateAssetPlayer]", String(error));
      },
      onplayerror: (_soundId: number, error: unknown) => {
        console.log("[AudioManager.getOrCreateAssetPlayer]", "Playback failed for " + assetId);
        console.log("[AudioManager.getOrCreateAssetPlayer]", String(error));
        this.handlePlayError(assetId, _soundId, error);
      },
    });
    this.assetPlayers.set(assetId, player);
    return player;
  }

  private playAsset(assetId: AudioAssetId, restart: boolean): number | null {
    const definition = AUDIO_ASSETS[assetId];
    if (this.gameplayFxSuppressed && this.isGameplayFxAsset(assetId)) {
      this.activeSoundIdByAsset.delete(assetId);
      return null;
    }
    if (!this.canPlayChannel(definition.channel)) {
      this.activeSoundIdByAsset.delete(assetId);
      return null;
    }

    if (this.autoplayBlocked) {
      if (this.isBackgroundMusicAsset(assetId) && SettingsManager.shouldPlayMusic()) {
        this.rememberPendingBackgroundMusic(assetId);
      }
      this.activeSoundIdByAsset.delete(assetId);
      return null;
    }

    if (assetId === "sfxFire") {
      const nowMs = this.getNowMs();
      const lastPlayedAtMs = this.lastPlaybackAtMsByAsset.get(assetId) ?? -Infinity;
      if (nowMs - lastPlayedAtMs < FIRE_SFX_MIN_INTERVAL_MS) {
        return null;
      }
    }

    const player = this.getOrCreateAssetPlayer(assetId);
    player.loop(definition.loop);
    player.volume(this.resolveAssetVolume(assetId));

    if (restart) {
      player.stop();
      this.activeSoundIdByAsset.delete(assetId);
    }

    const soundId = player.play();
    if (typeof soundId !== "number") {
      console.log("[AudioManager.playAsset]", "Could not play asset " + assetId);
      this.activeSoundIdByAsset.delete(assetId);
      return null;
    }
    this.activeSoundIdByAsset.set(assetId, soundId);
    this.lastPlaybackAtMsByAsset.set(assetId, this.getNowMs());
    return soundId;
  }

  private stopActiveMusicPlayer(): void {
    if (this.activeMusicAssetId === null) {
      return;
    }

    this.stopActiveMusicPlayerWithFade(false);
  }

  private clearPendingFadeStopTimer(assetId: AudioAssetId): void {
    const existingEntry = this.pendingFadeStopTimersByAsset.get(assetId);
    if (existingEntry !== undefined) {
      clearTimeout(existingEntry.timer);
      const player = this.assetPlayers.get(assetId);
      if (player) {
        player.off("fade", existingEntry.onFade, existingEntry.soundId);
      }
      this.pendingFadeStopTimersByAsset.delete(assetId);
    }
  }

  private scheduleFadeStopForAsset(
    assetId: AudioAssetId,
    soundId: number,
    durationMs: number,
  ): void {
    const player = this.assetPlayers.get(assetId);
    if (!player) {
      return;
    }

    this.clearPendingFadeStopTimer(assetId);
    let settled = false;

    const finalize = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      this.clearPendingFadeStopTimer(assetId);
      const trackedSoundId = this.activeSoundIdByAsset.get(assetId);
      if (trackedSoundId !== soundId) {
        return;
      }

      player.stop(soundId);
      this.activeSoundIdByAsset.delete(assetId);
    };

    const onFade = (): void => {
      finalize();
    };

    player.once("fade", onFade, soundId);
    const stopTimer = setTimeout(() => {
      finalize();
    }, durationMs + 64);

    this.pendingFadeStopTimersByAsset.set(assetId, {
      timer: stopTimer,
      soundId,
      onFade,
    });
  }

  private stopActiveMusicPlayerWithFade(fadeOut: boolean): void {
    const activeMusicAssetId = this.activeMusicAssetId;
    if (activeMusicAssetId === null) {
      return;
    }

    const activeMusicSoundId = this.activeMusicSoundId;
    const player = this.assetPlayers.get(activeMusicAssetId);
    this.activeMusicAssetId = null;
    this.activeMusicSoundId = null;

    if (!player || activeMusicSoundId === null) {
      this.clearPendingFadeStopTimer(activeMusicAssetId);
      this.activeSoundIdByAsset.delete(activeMusicAssetId);
      return;
    }

    if (!fadeOut || !player.playing(activeMusicSoundId)) {
      this.clearPendingFadeStopTimer(activeMusicAssetId);
      player.stop(activeMusicSoundId);
      this.activeSoundIdByAsset.delete(activeMusicAssetId);
      return;
    }

    const currentVolume = player.volume();
    player.fade(currentVolume, 0, MUSIC_FADE_OUT_MS, activeMusicSoundId);
    this.scheduleFadeStopForAsset(
      activeMusicAssetId,
      activeMusicSoundId,
      MUSIC_FADE_OUT_MS,
    );
  }

  private stopAssetPlayback(assetId: AudioAssetId): void {
    this.clearPendingFadeStopTimer(assetId);
    const player = this.assetPlayers.get(assetId);
    if (player) {
      const soundId = this.activeSoundIdByAsset.get(assetId);
      if (soundId !== undefined) {
        player.stop(soundId);
      } else {
        player.stop();
      }
    }

    this.activeSoundIdByAsset.delete(assetId);
    if (this.activeMusicAssetId === assetId) {
      this.activeMusicAssetId = null;
      this.activeMusicSoundId = null;
    }
  }

  private waitForSoundEnd(
    assetId: AudioAssetId,
    player: Howl,
    soundId: number,
    timeoutMs: number,
  ): Promise<boolean> {
    if (!player.playing(soundId)) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      let settled = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      const finalize = (completed: boolean): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutHandle !== null) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
        player.off("end", handleEnd, soundId);
        player.off("stop", handleStop, soundId);
        player.off("playerror", handlePlayError, soundId);
        const trackedSoundId = this.activeSoundIdByAsset.get(assetId);
        if (trackedSoundId !== soundId) {
          resolve(false);
          return;
        }
        resolve(completed);
      };

      const handleEnd = (): void => {
        finalize(true);
      };

      const handleStop = (): void => {
        finalize(false);
      };

      const handlePlayError = (): void => {
        finalize(false);
      };

      timeoutHandle = setTimeout(() => {
        finalize(false);
      }, timeoutMs);

      player.once("end", handleEnd, soundId);
      player.once("stop", handleStop, soundId);
      player.once("playerror", handlePlayError, soundId);
    });
  }

  private getAssetPlaybackTime(assetId: AudioAssetId): number | null {
    const soundId = this.activeSoundIdByAsset.get(assetId);
    if (soundId === undefined) {
      return null;
    }
    const player = this.assetPlayers.get(assetId);
    if (!player || !player.playing(soundId)) {
      return null;
    }
    const seekValue = player.seek(undefined, soundId);
    if (typeof seekValue !== "number" || !Number.isFinite(seekValue)) {
      return null;
    }
    return seekValue;
  }

  private isAssetLoaded(assetId: AudioAssetId): boolean {
    const player = this.assetPlayers.get(assetId);
    if (!player) {
      return false;
    }
    return player.state() === "loaded";
  }

  private waitForPlayerLoaded(
    assetId: AudioAssetId,
    player: Howl,
    timeoutMs: number,
  ): Promise<boolean> {
    if (player.state() === "loaded") {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      let settled = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      const handleLoad = (): void => {
        finalize(true, "");
      };

      const handleLoadError = (...args: unknown[]): void => {
        const errorText = args.length > 1 ? String(args[1]) : "Unknown load error";
        finalize(false, "Load failed for " + assetId + ": " + errorText);
      };

      const finalize = (loaded: boolean, message: string): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutHandle !== null) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
        player.off("load", handleLoad);
        player.off("loaderror", handleLoadError);
        if (!loaded) {
          console.log("[AudioManager.waitForPlayerLoaded]", message);
        }
        resolve(loaded);
      };

      timeoutHandle = setTimeout(() => {
        finalize(false, "Load timeout for " + assetId);
      }, timeoutMs);

      player.once("load", handleLoad);
      player.once("loaderror", handleLoadError);
      player.load();
    });
  }

  getConfiguredAssetIds(): AudioAssetId[] {
    return Object.keys(AUDIO_ASSETS) as AudioAssetId[];
  }

  getAssetUrl(assetId: AudioAssetId): string {
    return resolveAudioAssetUrl(assetId);
  }

  preloadAsset(assetId: AudioAssetId): void {
    const player = this.getOrCreateAssetPlayer(assetId);
    player.load();
  }

  async preloadAssets(
    assetIds: AudioAssetId[],
    timeoutMs: number = 6000,
  ): Promise<void> {
    const uniqueIds = Array.from(new Set(assetIds));
    const preloadTasks = uniqueIds.map(async (assetId) => {
      const player = this.getOrCreateAssetPlayer(assetId);
      await this.waitForPlayerLoaded(assetId, player, timeoutMs);
    });
    await Promise.all(preloadTasks);
  }

  async preloadConfiguredAssets(timeoutMs: number = 6000): Promise<void> {
    const ids = this.getConfiguredAssetIds();
    const preloadableIds = ids.filter((assetId) => {
      return AUDIO_ASSETS[assetId].preload !== "none";
    });
    await this.preloadAssets(preloadableIds, timeoutMs);
  }

  getSceneMusicAsset(scene: AudioSceneId): AudioAssetId | null {
    return AUDIO_SCENE_MUSIC[scene];
  }

  async playSceneMusic(
    scene: AudioSceneId,
    options: PlayMusicOptions = {},
  ): Promise<void> {
    const sceneAsset = this.getSceneMusicAsset(scene);
    if (!sceneAsset) {
      this.stopMusic();
      return;
    }

    await this.playMusicAsset(sceneAsset, options);
  }

  async playCue(cueId: AudioCueId): Promise<void> {
    const assetId = AUDIO_CUE_ASSETS[cueId];
    this.playAsset(assetId, true);
  }

  stopCue(cueId: AudioCueId): void {
    const assetId = AUDIO_CUE_ASSETS[cueId];
    this.stopAssetPlayback(assetId);
  }

  async waitForCueEnd(cueId: AudioCueId, timeoutMs: number = 2400): Promise<boolean> {
    const assetId = AUDIO_CUE_ASSETS[cueId];
    const soundId = this.activeSoundIdByAsset.get(assetId);
    if (soundId === undefined) {
      return false;
    }

    const player = this.assetPlayers.get(assetId);
    if (!player) {
      return false;
    }

    return this.waitForSoundEnd(assetId, player, soundId, timeoutMs);
  }

  clearPendingBackgroundMusicForTarget(targetAssetId: AudioAssetId | null): void {
    const pendingAssetId = this.pendingBackgroundMusicAssetId;
    if (pendingAssetId === null) {
      return;
    }
    if (targetAssetId !== null && pendingAssetId === targetAssetId) {
      return;
    }

    this.pendingBackgroundMusicAssetId = null;
    console.log(
      "[AudioManager.clearPendingBackgroundMusicForTarget]",
      "Cleared stale pending BGM " + pendingAssetId,
    );
  }

  getCuePlaybackTime(cueId: AudioCueId): number | null {
    return this.getAssetPlaybackTime(AUDIO_CUE_ASSETS[cueId]);
  }

  isCueLoaded(cueId: AudioCueId): boolean {
    return this.isAssetLoaded(AUDIO_CUE_ASSETS[cueId]);
  }

  async playSplashScreenCue(): Promise<void> {
    await this.playCue("SPLASH_STING");
  }

  async playLogoRevealCue(): Promise<void> {
    await this.playCue("LOGO_STING");
  }

  setGameplayFxSuppressed(suppressed: boolean): void {
    if (this.gameplayFxSuppressed === suppressed) {
      return;
    }
    this.gameplayFxSuppressed = suppressed;
    if (!suppressed) {
      return;
    }

    for (const assetId of GAMEPLAY_FX_ASSET_IDS) {
      this.stopAssetPlayback(assetId);
    }
  }

  setGameplayFxVolumeMultiplier(multiplier: number): void {
    const normalized = Math.max(0, Math.min(1, multiplier));
    this.gameplayFxVolumeMultiplier = normalized;

    for (const assetId of GAMEPLAY_FX_ASSET_IDS) {
      const soundId = this.activeSoundIdByAsset.get(assetId);
      if (soundId === undefined) {
        continue;
      }
      const player = this.assetPlayers.get(assetId);
      if (!player || !player.playing(soundId)) {
        continue;
      }
      player.volume(this.resolveAssetVolume(assetId), soundId);
    }
  }

  async playMusicAsset(
    assetId: AudioAssetId,
    options: PlayMusicOptions = {},
  ): Promise<void> {
    if (!SettingsManager.shouldPlayMusic()) {
      return;
    }

    const definition = AUDIO_ASSETS[assetId];
    if (definition.channel !== "music") {
      console.log(
        "[AudioManager.playMusicAsset]",
        "Rejected non-music asset " + assetId,
      );
      return;
    }

    const player = this.getOrCreateAssetPlayer(assetId);
    const shouldRestart =
      options.restart ?? this.activeMusicAssetId !== assetId;

    if (this.activeMusicAssetId !== null && this.activeMusicAssetId !== assetId) {
      this.stopActiveMusicPlayerWithFade(true);
    }

    if (
      !shouldRestart &&
      this.activeMusicAssetId === assetId &&
      this.activeMusicSoundId !== null &&
      player.playing(this.activeMusicSoundId)
    ) {
      return;
    }

    const soundId = this.playAsset(assetId, shouldRestart);
    if (soundId === null) {
      return;
    }

    const targetVolume = definition.volume;
    const fadeInMs =
      options.fadeInMs ??
      (assetId === "gameplayLoop" ? GAMEPLAY_BGM_FADE_IN_MS : MUSIC_FADE_IN_MS);
    player.volume(0, soundId);
    player.fade(0, targetVolume, fadeInMs, soundId);
    this.activeMusicAssetId = assetId;
    this.activeMusicSoundId = soundId;
  }

  async playMainMenuMusic(options: PlayMusicOptions = {}): Promise<void> {
    await this.playMusicAsset("mainMenuLobbyLoop", options);
  }

  async playGameplayMusic(options: PlayMusicOptions = {}): Promise<void> {
    // Gameplay BGM fades in slowly so it doesn't hit suddenly (2.5 s ramp).
    // SFX and other music tracks are not affected.
    await this.playMusicAsset("gameplayLoop", {
      ...options,
      fadeInMs: options.fadeInMs ?? GAMEPLAY_BGM_FADE_IN_MS,
    });
  }

  async playResultsSting(options: PlayMusicOptions = {}): Promise<void> {
    await this.playMusicAsset("resultsSting", options);
  }

  // ============= SOUND EFFECTS =============

  async playFire(): Promise<void> {
    this.playAsset("sfxFire", false);
  }

  async playExplosion(): Promise<void> {
    this.playAsset("sfxExplosion", false);
  }

  async playHit(): Promise<void> {
    this.playAsset("sfxHit", false);
  }

  async playHitSoft(): Promise<void> {
    this.playAsset("sfxHitSoft", false);
  }

  async playDash(): Promise<void> {
    this.playAsset("sfxDash", false);
  }

  async playCountdown(count: number): Promise<void> {
    if (count <= 0) {
      return;
    }
    this.playAsset("sfxCountdown", false);
  }

  async playFight(): Promise<void> {
    this.playAsset("sfxFight", false);
  }

  async playWin(): Promise<void> {
    this.playAsset("sfxWin", false);
  }

  async playKill(): Promise<void> {
    this.playAsset("sfxKill", false);
  }

  async playRespawn(): Promise<void> {
    this.playAsset("sfxRespawn", false);
  }

  async playPowerupPickup(): Promise<void> {
    this.playAsset("sfxPowerup", false);
  }

  async playUIClick(): Promise<void> {
    this.playAsset("sfxUiClick", false);
  }

  async playUIClickPositive(): Promise<void> {
    this.playAsset("sfxUiClickPositive", false);
  }

  async playUIClickNegative(): Promise<void> {
    this.playAsset("sfxUiClickNegative", false);
  }

  async playLobbyEnterTransitionCue(): Promise<void> {
    await this.playCue("PAGE_INTRO_IN");
  }

  async playLobbyExitTransitionCue(): Promise<void> {
    await this.playCue("PAGE_INTRO_OUT");
  }

  async playPilotEject(): Promise<void> {
    this.playAsset("sfxPilotEject", false);
  }

  async playPilotDeath(): Promise<void> {
    this.playAsset("sfxPilotDeath", false);
  }

  // ============= BACKGROUND MUSIC =============

  async startMusic(): Promise<void> {
    const target =
      this.activeMusicAssetId !== null
        ? this.activeMusicAssetId
        : AUDIO_SCENE_MUSIC.LOBBY;
    if (!target) {
      return;
    }

    await this.playMusicAsset(target, { restart: false });
  }

  private stopAllBackgroundMusicPlayers(): void {
    for (const assetId of BACKGROUND_MUSIC_ASSET_IDS) {
      this.clearPendingFadeStopTimer(assetId);
      const player = this.assetPlayers.get(assetId);
      if (player) {
        player.stop();
      }
      this.activeSoundIdByAsset.delete(assetId);
    }
    this.activeMusicAssetId = null;
    this.activeMusicSoundId = null;
  }

  stopMusic(): void {
    this.stopActiveMusicPlayerWithFade(true);
    // Safety sweep: clear any leaked background-loop instances that may not
    // be tracked as the current active music sound ID.
    this.stopAllBackgroundMusicPlayers();
    this.pendingBackgroundMusicAssetId = null;
  }

  updateMusicState(isPlaying: boolean): void {
    if (isPlaying && SettingsManager.shouldPlayMusic()) {
      void this.startMusic();
      return;
    }
    this.stopMusic();
  }

  // ============= CLEANUP =============

  destroy(): void {
    this.stopMusic();
    this.teardownUserGestureUnlock();

    for (const player of this.assetPlayers.values()) {
      player.stop();
      player.unload();
    }

    this.assetPlayers.clear();
    this.activeSoundIdByAsset.clear();
    for (const entry of this.pendingFadeStopTimersByAsset.values()) {
      clearTimeout(entry.timer);
    }
    this.pendingFadeStopTimersByAsset.clear();
    this.activeMusicAssetId = null;
    this.activeMusicSoundId = null;
    this.pendingBackgroundMusicAssetId = null;
    this.gameplayFxSuppressed = false;
    this.gameplayFxVolumeMultiplier = 1;
    this.lastPlaybackAtMsByAsset.clear();
    console.log("[AudioManager.destroy]", "Destroyed");
  }
}

export const AudioManager = new AudioManagerClass();
