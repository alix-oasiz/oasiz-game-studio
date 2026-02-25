export type AudioAssetChannel = "music" | "fx" | "ui";

export type AudioAssetId =
  | "splashScreenSting"
  | "logoRevealSting"
  | "mainMenuLobbyLoop"
  | "gameplayLoop"
  | "resultsLoop"
  | "sfxFire"
  | "sfxExplosion"
  | "sfxHit"
  | "sfxDash"
  | "sfxCountdown"
  | "sfxFight"
  | "sfxWin"
  | "sfxKill"
  | "sfxRespawn"
  | "sfxUiClick"
  | "sfxPilotEject"
  | "sfxPilotDeath";

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
    relativePath: "music-cue-splash.wav",
    loop: false,
    volume: 0.72,
    preload: "metadata",
  },
  logoRevealSting: {
    id: "logoRevealSting",
    channel: "music",
    relativePath: "music-cue-logo.wav",
    loop: false,
    volume: 0.72,
    preload: "metadata",
  },
  mainMenuLobbyLoop: {
    id: "mainMenuLobbyLoop",
    channel: "music",
    relativePath: "music-loop-menu.wav",
    loop: true,
    volume: 0.32,
    preload: "none",
  },
  gameplayLoop: {
    id: "gameplayLoop",
    channel: "music",
    relativePath: "music-loop-gameplay.wav",
    loop: true,
    volume: 0.32,
    preload: "none",
  },
  resultsLoop: {
    id: "resultsLoop",
    channel: "music",
    relativePath: "music-loop-results.wav",
    loop: true,
    volume: 0.32,
    preload: "none",
  },
  sfxFire: {
    id: "sfxFire",
    channel: "fx",
    relativePath: "sfx-fire.wav",
    loop: false,
    volume: 0.7,
    preload: "metadata",
  },
  sfxExplosion: {
    id: "sfxExplosion",
    channel: "fx",
    relativePath: "sfx-explosion.wav",
    loop: false,
    volume: 0.75,
    preload: "metadata",
  },
  sfxHit: {
    id: "sfxHit",
    channel: "fx",
    relativePath: "sfx-hit.wav",
    loop: false,
    volume: 0.65,
    preload: "metadata",
  },
  sfxDash: {
    id: "sfxDash",
    channel: "fx",
    relativePath: "sfx-dash.wav",
    loop: false,
    volume: 0.7,
    preload: "metadata",
  },
  sfxCountdown: {
    id: "sfxCountdown",
    channel: "fx",
    relativePath: "sfx-countdown.wav",
    loop: false,
    volume: 0.7,
    preload: "metadata",
  },
  sfxFight: {
    id: "sfxFight",
    channel: "fx",
    relativePath: "sfx-fight.wav",
    loop: false,
    volume: 0.75,
    preload: "metadata",
  },
  sfxWin: {
    id: "sfxWin",
    channel: "fx",
    relativePath: "sfx-win.wav",
    loop: false,
    volume: 0.75,
    preload: "metadata",
  },
  sfxKill: {
    id: "sfxKill",
    channel: "fx",
    relativePath: "sfx-kill.wav",
    loop: false,
    volume: 0.72,
    preload: "metadata",
  },
  sfxRespawn: {
    id: "sfxRespawn",
    channel: "fx",
    relativePath: "sfx-respawn.wav",
    loop: false,
    volume: 0.7,
    preload: "metadata",
  },
  sfxUiClick: {
    id: "sfxUiClick",
    channel: "ui",
    relativePath: "sfx-ui-click.wav",
    loop: false,
    volume: 0.65,
    preload: "metadata",
  },
  sfxPilotEject: {
    id: "sfxPilotEject",
    channel: "fx",
    relativePath: "sfx-pilot-eject.wav",
    loop: false,
    volume: 0.72,
    preload: "metadata",
  },
  sfxPilotDeath: {
    id: "sfxPilotDeath",
    channel: "fx",
    relativePath: "sfx-pilot-death.wav",
    loop: false,
    volume: 0.72,
    preload: "metadata",
  },
};

export type AudioSceneId =
  | "SPLASH"
  | "START"
  | "LOBBY"
  | "GAMEPLAY"
  | "RESULTS";

export const AUDIO_SCENE_MUSIC: Record<AudioSceneId, AudioAssetId | null> = {
  SPLASH: null,
  START: "mainMenuLobbyLoop",
  LOBBY: "mainMenuLobbyLoop",
  GAMEPLAY: "gameplayLoop",
  RESULTS: "resultsLoop",
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
