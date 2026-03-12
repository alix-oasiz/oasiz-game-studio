// Centralized gameplay-impact tuning for map features.
// Keep renderer-only cosmetic values out of this file.

export interface MapFieldProfile {
  // How far a field reaches relative to the map element radius.
  // Higher = larger influence bubble.
  // Feel: makes zones/hole control more of the arena.
  // Typical range: 1.0 - 3.5
  influenceRadiusMultiplier: number;
  // Ignore samples closer than this distance to avoid unstable spikes.
  // Higher = weaker influence near the center edge.
  // Feel: reduces "snap" and spikey movement near core.
  // Typical range: 4 - 24
  minDistance: number;
  // Shape of falloff from edge->center influence.
  // Higher = force concentrates toward center.
  // Lower = smoother, flatter force across the radius.
  // Feel: changes "sticky center" vs "wide gentle pull/push."
  // Typical range: 0.75 - 3.0
  falloffExponent: number;
  // Lower bound for distance-based divisions.
  // Higher = caps near-center force more aggressively.
  // Feel: prevents crazy bursts when entities pass close.
  // Typical range: 40 - 220
  distanceFloor: number;
}

export interface MapFieldSample {
  falloff: number;
}

export function sampleMapField(
  distance: number,
  influenceRadius: number,
  profile: MapFieldProfile,
): MapFieldSample | null {
  if (distance >= influenceRadius || distance <= profile.minDistance) return null;
  const t = (influenceRadius - distance) / influenceRadius;
  return {
    falloff: Math.pow(Math.max(0, Math.min(1, t)), profile.falloffExponent),
  };
}

export const VORTEX_TUNING = {
  profile: {
    // Radius of tangential influence around each center hole.
    influenceRadiusMultiplier: 2.5,
    // Keep a dead zone around the core to avoid jitter/spikes.
    minDistance: 10,
    // Falloff shape for core effect.
    falloffExponent: 2,
    // Clamp for projectile damping denominator.
    distanceFloor: 120,
  } satisfies MapFieldProfile,
  // Base tangential force before per-entity modifiers.
  // Higher = stronger map spin for dynamic bodies (ships/pilots/asteroids).
  // Feel: larger values make fights "orbit-y"; lower keeps aim cleaner.
  // Typical range: 0.0005 - 0.003
  baseForce: 0.0015,
  // Lower values = less curving.
  // 1.0 means projectile curves like heavy bodies.
  // Feel: lower for more readable shooting; higher for chaos.
  // Typical range: 0.2 - 1.0
  projectileDivergenceFactor: 0.45,
  // Same idea as projectile divergence, but for turret bullets.
  // Typical range: 0.2 - 1.0
  turretBulletDivergenceFactor: 0.55,
  // Extra distance damping to keep bullets/projectiles readable.
  // Higher = less curving, especially near center.
  // Lower = stronger curve near core.
  // Typical range: 8 - 40
  projectileDistanceDamping: 18,
  // Kinematic entities (not simulated as dynamic Matter bodies) use manual drift.
  // Defaults are 0 to preserve current gameplay; increase to enable these.
  // For each *Base / *Falloff pair:
  // Base = minimum drift everywhere in zone.
  // Falloff = extra drift as entity gets closer to center.
  // Typical range each: 0 - 24
  homingMissileTangentialBase: 0,
  homingMissileTangentialFalloff: 0,
  mineTangentialBase: 0,
  mineTangentialFalloff: 0,
  powerUpTangentialBase: 0,
  powerUpTangentialFalloff: 0,
  // Converts per-second style drift to the simulation's step scale.
  // Usually keep at 60 unless global integration changes.
  // Typical range: 30 - 120
  kinematicStepScale: 60,
} as const;

export const REPULSION_TUNING = {
  profile: {
    // Radius of repulsion influence around each zone.
    influenceRadiusMultiplier: 1.75,
    // Dead zone near center to avoid unstable acceleration spikes.
    minDistance: 8,
    // Falloff shape for repulsion sample.
    falloffExponent: 1,
    // Clamp for distance denominator.
    distanceFloor: 60,
  } satisfies MapFieldProfile,
  // Body force curve: strengthScale = base + falloff * falloffScale.
  // Raise either to increase push force on dynamic bodies.
  // Feel: strong repulsion creates bigger spacing and fewer close duels.
  // Typical base range: 0.2 - 1.8
  bodyStrengthBaseScale: 0.8,
  // Typical falloff scale range: 0.2 - 2.5
  bodyStrengthFalloffScale: 1.4,
  // Distance exponent in denominator (1 = linear, 2 = quadratic).
  // Higher = much weaker far away, stronger near center.
  // Typical range: 1 - 2.5
  bodyDistanceExponent: 2,
  // Per-entity response multipliers for non-rigid-body entities.
  // For each pair:
  // Base = always-on drift/accel inside zone.
  // Falloff = additional near-center push.
  // Typical range each: 0 - 30
  homingMissileAccelBase: 6,
  homingMissileAccelFalloff: 10,
  mineDriftBase: 12,
  mineDriftFalloff: 16,
  powerUpDriftBase: 8,
  powerUpDriftFalloff: 12,
  // Explicit conversion for kinematic entities that store px/tick-ish velocity.
  // Usually keep at 60 unless integration/tick model changes.
  // Typical range: 30 - 120
  kinematicStepScale: 60,
} as const;

export const TURRET_TUNING = {
  // How far turret can acquire targets.
  // Higher = turret pressures more of the arena.
  // Typical range: 120 - 600
  detectionRadius: 300,
  // Exposed for UI/network state parity (turret ring presentation).
  // Typical range: 20 - 120
  orbitRadius: 50,
  // Angular response toward target error.
  // Higher = snaps to target faster, more oppressive.
  // Typical range: 1.0 - 8.0
  trackingResponse: 3.0,
  // Rotation speed while idle (no target).
  // Typical range: 0.1 - 2.0
  idleRotationSpeed: 0.5,
  // Time between shots.
  // Lower = more spam.
  // Typical range: 300 - 3000
  fireCooldownMs: 1500,
  // Must be within this angle error before firing.
  // Lower = more accurate but fewer shots.
  // Higher = more frequent but sloppier shots.
  // Typical range: 0.05 - 0.8 radians
  fireAngleThreshold: 0.25,
  // Spawn point from turret center.
  // Typical range: 20 - 80
  muzzleOffset: 40,
  // Bullet speed and life define practical range + dodge window.
  // Typical speed range: 4 - 20
  bulletSpeed: 12,
  // Typical lifetime range: 500 - 8000 ms
  bulletLifetimeMs: 3000,
  // Physics collider radius.
  // Typical range: 2 - 14
  bulletRadius: 5,
  // Trigger radius for impact detonation on ships.
  // Typical range: 8 - 48
  bulletImpactRadius: 25,
  // AoE radius on explosion.
  // Typical range: 20 - 220
  bulletExplosionRadius: 100,
  // Visual/logic explosion window.
  // Typical range: 150 - 1200 ms
  bulletExplosionDurationMs: 500,
} as const;
