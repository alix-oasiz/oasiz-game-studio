/**
 * Sprite Animation Configuration for Block Buster Skill Effects.
 *
 * Each entry maps a short animation key to its sprite directory,
 * frame count, frame rate, and display scale.
 *
 * Frames are expected at:
 *   /assets/sprites/{dir}/frame0000.png ... frame{N-1}.png
 */

export interface AnimDef {
	/** Short key used as the Phaser animation key and texture prefix */
	key: string;
	/** Subdirectory inside /assets/sprites/ */
	dir: string;
	/** Number of frames in the animation */
	frames: number;
	/** Playback frame rate (fps) */
	fps: number;
	/** Display scale multiplier (pixel-art sprites are small) */
	scale: number;
}

// ── DAMAGE tier impact effects ───────────────────────────────────────
export const DAMAGE_IMPACT: AnimDef[] = [
	{ key: "impact_hit_blue", dir: "impact_hit_blue", frames: 7, fps: 24, scale: 2 },
	{ key: "impact_shock_green", dir: "impact_shock_green", frames: 7, fps: 24, scale: 2 },
	{ key: "impact_hit_orange", dir: "impact_hit_orange", frames: 8, fps: 24, scale: 2 },
	{ key: "fire_burst_red", dir: "fire_burst_red", frames: 16, fps: 30, scale: 2 },
];

// ── DAMAGE tier kill effects ─────────────────────────────────────────
export const DAMAGE_KILL: AnimDef[] = [
	{ key: "explosion_blue", dir: "explosion_blue", frames: 11, fps: 24, scale: 2 },
	{ key: "explosion_green", dir: "explosion_green", frames: 13, fps: 24, scale: 2 },
	{ key: "toon_explosion_orange", dir: "toon_explosion_orange", frames: 8, fps: 24, scale: 2 },
	{ key: "epic_explosion_red", dir: "epic_explosion_red", frames: 13, fps: 24, scale: 2 },
];

// ── BALLS spawn + projectile ─────────────────────────────────────────
export const BALL_SPAWN: AnimDef = {
	key: "magic_spawn_blue", dir: "magic_spawn_blue", frames: 17, fps: 24, scale: 2.5,
};

export const BALL_BLOB: AnimDef = {
	key: "pj_blob_blue", dir: "pj_blob_blue", frames: 14, fps: 20, scale: 1.2,
};

// ── DUPLICATE tier split effects ─────────────────────────────────────
export const DUPLICATE_SPLIT: AnimDef[] = [
	{ key: "magic_puff_blue", dir: "magic_puff_blue", frames: 12, fps: 24, scale: 2 },
	{ key: "sparkle_burst_green", dir: "sparkle_burst_green", frames: 16, fps: 24, scale: 2 },
	{ key: "magic_swirl_orange", dir: "magic_swirl_orange", frames: 52, fps: 36, scale: 2 },
	{ key: "sparkle_burst_violet", dir: "sparkle_burst_violet", frames: 17, fps: 24, scale: 2 },
];

export const DASH_TRAIL: AnimDef = {
	key: "dash_white", dir: "dash_white", frames: 9, fps: 24, scale: 1.5,
};

// ── LASER tier impact effects ────────────────────────────────────────
export const LASER_IMPACT: AnimDef[] = [
	{ key: "electric_zap_blue", dir: "electric_zap_blue", frames: 6, fps: 20, scale: 2 },
	{ key: "lightning_burst_orange", dir: "lightning_burst_orange", frames: 8, fps: 24, scale: 2 },
	{ key: "lightning_strike_red", dir: "lightning_strike_red", frames: 7, fps: 24, scale: 3 },
];

export const LASER_ACTIVATION: AnimDef = {
	key: "charge_up_blue", dir: "charge_up_blue", frames: 12, fps: 20, scale: 2,
};

// ── ELECTRIC tier chain effects ──────────────────────────────────────
export const ELECTRIC_CHAIN: AnimDef[] = [
	{ key: "electric_zap_blue_chain", dir: "electric_zap_blue", frames: 6, fps: 20, scale: 2 },
	{ key: "electric_burst_violet", dir: "electric_burst_violet", frames: 15, fps: 24, scale: 2 },
	{ key: "lightning_aura_yellow", dir: "lightning_aura_yellow", frames: 22, fps: 24, scale: 2 },
];

