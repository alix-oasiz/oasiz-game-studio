import { AudioManager } from "../AudioManager";
import { SettingsManager } from "../SettingsManager";

type HapticType = "light" | "medium" | "heavy" | "success" | "error";

type GameplaySoundId =
  | "fire"
  | "dash"
  | "explosion"
  | "pilotEject"
  | "kill"
  | "pilotDeath"
  | "respawn"
  | "win";

type AuthoritativeSoundType =
  | "fire"
  | "dash"
  | "explosion"
  | "kill"
  | "respawn"
  | "win";

const AUTHORITATIVE_SOUND_PRESETS: Record<
  AuthoritativeSoundType,
  GameplaySoundId[]
> = {
  fire: ["fire"],
  dash: ["dash"],
  explosion: ["explosion", "pilotEject"],
  kill: ["kill", "pilotDeath"],
  respawn: ["respawn"],
  win: ["win"],
};

const GAMEPLAY_HAPTIC_PRESETS: Record<"predictedFire" | "predictedDash", HapticType> = {
  predictedFire: "light",
  predictedDash: "medium",
};

function playGameplaySound(id: GameplaySoundId): void {
  switch (id) {
    case "fire":
      void AudioManager.playFire();
      break;
    case "dash":
      void AudioManager.playDash();
      break;
    case "explosion":
      void AudioManager.playExplosion();
      break;
    case "pilotEject":
      void AudioManager.playPilotEject();
      break;
    case "kill":
      void AudioManager.playKill();
      break;
    case "pilotDeath":
      void AudioManager.playPilotDeath();
      break;
    case "respawn":
      void AudioManager.playRespawn();
      break;
    case "win":
      void AudioManager.playWin();
      break;
    default:
      break;
  }
}

function triggerGameplayHaptic(event: "predictedFire" | "predictedDash"): void {
  SettingsManager.triggerHaptic(GAMEPLAY_HAPTIC_PRESETS[event]);
}

export function playPredictedDashFeedback(): void {
  playGameplaySound("dash");
  triggerGameplayHaptic("predictedDash");
}

export function playPredictedFireFeedback(): void {
  playGameplaySound("fire");
  triggerGameplayHaptic("predictedFire");
}

export function playAuthoritativeGameSound(type: string): void {
  const preset = AUTHORITATIVE_SOUND_PRESETS[type as AuthoritativeSoundType];
  if (!preset) return;
  preset.forEach((soundId) => playGameplaySound(soundId));
}
