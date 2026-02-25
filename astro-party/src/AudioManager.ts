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

class AudioManagerClass {
  private assetPlayers: Map<AudioAssetId, Howl> = new Map();
  private activeMusicAssetId: AudioAssetId | null = null;
  private activeMusicSoundId: number | null = null;

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
      },
    });
    this.assetPlayers.set(assetId, player);
    return player;
  }

  private playAsset(assetId: AudioAssetId, restart: boolean): number | null {
    const definition = AUDIO_ASSETS[assetId];
    if (!this.canPlayChannel(definition.channel)) {
      return null;
    }

    const player = this.getOrCreateAssetPlayer(assetId);
    player.loop(definition.loop);
    player.volume(definition.volume);

    if (restart) {
      player.stop();
    }

    const soundId = player.play();
    if (typeof soundId !== "number") {
      console.log("[AudioManager.playAsset]", "Could not play asset " + assetId);
      return null;
    }
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
    this.activeMusicAssetId = null;
    this.activeMusicSoundId = null;
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

  preloadConfiguredAssets(): void {
    const ids = this.getConfiguredAssetIds();
    for (const assetId of ids) {
      const definition = AUDIO_ASSETS[assetId];
      if (definition.preload === "none") {
        continue;
      }
      this.preloadAsset(assetId);
    }
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

    for (const player of this.assetPlayers.values()) {
      player.stop();
      player.unload();
    }

    this.assetPlayers.clear();
    this.activeMusicAssetId = null;
    this.activeMusicSoundId = null;
    console.log("[AudioManager.destroy]", "Destroyed");
  }
}

export const AudioManager = new AudioManagerClass();
