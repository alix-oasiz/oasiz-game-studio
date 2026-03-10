import type {
  ActiveConfig,
  AdvancedSettings,
  BaseGameMode,
  DebugPhysicsGlobals,
  DebugPhysicsMaterials,
} from "../types.js";
import { DEFAULT_ADVANCED_SETTINGS } from "../constants.js";
import { clamp } from "../utils.js";

const MODE_PRESETS = ["STANDARD", "SANE", "CHAOTIC"] as const;
const SPEED_PRESETS = ["SLOW", "NORMAL", "FAST"] as const;
const DASH_PRESETS = ["LOW", "NORMAL", "HIGH"] as const;
const ASTEROID_DENSITIES = ["NONE", "SOME", "MANY", "SPAWN"] as const;

export const DEBUG_CONFIG_KEYS: ReadonlyArray<keyof ActiveConfig> = [
  "BASE_THRUST",
  "ROTATION_SPEED",
  "SHIP_ROTATION_RESPONSE",
  "SHIP_ROTATION_RELEASE_RESPONSE",
  "SHIP_ROTATION_DRIFT_RESPONSE_FACTOR",
  "ROTATION_THRUST_BONUS",
  "RECOIL_FORCE",
  "LASER_RECOIL_MULTIPLIER",
  "DASH_FORCE",
  "SHIP_FRICTION_AIR",
  "SHIP_RESTITUTION",
  "SHIP_TARGET_SPEED",
  "SHIP_SPEED_RESPONSE",
  "SHIP_DASH_BOOST",
  "SHIP_DASH_DURATION",
  "SHIP_RECOIL_SLOWDOWN",
  "SHIP_RECOIL_DURATION",
  "PROJECTILE_SPEED",
  "PILOT_ROTATION_SPEED",
  "PILOT_DASH_FORCE",
];

export const DEBUG_MATERIAL_KEYS: ReadonlyArray<keyof DebugPhysicsMaterials> = [
  "SHIP_RESTITUTION",
  "SHIP_FRICTION_AIR",
  "SHIP_FRICTION",
  "SHIP_ANGULAR_DAMPING",
  "WALL_RESTITUTION",
  "WALL_FRICTION",
  "PILOT_FRICTION_AIR",
  "PILOT_ANGULAR_DAMPING",
];

export const DEBUG_GLOBAL_KEYS: ReadonlyArray<keyof DebugPhysicsGlobals> = [
  "SHIP_DODGE_COOLDOWN_MS",
  "SHIP_DODGE_ANGLE_DEG",
  "FIRE_COOLDOWN_MS",
  "FIRE_HOLD_REPEAT_DELAY_MS",
  "RELOAD_MS",
  "LASER_CHARGES",
  "LASER_COOLDOWN_MS",
  "LASER_BEAM_DURATION_MS",
  "LASER_BEAM_WIDTH",
  "PROJECTILE_LIFETIME_MS",
  "PROJECTILE_RADIUS",
  "PROJECTILE_VISUAL_GLOW_RADIUS",
  "PILOT_DASH_COOLDOWN_MS",
];

function isInList<T extends string>(
  value: string,
  values: readonly T[],
): value is T {
  return (values as readonly string[]).includes(value);
}

export function sanitizeBaseMode(
  value: string,
  fallback: BaseGameMode,
): BaseGameMode {
  return isInList(value, MODE_PRESETS) ? value : fallback;
}

