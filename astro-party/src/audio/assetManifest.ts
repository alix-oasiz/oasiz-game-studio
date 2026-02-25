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

const AUDIO_ASSET_HREF_ELEMENT_ID_PREFIX = "audioAssetHref_";
const AUDIO_ASSET_ROOT_PATH = "./assets/audio";

export interface AudioAssetDefinition {
  id: AudioAssetId;
  channel: AudioAssetChannel;
  relativePath: string;
  loop: boolean;
  volume: number;
  preload: "none" | "metadata" | "auto";
}

export const AUDIO_ASSETS: Record<AudioAssetId, AudioAssetDefinition> = {
  splashScreenSting: {
    id: "splashScreenSting",
    channel: "fx",
    relativePath: "music-cue-splash.ogg",
    loop: false,
    volume: 0.72,
    preload: "metadata",
  },
  logoRevealSting: {
    id: "logoRevealSting",
    channel: "fx",
    relativePath: "music-cue-logo.ogg",
    loop: false,
    volume: 0.72,
    preload: "metadata",
  },
  mainMenuLobbyLoop: {
    id: "mainMenuLobbyLoop",
    channel: "music",
    relativePath: "music-loop-menu.ogg",
    loop: true,
    volume: 0.32,
    preload: "none",
  },
  gameplayLoop: {
    id: "gameplayLoop",
    channel: "music",
    relativePath: "music-loop-gameplay.ogg",
    loop: true,
    volume: 0.32,
    preload: "none",
  },
  resultsLoop: {
    id: "resultsLoop",
    channel: "music",
    relativePath: "music-loop-results.ogg",
    loop: true,
    volume: 0.32,
    preload: "none",
  },
  sfxFire: {
    id: "sfxFire",
    channel: "fx",
    relativePath: "sfx-fire.ogg",
    loop: false,
    volume: 0.7,
    preload: "metadata",
  },
  sfxExplosion: {
    id: "sfxExplosion",
    channel: "fx",
    relativePath: "sfx-explosion.ogg",
    loop: false,
    volume: 0.75,
    preload: "metadata",
  },
  sfxHit: {
    id: "sfxHit",
    channel: "fx",
    relativePath: "sfx-hit.ogg",
    loop: false,
    volume: 0.65,
    preload: "metadata",
  },
  sfxDash: {
    id: "sfxDash",
    channel: "fx",
    relativePath: "sfx-dash.ogg",
    loop: false,
    volume: 0.7,
    preload: "metadata",
  },
  sfxCountdown: {
    id: "sfxCountdown",
    channel: "fx",
    relativePath: "sfx-countdown.ogg",
    loop: false,
    volume: 0.7,
    preload: "metadata",
  },
  sfxFight: {
    id: "sfxFight",
    channel: "fx",
    relativePath: "sfx-fight.ogg",
    loop: false,
    volume: 0.75,
    preload: "metadata",
  },
  sfxWin: {
    id: "sfxWin",
    channel: "fx",
    relativePath: "sfx-win.ogg",
    loop: false,
    volume: 0.75,
    preload: "metadata",
  },
  sfxKill: {
    id: "sfxKill",
    channel: "fx",
    relativePath: "sfx-kill.ogg",
    loop: false,
    volume: 0.72,
    preload: "metadata",
  },
  sfxRespawn: {
    id: "sfxRespawn",
    channel: "fx",
    relativePath: "sfx-respawn.ogg",
    loop: false,
    volume: 0.7,
    preload: "metadata",
  },
  sfxUiClick: {
    id: "sfxUiClick",
    channel: "ui",
    relativePath: "sfx-ui-click.ogg",
    loop: false,
    volume: 0.65,
    preload: "metadata",
  },
  sfxPilotEject: {
    id: "sfxPilotEject",
    channel: "fx",
    relativePath: "sfx-pilot-eject.ogg",
    loop: false,
    volume: 0.72,
    preload: "metadata",
  },
  sfxPilotDeath: {
    id: "sfxPilotDeath",
    channel: "fx",
    relativePath: "sfx-pilot-death.ogg",
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

export function getAudioAssetHrefElementId(assetId: AudioAssetId): string {
  return AUDIO_ASSET_HREF_ELEMENT_ID_PREFIX + assetId;
}

function resolveAudioAssetHrefFromDom(assetId: AudioAssetId): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const elementId = getAudioAssetHrefElementId(assetId);
  const element = document.getElementById(elementId);
  if (!element) {
    return null;
  }

  const hrefAttribute = element.getAttribute("href");
  if (typeof hrefAttribute === "string" && hrefAttribute.length > 0) {
    return hrefAttribute;
  }

  if ("href" in element) {
    const resolvedHref = (element as HTMLAnchorElement).href;
    if (typeof resolvedHref === "string" && resolvedHref.length > 0) {
      return resolvedHref;
    }
  }

  return null;
}

export function resolveAudioAssetUrl(assetId: AudioAssetId): string {
  const domHref = resolveAudioAssetHrefFromDom(assetId);
  if (domHref !== null) {
    return domHref;
  }

  const asset = AUDIO_ASSETS[assetId];
  return AUDIO_ASSET_ROOT_PATH + "/" + asset.relativePath;
}
