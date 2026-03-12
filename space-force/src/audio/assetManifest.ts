export type AudioAssetChannel = "music" | "fx" | "ui";

export type AudioAssetId =
  | "splashScreenSting"
  | "logoRevealSting"
  | "mainMenuLobbyLoop"
  | "gameplayLoop"
  | "resultsSting"
  | "sfxFire"
  | "sfxExplosion"
  | "sfxHit"
  | "sfxHitSoft"
  | "sfxDash"
  | "sfxCountdown"
  | "sfxFight"
  | "sfxWin"
  | "sfxKill"
  | "sfxRespawn"
  | "sfxPowerup"
  | "sfxUiClick"
  | "sfxUiClickPositive"
  | "sfxUiClickNegative"
  | "sfxPageIntroIn"
  | "sfxPageIntroOut"
  | "sfxPilotEject"
  | "sfxPilotDeath"
  | "sfxCaptainSpeech";

export interface AudioAssetDefinition {
  id: AudioAssetId;
  channel: AudioAssetChannel;
  relativePath: string;
  url: string;
  loop: boolean;
  volume: number;
  preload: "none" | "metadata" | "auto";
}

export const AUDIO_ASSETS: Record<AudioAssetId, AudioAssetDefinition> = {
  splashScreenSting: {
    id: "splashScreenSting",
    channel: "music",
    relativePath: "music-cue-splash.ogg",
    url: "./assets/audio/music-cue-splash.ogg",
    loop: false,
    volume: 0.72,
    preload: "metadata",
  },
  logoRevealSting: {
    id: "logoRevealSting",
    channel: "music",
    relativePath: "music-cue-logo.ogg",
    url: "./assets/audio/music-cue-logo.ogg",
    loop: false,
    volume: 0.72,
    preload: "metadata",
  },
  mainMenuLobbyLoop: {
    id: "mainMenuLobbyLoop",
    channel: "music",
    relativePath: "music-loop-menu.ogg",
    url: "./assets/audio/music-loop-menu.ogg",
    loop: true,
    volume: 0.32,
    preload: "none",
  },
  gameplayLoop: {
    id: "gameplayLoop",
    channel: "music",
    relativePath: "music-loop-gameplay.ogg",
    url: "./assets/audio/music-loop-gameplay.ogg",
    loop: true,
    volume: 0.24,
    preload: "none",
  },
  resultsSting: {
    id: "resultsSting",
    channel: "music",
    relativePath: "music-cue-results.ogg",
    url: "./assets/audio/music-cue-results.ogg",
    loop: false,
    volume: 0.32,
    preload: "none",
  },
  sfxFire: {
    id: "sfxFire",
    channel: "fx",
    relativePath: "sfx-fire.ogg",
    url: "./assets/audio/sfx-fire.ogg",
    loop: false,
    volume: 0.56,
    preload: "metadata",
  },
  sfxExplosion: {
    id: "sfxExplosion",
    channel: "fx",
    relativePath: "sfx-explosion.ogg",
    url: "./assets/audio/sfx-explosion.ogg",
    loop: false,
    volume: 0.75,
    preload: "metadata",
  },
  sfxHit: {
    id: "sfxHit",
    channel: "fx",
    relativePath: "sfx-hit.ogg",
    url: "./assets/audio/sfx-hit.ogg",
    loop: false,
    volume: 0.65,
    preload: "metadata",
  },
  sfxHitSoft: {
    id: "sfxHitSoft",
    channel: "fx",
    relativePath: "sfx-hit-soft.ogg",
    url: "./assets/audio/sfx-hit-soft.ogg",
    loop: false,
    volume: 0.76,
    preload: "metadata",
  },
  sfxDash: {
    id: "sfxDash",
    channel: "fx",
    relativePath: "sfx-dash.ogg",
    url: "./assets/audio/sfx-dash.ogg",
    loop: false,
    volume: 0.7,
    preload: "metadata",
  },
  sfxCountdown: {
    id: "sfxCountdown",
    channel: "fx",
    relativePath: "sfx-countdown.ogg",
    url: "./assets/audio/sfx-countdown.ogg",
    loop: false,
    volume: 0.7,
    preload: "metadata",
  },
  sfxFight: {
    id: "sfxFight",
    channel: "fx",
    relativePath: "sfx-fight.ogg",
    url: "./assets/audio/sfx-fight.ogg",
    loop: false,
    volume: 0.75,
    preload: "metadata",
  },
  sfxWin: {
    id: "sfxWin",
    channel: "fx",
    relativePath: "sfx-win.ogg",
    url: "./assets/audio/sfx-win.ogg",
    loop: false,
    volume: 0.75,
    preload: "metadata",
  },
  sfxKill: {
    id: "sfxKill",
    channel: "fx",
    relativePath: "sfx-kill.ogg",
    url: "./assets/audio/sfx-kill.ogg",
    loop: false,
    volume: 0.72,
    preload: "metadata",
  },
  sfxRespawn: {
    id: "sfxRespawn",
    channel: "fx",
    relativePath: "sfx-respawn.ogg",
    url: "./assets/audio/sfx-respawn.ogg",
    loop: false,
    volume: 0.7,
    preload: "metadata",
  },
  sfxPowerup: {
    id: "sfxPowerup",
    channel: "fx",
    relativePath: "sfx-powerup.ogg",
    url: "./assets/audio/sfx-powerup.ogg",
    loop: false,
    volume: 0.74,
    preload: "metadata",
  },
  sfxUiClick: {
    id: "sfxUiClick",
    channel: "ui",
    relativePath: "sfx-ui-click.ogg",
    url: "./assets/audio/sfx-ui-click.ogg",
    loop: false,
    volume: 0.65,
    preload: "metadata",
  },
  sfxUiClickPositive: {
    id: "sfxUiClickPositive",
    channel: "ui",
    relativePath: "sfx-ui-click-positive.ogg",
    url: "./assets/audio/sfx-ui-click-positive.ogg",
    loop: false,
    volume: 0.68,
    preload: "metadata",
  },
  sfxUiClickNegative: {
    id: "sfxUiClickNegative",
    channel: "ui",
    relativePath: "sfx-ui-click-negative.ogg",
    url: "./assets/audio/sfx-ui-click-negative.ogg",
    loop: false,
    volume: 0.68,
    preload: "metadata",
  },
  sfxPageIntroIn: {
    id: "sfxPageIntroIn",
    channel: "ui",
    relativePath: "sfx-page-intro-in.ogg",
    url: "./assets/audio/sfx-page-intro-in.ogg",
    loop: false,
    volume: 0.72,
    preload: "metadata",
  },
  sfxPageIntroOut: {
    id: "sfxPageIntroOut",
    channel: "ui",
    relativePath: "sfx-page-intro-out.ogg",
    url: "./assets/audio/sfx-page-intro-out.ogg",
    loop: false,
    volume: 0.72,
    preload: "metadata",
  },
  sfxPilotEject: {
    id: "sfxPilotEject",
    channel: "fx",
    relativePath: "sfx-pilot-eject.ogg",
    url: "./assets/audio/sfx-pilot-eject.ogg",
    loop: false,
    volume: 0.72,
    preload: "metadata",
  },
  sfxPilotDeath: {
    id: "sfxPilotDeath",
    channel: "fx",
    relativePath: "sfx-pilot-death.ogg",
    url: "./assets/audio/sfx-pilot-death.ogg",
    loop: false,
    volume: 0.72,
    preload: "metadata",
  },
  sfxCaptainSpeech: {
    id: "sfxCaptainSpeech",
    channel: "ui",
    relativePath: "sfx-captain-speech.ogg",
    url: "./assets/audio/sfx-captain-speech.ogg",
    loop: true,
    volume: 0.52,
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
  RESULTS: "resultsSting",
};

export type AudioCueId =
  | "SPLASH_STING"
  | "LOGO_STING"
  | "PAGE_INTRO_IN"
  | "PAGE_INTRO_OUT"
  | "CAPTAIN_SPEECH";

export const AUDIO_CUE_ASSETS: Record<AudioCueId, AudioAssetId> = {
  SPLASH_STING: "splashScreenSting",
  LOGO_STING: "logoRevealSting",
  PAGE_INTRO_IN: "sfxPageIntroIn",
  PAGE_INTRO_OUT: "sfxPageIntroOut",
  CAPTAIN_SPEECH: "sfxCaptainSpeech",
};

export function resolveAudioAssetUrl(assetId: AudioAssetId): string {
  const asset = AUDIO_ASSETS[assetId];
  return asset.url;
}
