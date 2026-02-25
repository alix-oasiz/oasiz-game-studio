export type AudioAssetChannel = "music" | "fx" | "ui";

export type AudioAssetId =
  | "splashScreenSting"
  | "logoRevealSting"
  | "mainMenuLobbyLoop"
  | "gameplayLoop";

export interface AudioAssetDefinition {
  id: AudioAssetId;
  channel: AudioAssetChannel;
  relativePath: string;
  loop: boolean;
  volume: number;
  preload: "none" | "metadata" | "auto";
}

const AUDIO_ASSET_ROOT_PATH = "./assets/audio";

export const AUDIO_ASSETS: Record<AudioAssetId, AudioAssetDefinition> = {
  splashScreenSting: {
    id: "splashScreenSting",
    channel: "music",
    relativePath: "splash-screen-sting.ogg",
    loop: false,
    volume: 0.72,
    preload: "metadata",
  },
  logoRevealSting: {
    id: "logoRevealSting",
    channel: "music",
    relativePath: "logo-reveal-sting.ogg",
    loop: false,
    volume: 0.72,
    preload: "metadata",
  },
  mainMenuLobbyLoop: {
    id: "mainMenuLobbyLoop",
    channel: "music",
    relativePath: "main-menu-lobby-loop.ogg",
    loop: true,
    volume: 0.32,
    preload: "none",
  },
  gameplayLoop: {
    id: "gameplayLoop",
    channel: "music",
    relativePath: "gameplay-loop.ogg",
    loop: true,
    volume: 0.32,
    preload: "none",
  },
};

export type AudioSceneId = "SPLASH" | "START" | "LOBBY" | "GAMEPLAY";

export const AUDIO_SCENE_MUSIC: Record<AudioSceneId, AudioAssetId | null> = {
  SPLASH: null,
  START: "mainMenuLobbyLoop",
  LOBBY: "mainMenuLobbyLoop",
  GAMEPLAY: "gameplayLoop",
};

export type AudioCueId = "SPLASH_STING" | "LOGO_STING";

export const AUDIO_CUE_ASSETS: Record<AudioCueId, AudioAssetId> = {
  SPLASH_STING: "splashScreenSting",
  LOGO_STING: "logoRevealSting",
};

export function resolveAudioAssetUrl(assetId: AudioAssetId): string {
  const asset = AUDIO_ASSETS[assetId];
  return AUDIO_ASSET_ROOT_PATH + "/" + asset.relativePath;
}
