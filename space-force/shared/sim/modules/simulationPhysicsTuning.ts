import type {
  ActiveConfig,
  AdvancedSettings,
  BaseGameMode,
  DebugPhysicsGlobals,
  DebugPhysicsMaterials,
  DebugPhysicsTuningPayload,
} from "../types.js";
import {
  CHAOTIC_CONFIG,
  DASH_POWER_PRESET_OVERRIDES,
  FIRE_COOLDOWN_MS,
  FIRE_HOLD_REPEAT_DELAY_MS,
  LASER_BEAM_DURATION_MS,
  LASER_BEAM_WIDTH,
  LASER_CHARGES,
  LASER_COOLDOWN_MS,
  PILOT_ANGULAR_DAMPING,
  PILOT_DASH_COOLDOWN_MS,
  PILOT_FRICTION_AIR,
  PROJECTILE_LIFETIME_MS,
  PROJECTILE_RADIUS,
  PROJECTILE_VISUAL_GLOW_RADIUS,
  RELOAD_MS,
  SANE_CONFIG,
  SHIP_DODGE_ANGLE_DEG,
  SHIP_DODGE_COOLDOWN_MS,
  SHIP_ANGULAR_DAMPING_BY_PRESET,
  SHIP_FRICTION_AIR_BY_PRESET,
  SHIP_FRICTION_BY_PRESET,
  SHIP_RESTITUTION_BY_PRESET,
  SHIP_SPEED_PRESET_OVERRIDES,
  STANDARD_CONFIG,
  WALL_FRICTION_BY_PRESET,
  WALL_RESTITUTION_BY_PRESET,
} from "../constants.js";
import { getModeBaseConfig, resolveConfigValue } from "../utils.js";
import {
  DEBUG_CONFIG_KEYS,
  DEBUG_GLOBAL_KEYS,
  DEBUG_MATERIAL_KEYS,
} from "./simulationSettings.js";

export function getActiveConfigFromSettings(
  baseMode: BaseGameMode,
  settings: AdvancedSettings,
  debugPhysicsTuning: DebugPhysicsTuningPayload | null,
): ActiveConfig {
  const cfg = getModeBaseConfig(baseMode);

  const shipSpeedOverride = SHIP_SPEED_PRESET_OVERRIDES[settings.shipSpeed];
  if (shipSpeedOverride) {
    cfg.SHIP_TARGET_SPEED = shipSpeedOverride.SHIP_TARGET_SPEED;
    cfg.BASE_THRUST = shipSpeedOverride.BASE_THRUST;
  }

  const dashPowerOverride = DASH_POWER_PRESET_OVERRIDES[settings.dashPower];
  if (dashPowerOverride) {
    cfg.SHIP_DASH_BOOST = dashPowerOverride.SHIP_DASH_BOOST;
    cfg.DASH_FORCE = dashPowerOverride.DASH_FORCE;
  }

  cfg.ROTATION_SPEED = resolveConfigValue(
    settings.rotationPreset,
    STANDARD_CONFIG.ROTATION_SPEED,
    SANE_CONFIG.ROTATION_SPEED,
    CHAOTIC_CONFIG.ROTATION_SPEED,
  );
  cfg.SHIP_ROTATION_RESPONSE = resolveConfigValue(
    settings.rotationPreset,
    STANDARD_CONFIG.SHIP_ROTATION_RESPONSE,
    SANE_CONFIG.SHIP_ROTATION_RESPONSE,
    CHAOTIC_CONFIG.SHIP_ROTATION_RESPONSE,
  );
  cfg.SHIP_ROTATION_RELEASE_RESPONSE = resolveConfigValue(
    settings.rotationPreset,
    STANDARD_CONFIG.SHIP_ROTATION_RELEASE_RESPONSE,
    SANE_CONFIG.SHIP_ROTATION_RELEASE_RESPONSE,
    CHAOTIC_CONFIG.SHIP_ROTATION_RELEASE_RESPONSE,
  );
  cfg.SHIP_ROTATION_DRIFT_RESPONSE_FACTOR = resolveConfigValue(
    settings.rotationPreset,
    STANDARD_CONFIG.SHIP_ROTATION_DRIFT_RESPONSE_FACTOR,
    SANE_CONFIG.SHIP_ROTATION_DRIFT_RESPONSE_FACTOR,
    CHAOTIC_CONFIG.SHIP_ROTATION_DRIFT_RESPONSE_FACTOR,
  );
  cfg.ROTATION_THRUST_BONUS = resolveConfigValue(
    settings.rotationPreset,
    STANDARD_CONFIG.ROTATION_THRUST_BONUS,
    SANE_CONFIG.ROTATION_THRUST_BONUS,
    CHAOTIC_CONFIG.ROTATION_THRUST_BONUS,
  );
  cfg.RECOIL_FORCE = resolveConfigValue(
    settings.recoilPreset,
    STANDARD_CONFIG.RECOIL_FORCE,
    SANE_CONFIG.RECOIL_FORCE,
    CHAOTIC_CONFIG.RECOIL_FORCE,
  );
  cfg.LASER_RECOIL_MULTIPLIER = resolveConfigValue(
    settings.recoilPreset,
    STANDARD_CONFIG.LASER_RECOIL_MULTIPLIER,
    SANE_CONFIG.LASER_RECOIL_MULTIPLIER,
    CHAOTIC_CONFIG.LASER_RECOIL_MULTIPLIER,
  );
  cfg.SHIP_RESTITUTION =
    SHIP_RESTITUTION_BY_PRESET[settings.shipRestitutionPreset];
  cfg.SHIP_FRICTION_AIR =
    SHIP_FRICTION_AIR_BY_PRESET[settings.shipFrictionAirPreset];

  const configOverrides = debugPhysicsTuning?.configOverrides;
  if (configOverrides) {
    for (const key of DEBUG_CONFIG_KEYS) {
      const value = configOverrides[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        cfg[key] = value;
      }
    }
  }

  return cfg;
}

