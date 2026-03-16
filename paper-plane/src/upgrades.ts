// ============= UPGRADE SYSTEM =============
// 6 upgrade paths, 5 levels each. Add a new entry here to create a new upgrade path.

export interface UpgradeTree {
  fireRate: number; // 0-5
  multiShot: number; // 0-5
  turrets: number; // 0-5
  reinforcedHull: number; // 0-5
  piercingRounds: number; // 0-5
  emergencyShielding: number; // 0-5
}

export const PRIMARY_UPGRADE_KEYS: (keyof UpgradeTree)[] = [
  "fireRate",
  "multiShot",
  "turrets",
];
export const SECONDARY_UPGRADE_KEYS: (keyof UpgradeTree)[] = [
  "reinforcedHull",
  "piercingRounds",
  "emergencyShielding",
];

export interface UpgradeLevelConfig {
  name: string;
  desc: string;
  value: number;
}

export interface UpgradePathConfig {
  name: string;
  icon: string;
  levels: UpgradeLevelConfig[];
}

export const UPGRADE_CONFIG: Record<keyof UpgradeTree, UpgradePathConfig> = {
  fireRate: {
    name: "Fire Rate",
    icon: "F",
    levels: [
      { name: "Quick Draw", desc: "+15% fire rate", value: 1.15 },
      { name: "Rapid Fire", desc: "+30% fire rate", value: 1.3 },
      { name: "Machine Gun", desc: "+50% fire rate", value: 1.5 },
      { name: "Bullet Storm", desc: "+75% fire rate", value: 1.75 },
      { name: "Lead Rain", desc: "+100% fire rate", value: 2.0 },
    ],
  },
  multiShot: {
    name: "Multi-Shot",
    icon: "M",
    levels: [
      { name: "Double Tap", desc: "2 bullets per shot", value: 2 },
      { name: "Triple Threat", desc: "3 bullets per shot", value: 3 },
      { name: "Quad Shot", desc: "4 bullets per shot", value: 4 },
      { name: "Penta Burst", desc: "5 bullets per shot", value: 5 },
      { name: "Full Spread", desc: "7 bullets per shot", value: 7 },
    ],
  },
  turrets: {
    name: "Turret Buddy",
    icon: "T",
    levels: [
      { name: "Helper I", desc: "Deploy 1 auto-turret", value: 1 },
      { name: "Helper II", desc: "Deploy 2 auto-turrets", value: 2 },
      { name: "Helper III", desc: "Deploy 3 auto-turrets", value: 3 },
      { name: "Helper IV", desc: "Deploy 4 auto-turrets", value: 4 },
      { name: "Helper V", desc: "Deploy 5 auto-turrets", value: 5 },
    ],
  },
  reinforcedHull: {
    name: "Reinforced Hull",
    icon: "H",
    levels: [
      { name: "Armored I", desc: "+1 max health", value: 1 },
      { name: "Auto-Repair", desc: "Regen 1 HP every 15s", value: 15 },
      { name: "Armored II", desc: "+1 max health again", value: 2 },
      { name: "Fast Repair", desc: "Regen interval → 8s", value: 8 },
      { name: "Armored III", desc: "+1 max health again", value: 3 },
    ],
  },
  piercingRounds: {
    name: "Piercing Rounds",
    icon: "P",
    levels: [
      { name: "Sharpened I", desc: "Bullets pierce +1 enemy", value: 1 },
      { name: "Sharpened II", desc: "Bullets pierce +2 enemies", value: 2 },
      { name: "Sharpened III", desc: "Bullets pierce +3 enemies", value: 3 },
      { name: "Needle Tip", desc: "Bullets pierce +4 enemies", value: 4 },
      { name: "Phantom Round", desc: "Bullets pierce +5 enemies", value: 5 },
    ],
  },
  emergencyShielding: {
    name: "Emergency Shield",
    icon: "S",
    levels: [
      { name: "Buffer I", desc: "+0.4s invincibility on hit", value: 0.4 },
      { name: "Buffer II", desc: "+0.8s invincibility on hit", value: 0.8 },
      { name: "Buffer III", desc: "+1.2s invincibility on hit", value: 1.2 },
      { name: "Buffer IV", desc: "+1.6s invincibility on hit", value: 1.6 },
      { name: "Buffer V", desc: "+2.0s invincibility on hit", value: 2.0 },
    ],
  },
};

export function createEmptyUpgradeTree(): UpgradeTree {
  return {
    fireRate: 0,
    multiShot: 0,
    turrets: 0,
    reinforcedHull: 0,
    piercingRounds: 0,
    emergencyShielding: 0,
  };
}

export function getSpentUpgradePoints(upgrades: UpgradeTree): number {
  return Object.values(upgrades).reduce((a, b) => a + b, 0);
}

export function getAvailableUpgradePointsFromProgression(
  highestUnlockedRound: number,
): number {
  // 2 upgrade points per boss round cleared
  return highestUnlockedRound * 2;
}

/** Returns how many asteroids must be destroyed to trigger the next upgrade screen.
 *  R1: 12, 24 | R2: 25, 50 | R3: 51, 102 | ...
 *  Formula: U1(R) = U2(R-1) + 1,  U2(R) = U1(R) * 2
 */
export function getAsteroidsForNextUpgrade(totalUpgrades: number): number {
  const round = Math.floor(totalUpgrades / 2) + 1;
  const isSecond = totalUpgrades % 2 === 1;

  if (round === 1) return isSecond ? 24 : 12;

  let u2 = 24;
  for (let r = 2; r <= round; r++) {
    u2 = u2 * 2 + 2;
  }
  // u2 is now U2(round); U2(round-1) = (u2 - 2) / 2
  const prevU2 = (u2 - 2) / 2;
  const u1 = prevU2 + 1;
  return isSecond ? u2 : u1;
}

/** Human-readable description of what a specific level of an upgrade path does. */
export function getUpgradeLevelDescription(
  key: keyof UpgradeTree,
  level: number,
): string {
  if (level <= 0) return "Not yet upgraded.";
  const cfg = UPGRADE_CONFIG[key];
  const lvl = cfg.levels[Math.min(level - 1, cfg.levels.length - 1)];
  return lvl ? lvl.desc : "Maxed.";
}
