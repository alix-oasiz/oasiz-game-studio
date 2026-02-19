import {
  AdvancedSettings,
  AsteroidDensity,
  DashPreset,
  DEFAULT_ADVANCED_SETTINGS,
  BaseGameMode,
  ModePreset,
  SpeedPreset,
} from "./types";

const ASTEROID_DENSITIES: AsteroidDensity[] = ["NONE", "SOME", "MANY", "SPAWN"];
const SPEED_PRESETS: SpeedPreset[] = ["SLOW", "NORMAL", "FAST"];
const DASH_PRESETS: DashPreset[] = ["LOW", "NORMAL", "HIGH"];
const MODE_PRESETS: ModePreset[] = ["STANDARD", "SANE", "CHAOTIC"];

export type ModeTemplate = AdvancedSettings;

function clampRounds(value: number): number {
  const rounded = Math.round(value);
  if (rounded < 3) return 3;
  if (rounded > 6) return 6;
  return rounded;
}

export function sanitizeAdvancedSettings(
  input: Partial<AdvancedSettings> | AdvancedSettings,
): AdvancedSettings {
  const merged: AdvancedSettings = {
    ...DEFAULT_ADVANCED_SETTINGS,
    ...input,
  };

  if (!ASTEROID_DENSITIES.includes(merged.asteroidDensity)) {
    merged.asteroidDensity = DEFAULT_ADVANCED_SETTINGS.asteroidDensity;
  }
  if (!SPEED_PRESETS.includes(merged.shipSpeed)) {
    merged.shipSpeed = DEFAULT_ADVANCED_SETTINGS.shipSpeed;
  }
  if (!DASH_PRESETS.includes(merged.dashPower)) {
    merged.dashPower = DEFAULT_ADVANCED_SETTINGS.dashPower;
  }
  if (!MODE_PRESETS.includes(merged.rotationPreset)) {
    merged.rotationPreset = DEFAULT_ADVANCED_SETTINGS.rotationPreset;
  }
  if (!MODE_PRESETS.includes(merged.rotationBoostPreset)) {
    merged.rotationBoostPreset = DEFAULT_ADVANCED_SETTINGS.rotationBoostPreset;
  }
  if (!MODE_PRESETS.includes(merged.recoilPreset)) {
    merged.recoilPreset = DEFAULT_ADVANCED_SETTINGS.recoilPreset;
  }
  if (!MODE_PRESETS.includes(merged.shipRestitutionPreset)) {
    merged.shipRestitutionPreset =
      DEFAULT_ADVANCED_SETTINGS.shipRestitutionPreset;
  }
  if (!MODE_PRESETS.includes(merged.shipFrictionAirPreset)) {
    merged.shipFrictionAirPreset =
      DEFAULT_ADVANCED_SETTINGS.shipFrictionAirPreset;
  }
  if (!MODE_PRESETS.includes(merged.wallRestitutionPreset)) {
    merged.wallRestitutionPreset =
      DEFAULT_ADVANCED_SETTINGS.wallRestitutionPreset;
  }
  if (!MODE_PRESETS.includes(merged.wallFrictionPreset)) {
    merged.wallFrictionPreset = DEFAULT_ADVANCED_SETTINGS.wallFrictionPreset;
  }
  if (!MODE_PRESETS.includes(merged.shipFrictionPreset)) {
    merged.shipFrictionPreset = DEFAULT_ADVANCED_SETTINGS.shipFrictionPreset;
  }
  if (!MODE_PRESETS.includes(merged.angularDampingPreset)) {
    merged.angularDampingPreset =
      DEFAULT_ADVANCED_SETTINGS.angularDampingPreset;
  }

  merged.startPowerups = Boolean(merged.startPowerups);

  if (!Number.isFinite(merged.roundsToWin)) {
    merged.roundsToWin = DEFAULT_ADVANCED_SETTINGS.roundsToWin;
  } else {
    merged.roundsToWin = clampRounds(merged.roundsToWin);
  }

  return merged;
}

export const MODE_TEMPLATES: Record<BaseGameMode, ModeTemplate> = {
  STANDARD: {
    ...DEFAULT_ADVANCED_SETTINGS,
    asteroidDensity: "SOME",
    startPowerups: false,
    rotationPreset: "STANDARD",
    rotationBoostPreset: "STANDARD",
    recoilPreset: "STANDARD",
    shipRestitutionPreset: "STANDARD",
    shipFrictionAirPreset: "STANDARD",
    wallRestitutionPreset: "STANDARD",
    wallFrictionPreset: "STANDARD",
    shipFrictionPreset: "STANDARD",
    angularDampingPreset: "STANDARD",
  },
  SANE: {
    ...DEFAULT_ADVANCED_SETTINGS,
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
  },
  CHAOTIC: {
    ...DEFAULT_ADVANCED_SETTINGS,
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
  },
};

export function applyModeTemplate(mode: BaseGameMode): ModeTemplate {
  return { ...MODE_TEMPLATES[mode] };
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
    settings.rotationBoostPreset !== template.rotationBoostPreset ||
    settings.recoilPreset !== template.recoilPreset ||
    settings.shipRestitutionPreset !== template.shipRestitutionPreset ||
    settings.shipFrictionAirPreset !== template.shipFrictionAirPreset ||
    settings.wallRestitutionPreset !== template.wallRestitutionPreset ||
    settings.wallFrictionPreset !== template.wallFrictionPreset ||
    settings.shipFrictionPreset !== template.shipFrictionPreset ||
    settings.angularDampingPreset !== template.angularDampingPreset
  );
}