export const ELECTRIC_STRIKE: AnimDef[] = [
	{ key: "lightning_strike_blue", dir: "lightning_strike_blue", frames: 7, fps: 24, scale: 2 },
	{ key: "lightning_strike_violet", dir: "lightning_strike_violet", frames: 7, fps: 24, scale: 2 },
	{ key: "lightning_strike_yellow", dir: "lightning_strike_yellow", frames: 8, fps: 24, scale: 3 },
];

export const ELECTRIC_ENDPOINT: AnimDef[] = [
	{ key: "lightning_burst_blue", dir: "lightning_burst_blue", frames: 8, fps: 24, scale: 2 },
	{ key: "lightning_burst_violet", dir: "lightning_burst_violet", frames: 9, fps: 24, scale: 2 },
	{ key: "lightning_burst_yellow", dir: "lightning_burst_yellow", frames: 10, fps: 24, scale: 3 },
];

// ── BOMB tier explosion effects ──────────────────────────────────────
export const BOMB_EXPLOSION: AnimDef[] = [
	{ key: "explosion_large_orange", dir: "explosion_large_orange", frames: 11, fps: 24, scale: 3 },
	{ key: "explosion_large_red", dir: "explosion_large_red", frames: 13, fps: 24, scale: 3 },
	{ key: "epic_explosion_large_red", dir: "epic_explosion_large_red", frames: 15, fps: 24, scale: 4 },
];

export const BOMB_SHOCKWAVE: AnimDef[] = [
	{ key: "shockwave_orange", dir: "shockwave_orange", frames: 5, fps: 16, scale: 4 },
	{ key: "shockwave_red", dir: "shockwave_red", frames: 5, fps: 16, scale: 4 },
	{ key: "shockwave_violet", dir: "shockwave_violet", frames: 5, fps: 16, scale: 5 },
];

export const BOMB_SMOKE: AnimDef[] = [
	{ key: "smoke_burst_orange", dir: "smoke_burst_orange", frames: 10, fps: 20, scale: 3 },
	{ key: "smoke_burst_red", dir: "smoke_burst_red", frames: 13, fps: 20, scale: 3 },
	{ key: "skull_smoke_violet", dir: "skull_smoke_violet", frames: 12, fps: 20, scale: 4 },
];

export const BOMB_PREFLASH: AnimDef = {
	key: "fire_burst_orange", dir: "fire_burst_orange", frames: 16, fps: 30, scale: 2,
};

// ── BURST effects ────────────────────────────────────────────────────
export const BURST_FLASH: AnimDef = {
	key: "light_burst_yellow", dir: "light_burst_yellow", frames: 9, fps: 24, scale: 3,
};

// ── Collect all animations for bulk loading ──────────────────────────
export function getAllAnimDefs(): AnimDef[] {
	const all: AnimDef[] = [
		...DAMAGE_IMPACT,
		...DAMAGE_KILL,
		BALL_SPAWN,
		BALL_BLOB,
		...DUPLICATE_SPLIT,
		DASH_TRAIL,
		...LASER_IMPACT,
		LASER_ACTIVATION,
		...ELECTRIC_CHAIN,
		...ELECTRIC_STRIKE,
		...ELECTRIC_ENDPOINT,
		...BOMB_EXPLOSION,
		...BOMB_SHOCKWAVE,
		...BOMB_SMOKE,
		BOMB_PREFLASH,
		BURST_FLASH,
	];

	// De-duplicate by key (electric_zap_blue used in both LASER and ELECTRIC)
	const seen = new Set<string>();
	return all.filter((a) => {
		if (seen.has(a.key)) return false;
		seen.add(a.key);
		return true;
	});
}

// ── Lookup map: animation key -> atlas texture key (dir) ─────────────
const _animKeyToDir = new Map<string, string>();

export function getAnimAtlasKey(animKey: string): string {
	if (_animKeyToDir.size === 0) {
		for (const def of getAllAnimDefs()) {
			_animKeyToDir.set(def.key, def.dir);
		}
	}
	return _animKeyToDir.get(animKey) || animKey;
}
