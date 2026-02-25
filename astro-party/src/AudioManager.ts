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

class AudioManagerClass {
  private assetPlayers: Map<AudioAssetId, Howl> = new Map();
  private activeSoundIdByAsset: Map<AudioAssetId, number> = new Map();
  private activeMusicAssetId: AudioAssetId | null = null;
  private activeMusicSoundId: number | null = null;
  private autoplayBlocked: boolean = false;
  private pendingBackgroundMusicAssetId: AudioAssetId | null = null;
  private gestureUnlockHandler: (() => void) | null = null;

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

    const player = this.getOrCreateAssetPlayer(assetId);
    player.loop(definition.loop);
    player.volume(definition.volume);

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
    return soundId;
  }

  private stopActiveMusicPlayer(): void {
    if (this.activeMusicAssetId === null) {
      return;
    }

    const active = this.assetPlayers.get(this.activeMusicAssetId);
    if (active) {
      if (this.activeMusicSoundId !== null) {
        active.stop(this.activeMusicSoundId);
      } else {
        active.stop();
      }
    }
    this.activeSoundIdByAsset.delete(this.activeMusicAssetId);
    this.activeMusicAssetId = null;
    this.activeMusicSoundId = null;
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
      this.stopActiveMusicPlayer();
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

    this.activeMusicAssetId = assetId;
    this.activeMusicSoundId = soundId;
  }

  async playMainMenuMusic(options: PlayMusicOptions = {}): Promise<void> {
    await this.playMusicAsset("mainMenuLobbyLoop", options);
  }

  async playGameplayMusic(options: PlayMusicOptions = {}): Promise<void> {
    await this.playMusicAsset("gameplayLoop", options);
  }

  async playResultsMusic(options: PlayMusicOptions = {}): Promise<void> {
    await this.playMusicAsset("resultsLoop", options);
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

  async playUIClick(): Promise<void> {
    this.playAsset("sfxUiClick", false);
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

  stopMusic(): void {
    this.stopActiveMusicPlayer();
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
    this.activeMusicAssetId = null;
    this.activeMusicSoundId = null;
    this.pendingBackgroundMusicAssetId = null;
    console.log("[AudioManager.destroy]", "Destroyed");
  }
}

export const AudioManager = new AudioManagerClass();