export function resolveMaterialValuesFromSettings(
  settings: AdvancedSettings,
  debugPhysicsTuning: DebugPhysicsTuningPayload | null,
): DebugPhysicsMaterials {
  const materials: DebugPhysicsMaterials = {
    SHIP_RESTITUTION:
      SHIP_RESTITUTION_BY_PRESET[settings.shipRestitutionPreset] ?? 0,
    SHIP_FRICTION: SHIP_FRICTION_BY_PRESET[settings.shipFrictionPreset] ?? 0,
    SHIP_FRICTION_AIR:
      SHIP_FRICTION_AIR_BY_PRESET[settings.shipFrictionAirPreset] ?? 0,
    SHIP_ANGULAR_DAMPING:
      SHIP_ANGULAR_DAMPING_BY_PRESET[settings.angularDampingPreset] ?? 0,
    WALL_RESTITUTION:
      WALL_RESTITUTION_BY_PRESET[settings.wallRestitutionPreset] ?? 0,
    WALL_FRICTION: WALL_FRICTION_BY_PRESET[settings.wallFrictionPreset] ?? 0,
    PILOT_FRICTION_AIR: PILOT_FRICTION_AIR,
    PILOT_ANGULAR_DAMPING: PILOT_ANGULAR_DAMPING,
  };

  const materialOverrides = debugPhysicsTuning?.materialOverrides;
  if (materialOverrides) {
    for (const key of DEBUG_MATERIAL_KEYS) {
      const value = materialOverrides[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        materials[key] = value;
      }
    }
  }
  return materials;
}

export function resolveGlobalValues(
  debugPhysicsTuning: DebugPhysicsTuningPayload | null,
): DebugPhysicsGlobals {
  const globals: DebugPhysicsGlobals = {
    SHIP_DODGE_COOLDOWN_MS,
    SHIP_DODGE_ANGLE_DEG,
    FIRE_COOLDOWN_MS,
    FIRE_HOLD_REPEAT_DELAY_MS,
    RELOAD_MS,
    LASER_CHARGES,
    LASER_COOLDOWN_MS,
    LASER_BEAM_DURATION_MS,
    LASER_BEAM_WIDTH,
    PROJECTILE_LIFETIME_MS,
    PROJECTILE_RADIUS,
    PROJECTILE_VISUAL_GLOW_RADIUS,
    PILOT_DASH_COOLDOWN_MS,
  };

  const globalOverrides = debugPhysicsTuning?.globalOverrides;
  if (globalOverrides) {
    for (const key of DEBUG_GLOBAL_KEYS) {
      const value = globalOverrides[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        globals[key] = value;
      }
    }
  }

  return globals;
}

export function sanitizeDebugPhysicsTuningPayload(
  payload: DebugPhysicsTuningPayload | null,
): DebugPhysicsTuningPayload | null {
  if (!payload) return null;

  const configOverrides: Partial<ActiveConfig> = {};
  const sourceConfigOverrides = payload.configOverrides;
  if (sourceConfigOverrides) {
    for (const key of DEBUG_CONFIG_KEYS) {
      const value = sourceConfigOverrides[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        configOverrides[key] = value;
      }
    }
  }

  const materialOverrides: Partial<DebugPhysicsMaterials> = {};
  const sourceMaterialOverrides = payload.materialOverrides;
  if (sourceMaterialOverrides) {
    for (const key of DEBUG_MATERIAL_KEYS) {
      const value = sourceMaterialOverrides[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        materialOverrides[key] = value;
      }
    }
  }

  const globalOverrides: Partial<DebugPhysicsGlobals> = {};
  const sourceGlobalOverrides = payload.globalOverrides;
  if (sourceGlobalOverrides) {
    for (const key of DEBUG_GLOBAL_KEYS) {
      const value = sourceGlobalOverrides[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        globalOverrides[key] = value;
      }
    }
  }

  const hasConfigOverrides = Object.keys(configOverrides).length > 0;
  const hasMaterialOverrides = Object.keys(materialOverrides).length > 0;
  const hasGlobalOverrides = Object.keys(globalOverrides).length > 0;
  if (!hasConfigOverrides && !hasMaterialOverrides && !hasGlobalOverrides) {
    return null;
  }
  return {
    configOverrides: hasConfigOverrides ? configOverrides : undefined,
    materialOverrides: hasMaterialOverrides ? materialOverrides : undefined,
    globalOverrides: hasGlobalOverrides ? globalOverrides : undefined,
  };
}