export function sanitizeAdvancedSettings(
  input: AdvancedSettings,
): AdvancedSettings {
  const settings: AdvancedSettings = {
    ...DEFAULT_ADVANCED_SETTINGS,
    ...input,
  };

  if (!isInList(settings.asteroidDensity, ASTEROID_DENSITIES)) {
    settings.asteroidDensity = DEFAULT_ADVANCED_SETTINGS.asteroidDensity;
  }
  settings.startPowerups = Boolean(settings.startPowerups);
  if (!Number.isFinite(settings.roundsToWin)) {
    settings.roundsToWin = DEFAULT_ADVANCED_SETTINGS.roundsToWin;
  } else {
    settings.roundsToWin = clamp(Math.round(settings.roundsToWin), 3, 6);
  }

  if (!isInList(settings.shipSpeed, SPEED_PRESETS)) {
    settings.shipSpeed = DEFAULT_ADVANCED_SETTINGS.shipSpeed;
  }
  if (!isInList(settings.dashPower, DASH_PRESETS)) {
    settings.dashPower = DEFAULT_ADVANCED_SETTINGS.dashPower;
  }
  if (!isInList(settings.rotationPreset, MODE_PRESETS)) {
    settings.rotationPreset = DEFAULT_ADVANCED_SETTINGS.rotationPreset;
  }
  // Rotation is treated as one combined preset; keep boost in lockstep.
  settings.rotationBoostPreset = settings.rotationPreset;
  if (!isInList(settings.recoilPreset, MODE_PRESETS)) {
    settings.recoilPreset = DEFAULT_ADVANCED_SETTINGS.recoilPreset;
  }
  if (!isInList(settings.shipRestitutionPreset, MODE_PRESETS)) {
    settings.shipRestitutionPreset =
      DEFAULT_ADVANCED_SETTINGS.shipRestitutionPreset;
  }
  if (!isInList(settings.shipFrictionAirPreset, MODE_PRESETS)) {
    settings.shipFrictionAirPreset =
      DEFAULT_ADVANCED_SETTINGS.shipFrictionAirPreset;
  }
  if (!isInList(settings.wallRestitutionPreset, MODE_PRESETS)) {
    settings.wallRestitutionPreset =
      DEFAULT_ADVANCED_SETTINGS.wallRestitutionPreset;
  }
  if (!isInList(settings.wallFrictionPreset, MODE_PRESETS)) {
    settings.wallFrictionPreset = DEFAULT_ADVANCED_SETTINGS.wallFrictionPreset;
  }
  if (!isInList(settings.shipFrictionPreset, MODE_PRESETS)) {
    settings.shipFrictionPreset = DEFAULT_ADVANCED_SETTINGS.shipFrictionPreset;
  }
  if (!isInList(settings.angularDampingPreset, MODE_PRESETS)) {
    settings.angularDampingPreset =
      DEFAULT_ADVANCED_SETTINGS.angularDampingPreset;
  }

  return settings;
}

export function applyModeTemplate(
  baseMode: BaseGameMode,
  roundsToWin: number,
): AdvancedSettings {
  if (baseMode === "SANE") {
    return {
      ...DEFAULT_ADVANCED_SETTINGS,
      roundsToWin: clamp(Math.round(roundsToWin), 3, 6),
      asteroidDensity: "MANY",
      startPowerups: true,
      rotationPreset: "SANE",
      rotationBoostPreset: "SANE",
      recoilPreset: "SANE",
      shipRestitutionPreset: "SANE",
      shipFrictionAirPreset: "SANE",
      wallRestitutionPreset: "SANE",
      wallFrictionPreset: "SANE",
      shipFrictionPreset: "SANE",
      angularDampingPreset: "SANE",
    };
  }
  if (baseMode === "CHAOTIC") {
    return {
      ...DEFAULT_ADVANCED_SETTINGS,
      roundsToWin: clamp(Math.round(roundsToWin), 3, 6),
      asteroidDensity: "SPAWN",
      startPowerups: true,
      rotationPreset: "CHAOTIC",
      rotationBoostPreset: "CHAOTIC",
      recoilPreset: "CHAOTIC",
      shipRestitutionPreset: "CHAOTIC",
      shipFrictionAirPreset: "CHAOTIC",
      wallRestitutionPreset: "CHAOTIC",
      wallFrictionPreset: "CHAOTIC",
      shipFrictionPreset: "CHAOTIC",
      angularDampingPreset: "CHAOTIC",
    };
  }
  return {
    ...DEFAULT_ADVANCED_SETTINGS,
    roundsToWin: clamp(Math.round(roundsToWin), 3, 6),
  };
}

export function isCustomComparedToTemplate(
  settings: AdvancedSettings,
  template: AdvancedSettings,
): boolean {
  return (
    settings.asteroidDensity !== template.asteroidDensity ||
    settings.startPowerups !== template.startPowerups ||
    settings.shipSpeed !== template.shipSpeed ||
    settings.dashPower !== template.dashPower ||
    settings.rotationPreset !== template.rotationPreset ||
    settings.recoilPreset !== template.recoilPreset ||
    settings.shipRestitutionPreset !== template.shipRestitutionPreset ||
    settings.shipFrictionAirPreset !== template.shipFrictionAirPreset ||
    settings.wallRestitutionPreset !== template.wallRestitutionPreset ||
    settings.wallFrictionPreset !== template.wallFrictionPreset ||
    settings.shipFrictionPreset !== template.shipFrictionPreset ||
    settings.angularDampingPreset !== template.angularDampingPreset
  );
}
