// ============= ULTIMATE ABILITY SYSTEM =============
// 3 families, 5 levels each.
// To add a new family: add an entry to ABILITY_FAMILIES and UltimateLevelMap.

export type AbilityFamily = "shield" | "blast" | "turbo";

/** Maps each ability family to its current upgrade level (0 = not unlocked). */
export type UltimateLevelMap = Record<AbilityFamily, number>;

export interface AbilityLevelDef {
  name: string;
  desc: string;
  /** Numeric value used at runtime (duration, damage, etc.) */
  value: number;
}

export interface AbilityFamilyDef {
  id: AbilityFamily;
  name: string;
  icon: string; // SVG icon type key
  levels: AbilityLevelDef[]; // exactly 5 entries
}

/** All available ultimate ability families.
 *  Add a new AbilityFamilyDef here to register a new ultimate. */
export const ABILITY_FAMILIES: AbilityFamilyDef[] = [
  {
    id: "shield",
    name: "Paper Shield",
    icon: "shield",
    levels: [
      { name: "Paper Shield I", desc: "0.5s invincibility", value: 0.5 },
      { name: "Paper Shield II", desc: "1.0s invincibility", value: 1.0 },
      { name: "Paper Shield III", desc: "1.5s invincibility", value: 1.5 },
      { name: "Paper Shield IV", desc: "2.0s invincibility", value: 2.0 },
      { name: "Paper Shield V", desc: "2.5s invincibility", value: 2.5 },
    ],
  },
  {
    id: "blast",
    name: "Ink Explosion",
    icon: "blast",
    levels: [
      {
        name: "Ink Burst I",
        desc: "Small ink blast, clears nearby foes",
        value: 1,
      },
      { name: "Ink Burst II", desc: "Larger blast, +25% radius", value: 2 },
      {
        name: "Ink Burst III",
        desc: "Big blast, +50% radius & damage",
        value: 3,
      },
      {
        name: "Ink Surge IV",
        desc: "Massive blast + ink puddles linger",
        value: 4,
      },
      {
        name: "Ink Nova V",
        desc: "Screen-filling nova, +100% damage",
        value: 5,
      },
    ],
  },
  {
    id: "turbo",
    name: "Black Hole",
    icon: "turbo",
    levels: [
      { name: "Black Hole I", desc: "Pull nearby enemies for 2s", value: 2 },
      { name: "Black Hole II", desc: "Wider pull radius, 3s", value: 3 },
      { name: "Black Hole III", desc: "Strong pull + slow, 3.5s", value: 3.5 },
      {
        name: "Black Hole IV",
        desc: "Very strong pull + damage, 4s",
        value: 4,
      },
      {
        name: "Black Hole V",
        desc: "Massive singularity, 5s duration",
        value: 5,
      },
    ],
  },
];

export function createEmptyUltimateLevelMap(): UltimateLevelMap {
  return { shield: 0, blast: 0, turbo: 0 };
}

export function getSpentUltimatePoints(map: UltimateLevelMap): number {
  return (Object.values(map) as number[]).reduce((a, b) => a + b, 0);
}

export function getAvailableUltimatePointsFromProgression(
  highestDefeatedRound: number,
): number {
  // 1 ultimate point per boss cleared
  return highestDefeatedRound;
}

/** Max upgrade level per family */
export const ULTIMATE_MAX_LEVEL = 5;

/** Max number of distinct ultimate abilities usable in a single round */
export const ULTIMATE_MAX_PER_ROUND = 3;

/** Returns the human-readable description for a given family at a given level. */
export function getUltimateLevelDescription(
  family: AbilityFamily,
  level: number,
): string {
  if (level <= 0) return "Not unlocked.";
  const def = ABILITY_FAMILIES.find((f) => f.id === family);
  if (!def) return "";
  const lvl = def.levels[Math.min(level - 1, def.levels.length - 1)];
  return lvl ? lvl.desc : "Maxed.";
}

/** Returns runtime value (duration/power) for a family at a level. */
export function getUltimateValue(family: AbilityFamily, level: number): number {
  if (level <= 0) return 0;
  const def = ABILITY_FAMILIES.find((f) => f.id === family);
  if (!def) return 0;
  return def.levels[Math.min(level - 1, def.levels.length - 1)]?.value ?? 0;
}

/** Build list of active ability families from a UltimateLevelMap (only unlocked ones). */
export function getUnlockedFamilies(map: UltimateLevelMap): AbilityFamily[] {
  return (Object.keys(map) as AbilityFamily[]).filter((k) => map[k] > 0);
}
