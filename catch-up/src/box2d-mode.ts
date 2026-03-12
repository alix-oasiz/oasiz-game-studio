// Stone Ascent – Box2D Mode (Phaser + phaser-box2d v3)
// Same climbing mechanic as MatterJS mode: hammer overlaps rock → spring force.
// Physics world: Box2D v3 (Y-up). PPM = 30 pixels per meter.
// Coordinate conversions:
//   Screen→Box2D : (sx / PPM,  -sy / PPM)   [Y negated]
//   Box2D→Screen : (bx * PPM, -(by * PPM))  [Y negated]

import Phaser from 'phaser';
import {
  CreateWorld, WorldStep, SetWorldScale,
  CreateCircle, CreatePolygon, CreateBoxPolygon,
  b2Body_GetPosition, b2Body_GetLinearVelocity,
  b2Body_SetLinearVelocity, b2Body_ApplyForceToCenter,
  b2Body_SetTransform, b2MakeRot,
  STATIC, DYNAMIC,
  b2Vec2, b2DefaultWorldDef, b2DefaultBodyDef,
} from 'phaser-box2d';

// ─── Scale ───────────────────────────────────────────────────────────────────
const PPM = 30; // pixels per meter

// ─── Tweakable config ────────────────────────────────────────────────────────
const cfg = {
  maxRange:          120,    // max hammer offset (px) — Unity 2.0 WU @ ~60px/WU
  forceMult:         0.012,  // N per pixel — higher = snappier lever feel (GOIB is punchy)
  maxSpeed:          8,      // velocity cap (m/s) — slightly above Unity 6 to compensate for Box2D scale
  hammerLerp:        0.18,   // hammer lerp — slightly below 0.2 so it feels weighty, not instant
  hammerR:           18,     // hammer overlap radius (px) — wider for T-bar bottle opener
  gravity:           12.0,   // m/s²  — heavier than real; GOIB cauldron drops FAST
  playerFriction:    0.85,   // high friction — tomato grips surfaces, doesn't slide off
  playerRestitution: 0.0,    // no bounce — hooks feel solid
  playerDensity:     0.008,  // heavier body — feels like a full cauldron, not a balloon
  playerLinearDamp:  0.35,   // substantial damping — kills drift; player sticks where they land
  rockFriction:      0.95,
  rockRestitution:   0.0,
};

// ─── Fixed constants ─────────────────────────────────────────────────────────
const BODY_R  = 18;
const HEAD_R  = 12;
const HAND_R  = 5;
const GROUND_Y = 580;
const SPAWN_X  = 400;
const SPAWN_Y  = 460;  // raised so the player spawns above all ground-level rocks
const WORLD_W  = 800;
const MAX_VERTS = 7; // Box2D polygon vertex cap (conservative)

// ─── Deterministic pseudo-random ─────────────────────────────────────────────
function seeded(s: number): number {
  const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ─── Rock data ───────────────────────────────────────────────────────────────
interface RockData {
  cx: number;
  cy: number;
  verts: { x: number; y: number }[];
}

function generateRock(
  cx: number, cy: number, rx: number, ry: number, n: number, seed: number,
): RockData {
  const cap = Math.min(n, MAX_VERTS);
  const verts: { x: number; y: number }[] = [];
  for (let i = 0; i < cap; i++) {
    const a = (i / cap) * Math.PI * 2 - Math.PI / 2;
    const r = 0.55 + 0.45 * Math.abs(Math.sin(i * 2.7181 + seed));
    verts.push({ x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r });
  }
  return { cx, cy, verts };
}

// ─── Map layout ──────────────────────────────────────────────────────────────
// Inspired by Getting Over It's progression:
//
//   Section 0 : GROUND / TUTORIAL  — big forgiving platforms, learn controls
//   Section 1 : TRASH PILE         — messy dense cluster, teaches momentum
//   Section 2 : THE CHIMNEY        — vertical channel with walls, precise lever work
//   Section 3 : ORANGE HELL        — thin ledges, wide gaps, overhangs; one slip = big fall
//   Section 4 : DEVIL'S CHIMNEY    — near-vertical with tiny holds, brutal
//   Section 5 : SUMMIT             — final reward
//
// KEY DESIGN: sections overlap in X so a fall from section 3 drops you into
// section 1, and a fall from section 4 can drop you all the way to the ground.
// This is what makes GOIB devastating — progress is never safe.

// Section counts (used by rendering to pick kitchen item styles)
const SEC0_COUNT = 5;   // tutorial platforms
const SEC1_COUNT = 16;  // trash pile
const SEC2_COUNT = 10;  // chimney
const SEC3_COUNT = 12;  // orange hell
const SEC4_COUNT = 8;   // devil's chimney

function buildRockLayout(): RockData[] {
  const rocks: RockData[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 0 : GROUND / TUTORIAL  (rocks 0..5)
  // Big platforms, close together, gentle rise. Impossible to fail.
  // Teaches: move mouse to aim hammer → push into rock → body moves opposite.
  // ═══════════════════════════════════════════════════════════════════════════

  // Wide flat spawn platform
  rocks.push(generateRock(300, 562, 295, 26, 6, 1.1));

  // Tutorial stepping stones — big, close, gentle upward slope
  const tut = [
    { cx: 520, cy: 538, rx: 80, ry: 35, n: 6, s: 2.3 },   // easy step right
    { cx: 430, cy: 498, rx: 90, ry: 32, n: 7, s: 3.1 },   // step left & up
    { cx: 560, cy: 455, rx: 85, ry: 38, n: 6, s: 1.7 },   // step right & up
    { cx: 460, cy: 405, rx: 95, ry: 30, n: 7, s: 4.2 },   // left again
    { cx: 550, cy: 350, rx: 88, ry: 34, n: 6, s: 0.8 },   // right — top of tutorial
  ];
  for (const t of tut) rocks.push(generateRock(t.cx, t.cy, t.rx, t.ry, t.n, t.s));

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1 : TRASH PILE  (rocks 6..21)
  // Dense messy cluster that rises upward. Rocks overlap in X, creating a
  // chaotic pile that's forgiving (many surfaces to grab) but teaches
  // momentum and lever technique. Falling here only loses a few rocks.
  //
  // The pile is centred around X=480 so it sits ABOVE the tutorial area.
  // A fall from higher sections can land you back in this pile.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    let px = 480;
    let py = 330;  // starts just above tutorial top

    for (let i = 0; i < SEC1_COUNT; i++) {
      const s = i + 10;
      // Gentle upward trend with noise — pile feel
      const noise  = (seeded(s * 4.1 + 2.7) - 0.5) * 2 * 45;
      const stepDy = Math.max(-15, Math.min(55, 28 + noise));
      const cy     = py - stepDy;

      // X zigzags tightly — pile clusters together (±60px from centre)
      const xNoise = (seeded(s * 7.3 + 5.1) - 0.5) * 2 * 75;
      const cx     = 480 + xNoise;

      // Medium-large rocks, varied shapes
      const rx = 45 + seeded(s * 5.3 + 1.9) * 40;   // 45–85
      const ry = 22 + seeded(s * 7.7 + 3.5) * 22;   // 22–44
      const n  = 5 + Math.floor(seeded(s * 13.1 + 5.3) * 3); // 5–7

      rocks.push(generateRock(cx, cy, rx, ry, n, s * 1.73 + 0.9));
      py = cy;
    }
  }

  // ── Rest ledge 1 — wide safe platform after the pile ──────────────────────
  const rest1Y = rocks[rocks.length - 1].cy - 50;
  rocks.push(generateRock(490, rest1Y, 120, 22, 6, 38.5));
  const REST1_RI = rocks.length - 1;

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2 : THE CHIMNEY  (rocks after rest1)
  // Vertical channel — rocks on alternating sides form a narrow "chimney".
  // Player must lever back and forth between left wall and right wall.
  // Rocks get progressively smaller and further apart.
  //
  // Centred at X=490, walls at ±100px. Fall = back to the pile.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    let cy = rest1Y - 55;
    const chimneyX = 490;

    for (let i = 0; i < SEC2_COUNT; i++) {
      const s = i + 100;
      const side = (i % 2 === 0) ? -1 : 1;

      // Lateral position: alternating sides, getting wider as you go up
      const spread = 70 + i * 8;  // 70 → 150 px from centre
      const cx = chimneyX + side * (spread + (seeded(s * 3.1) - 0.5) * 20);

      // Rise per step: starts comfortable (50px), gets tighter
      const rise = 50 + i * 3 + (seeded(s * 4.7) - 0.5) * 16;
      cy -= Math.max(40, rise);

      // Rocks shrink as you go up: big ledges → small holds
      const rxBase = 65 - i * 3;                              // 65 → 35
      const rx = Math.max(30, rxBase + seeded(s * 5.1) * 15); // min 30px
      const ry = 15 + seeded(s * 3.9) * 12;                   // 15–27 (always thin-ish)
      const n  = 5 + Math.floor(seeded(s * 11.3) * 2);

      rocks.push(generateRock(cx, cy, rx, ry, n, s * 1.73 + 0.9));
    }
  }

  // ── Rest ledge 2 — deceptive safety after the chimney ─────────────────────
  const rest2Y = rocks[rocks.length - 1].cy - 55;
  rocks.push(generateRock(500, rest2Y, 100, 18, 6, 55.3));
  const REST2_RI = rocks.length - 1;

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3 : ORANGE HELL  (rocks after rest2)
  // Thin ledges with wide gaps and some overhangs. This is where most
  // players get stuck. Rocks are small, gaps are large, and the path
  // zigzags widely — requiring committed swings.
  //
  // CRITICAL: the X range overlaps sections 1 and 2 below, so a fall here
  // drops you ALL the way down through the chimney into the pile.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    let zpx = 500;
    let zpy = rest2Y - 50;
    let side = 1;

    for (let i = 0; i < SEC3_COUNT; i++) {
      const s = i + 300;

      // Wide lateral jumps — forces full-commit swings
      const lateral = 120 + i * 6 + (seeded(s * 3.7 + 10) - 0.5) * 2 * 35;
      // Rise gets steeper as you go
      const rise = 45 + i * 4 + (seeded(s * 4.3 + 20) - 0.5) * 2 * 20;

      const cx = zpx + side * Math.max(100, lateral);
      const cy = zpy - Math.max(35, rise);

      // THIN slabs — wide enough to hook, thin enough to slide off
      const rx = 40 + seeded(s * 5.1 + 30) * 28;  // 40–68
      const ry = 6 + seeded(s * 3.9 + 40) * 8;    // 6–14  ← very thin!
      const n  = 5 + Math.floor(seeded(s * 11.3 + 50) * 2);

      rocks.push(generateRock(cx, cy, rx, ry, n, s * 1.73 + 0.9));

      zpx   = cx;
      zpy   = cy;
      side *= -1;
    }
  }

  // ── Rest ledge 3 — the "false summit" ──────────────────────────────────────
  const rest3Y = rocks[rocks.length - 1].cy - 50;
  rocks.push(generateRock(480, rest3Y, 90, 16, 6, 77.1));
  const REST3_RI = rocks.length - 1;

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4 : DEVIL'S CHIMNEY  (rocks after rest3)
  // Near-vertical ascent with TINY holds. The path goes almost straight up
  // with minimal horizontal offset. Requires pixel-perfect lever control.
  // Rocks are small and round (hardest shape to grip).
  //
  // A fall here is catastrophic — straight down through orange hell,
  // through the chimney, into the pile. 5+ minutes of progress lost.
  // This is the GOIB "snake" / "ice" equivalent.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    let cy = rest3Y - 60;
    const centreX = 480;

    for (let i = 0; i < SEC4_COUNT; i++) {
      const s = i + 500;

      // Tight lateral oscillation — barely any horizontal movement
      const cx = centreX + (seeded(s * 3.1 + 7) - 0.5) * 2 * 55;

      // Steep rise — 60–90px per step
      const rise = 60 + i * 5 + (seeded(s * 4.7 + 13) - 0.5) * 20;
      cy -= Math.max(55, rise);

      // TINY round rocks — hardest to grip and balance on
      const rx = 22 + seeded(s * 5.1 + 30) * 18;  // 22–40
      const ry = 16 + seeded(s * 3.9 + 40) * 14;  // 16–30 (rounder = harder)
      const n  = 5 + Math.floor(seeded(s * 11.3 + 50) * 2);

      rocks.push(generateRock(cx, cy, rx, ry, n, s * 1.73 + 0.9));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5 : SUMMIT
  // Wide golden platter — the reward. Reaching this feels incredible.
  // ═══════════════════════════════════════════════════════════════════════════
  const summitY = rocks[rocks.length - 1].cy - 65;
  rocks.push(generateRock(480, summitY, 140, 22, 6, 99.9));

  return rocks;
}

const ROCKS = buildRockLayout();

// ─── Section teleport targets (screen-space) ────────────────────────────────
// Each target is slightly above the first rock of that section so the player
// drops onto it naturally.
interface TeleportTarget { label: string; x: number; y: number; }
const TELEPORT_TARGETS: TeleportTarget[] = [
  { label: 'Spawn',           x: SPAWN_X,     y: SPAWN_Y },
  { label: 'Trash Pile',      x: ROCKS[1 + SEC0_COUNT].cx,           y: ROCKS[1 + SEC0_COUNT].cy - 40 },
  { label: 'Rest 1',          x: ROCKS[1 + SEC0_COUNT + SEC1_COUNT].cx, y: ROCKS[1 + SEC0_COUNT + SEC1_COUNT].cy - 40 },
  { label: 'Chimney',         x: ROCKS[1 + SEC0_COUNT + SEC1_COUNT + 1].cx, y: ROCKS[1 + SEC0_COUNT + SEC1_COUNT + 1].cy - 40 },
  { label: 'Rest 2',          x: ROCKS[1 + SEC0_COUNT + SEC1_COUNT + 1 + SEC2_COUNT].cx, y: ROCKS[1 + SEC0_COUNT + SEC1_COUNT + 1 + SEC2_COUNT].cy - 40 },
  { label: 'Orange Hell',     x: ROCKS[1 + SEC0_COUNT + SEC1_COUNT + 1 + SEC2_COUNT + 1].cx, y: ROCKS[1 + SEC0_COUNT + SEC1_COUNT + 1 + SEC2_COUNT + 1].cy - 40 },
  { label: 'Rest 3',          x: ROCKS[1 + SEC0_COUNT + SEC1_COUNT + 1 + SEC2_COUNT + 1 + SEC3_COUNT].cx, y: ROCKS[1 + SEC0_COUNT + SEC1_COUNT + 1 + SEC2_COUNT + 1 + SEC3_COUNT].cy - 40 },
  { label: "Devil's Chimney", x: ROCKS[1 + SEC0_COUNT + SEC1_COUNT + 1 + SEC2_COUNT + 1 + SEC3_COUNT + 1].cx, y: ROCKS[1 + SEC0_COUNT + SEC1_COUNT + 1 + SEC2_COUNT + 1 + SEC3_COUNT + 1].cy - 40 },
  { label: 'Summit',          x: ROCKS[ROCKS.length - 1].cx, y: ROCKS[ROCKS.length - 1].cy - 40 },
];

// Callback set by the scene so the dev panel can teleport the player
let teleportPlayer: ((x: number, y: number) => void) | null = null;

// ─── Altitude callback ───────────────────────────────────────────────────────
let onAltitudeUpdate: ((m: number) => void) | null = null;
export function setAltitudeCallback(cb: (m: number) => void): void {
  onAltitudeUpdate = cb;
}

// ─── Geometry helpers (screen-space, for hammer overlap) ─────────────────────
function pointInPoly(px: number, py: number, verts: { x: number; y: number }[]): boolean {
  let inside = false;
  const n = verts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = verts[i].x, yi = verts[i].y;
    const xj = verts[j].x, yj = verts[j].y;
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function distToEdges(px: number, py: number, verts: { x: number; y: number }[]): number {
  let best = Infinity;
  const n = verts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = verts[j].x, ay = verts[j].y;
    const bx = verts[i].x, by = verts[i].y;
    const edx = bx - ax, edy = by - ay;
    const len2 = edx * edx + edy * edy;
    const t  = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * edx + (py - ay) * edy) / len2));
    const cpx = ax + t * edx, cpy = ay + t * edy;
    best = Math.min(best, Math.hypot(px - cpx, py - cpy));
  }
  return best;
}

// Used by binary search ONLY — stops hammer when it enters a rock polygon or ground
function isHammerInsideRock(hx: number, hy: number): boolean {
  if (hy >= GROUND_Y) return true;
  for (const rock of ROCKS) {
    if (pointInPoly(hx, hy, rock.verts)) return true;
  }
  return false;
}

// Used for FORCE APPLICATION — true when hammer is on or near a rock/ground surface
function isHammerNearRock(hx: number, hy: number): boolean {
  const hr = cfg.hammerR;
  if (hy >= GROUND_Y - hr) return true;
  for (const rock of ROCKS) {
    if (pointInPoly(hx, hy, rock.verts)) return true;
    if (distToEdges(hx, hy, rock.verts) < hr) return true;
  }
  return false;
}

// ─── Dev Panel ───────────────────────────────────────────────────────────────
let devPanelEl: HTMLElement | null = null;

interface SliderDef { key: keyof typeof cfg; label: string; min: number; max: number; step: number; }

const SLIDER_DEFS: SliderDef[] = [
  { key: 'maxRange',          label: 'Max Range',        min: 50,     max: 400,  step: 5 },
  { key: 'forceMult',         label: 'Force Mult',       min: 0.001,  max: 0.05, step: 0.001 },
  { key: 'maxSpeed',          label: 'Max Speed (m/s)',  min: 1,      max: 30,   step: 0.5 },
  { key: 'hammerLerp',        label: 'Hammer Lerp',      min: 0.01,   max: 1,    step: 0.01 },
  { key: 'hammerR',           label: 'Hammer Radius',    min: 2,      max: 40,   step: 1 },
  { key: 'gravity',           label: 'Gravity (m/s²)',   min: 1,      max: 25,   step: 0.5 },
  { key: 'playerFriction',    label: 'Player Friction',  min: 0,      max: 1,    step: 0.01 },
  { key: 'playerRestitution', label: 'Restitution',      min: 0,      max: 0.5,  step: 0.01 },
  { key: 'playerDensity',     label: 'Density',          min: 0.001,  max: 0.03, step: 0.001 },
  { key: 'playerLinearDamp',  label: 'Linear Damp',      min: 0,      max: 1,    step: 0.01 },
  { key: 'rockFriction',      label: 'Rock Friction',    min: 0,      max: 1,    step: 0.01 },
  { key: 'rockRestitution',   label: 'Rock Restitution', min: 0,      max: 0.5,  step: 0.01 },
];

function createDevPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'dev-panel-box2d';
  panel.innerHTML = `
    <style>
      #dev-panel-box2d {
        position: fixed; top: 10px; right: 10px; z-index: 9999;
        width: 290px; max-height: 90vh; overflow-y: auto;
        background: rgba(10,8,5,0.92); border: 1px solid rgba(110,169,200,0.35);
        border-radius: 8px; padding: 12px; font-family: 'Cinzel', monospace;
        color: #6ea9c8; font-size: 11px; backdrop-filter: blur(6px);
        pointer-events: auto; user-select: none;
      }
      #dev-panel-box2d.collapsed > .dp-body { display: none; }
      #dev-panel-box2d .dp-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; cursor: pointer; }
      #dev-panel-box2d .dp-title { font-size: 13px; font-weight: 700; letter-spacing: 0.1em; }
      #dev-panel-box2d .dp-badge { font-size: 9px; background: rgba(110,169,200,0.2); border: 1px solid rgba(110,169,200,0.4); border-radius: 3px; padding: 1px 5px; margin-left: 6px; }
      #dev-panel-box2d .dp-toggle { font-size: 16px; color: #4a6a7a; }
      #dev-panel-box2d .dp-row { display: flex; flex-direction: column; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid rgba(110,169,200,0.1); }
      #dev-panel-box2d .dp-row-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px; }
      #dev-panel-box2d .dp-label { color: #6090a8; font-size: 10px; }
      #dev-panel-box2d .dp-val { color: #6ea9c8; font-size: 10px; font-family: monospace; min-width: 60px; text-align: right; }
      #dev-panel-box2d input[type=range] { width: 100%; height: 14px; -webkit-appearance: none; appearance: none; background: rgba(110,169,200,0.12); border-radius: 7px; outline: none; cursor: pointer; }
      #dev-panel-box2d input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #6ea9c8; cursor: pointer; }
      #dev-panel-box2d input[type=range]::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; border: none; background: #6ea9c8; cursor: pointer; }
      #dev-panel-box2d .dp-btns { display: flex; gap: 6px; margin-top: 8px; }
      #dev-panel-box2d .dp-btn { flex: 1; padding: 6px; font-family: 'Cinzel', serif; font-size: 10px; letter-spacing: 0.1em; border: 1px solid rgba(110,169,200,0.3); border-radius: 4px; cursor: pointer; text-align: center; background: rgba(110,169,200,0.08); color: #6ea9c8; transition: background 0.15s; }
      #dev-panel-box2d .dp-btn:hover { background: rgba(110,169,200,0.2); }
      #dev-panel-box2d .dp-note { font-size: 9px; color: #4a6a7a; margin-top: 6px; text-align: center; }
    </style>
    <div class="dp-header" id="dp-header-b2d">
      <span class="dp-title">DEV TOOLS <span class="dp-badge">BOX2D v3</span></span>
      <span class="dp-toggle" id="dp-toggle-b2d">&#9654;</span>
    </div>
    <div class="dp-body" id="dp-body-b2d"></div>
  `;
  document.body.appendChild(panel);
  panel.classList.add('collapsed');

  const body = panel.querySelector('#dp-body-b2d')!;
  const valEls: Record<string, HTMLElement> = {};

  for (const def of SLIDER_DEFS) {
    const row = document.createElement('div');
    row.className = 'dp-row';
    const val = cfg[def.key];
    const decimals = def.step < 0.0001 ? 5 : def.step < 0.001 ? 4 : def.step < 0.01 ? 3 : def.step < 1 ? 2 : 0;
    row.innerHTML = `
      <div class="dp-row-top">
        <span class="dp-label">${def.label}</span>
        <span class="dp-val" data-key="${def.key}">${Number(val).toFixed(decimals)}</span>
      </div>
      <input type="range" min="${def.min}" max="${def.max}" step="${def.step}" value="${val}" data-key="${def.key}">
    `;
    body.appendChild(row);
    valEls[def.key] = row.querySelector('.dp-val')!;
    const slider = row.querySelector('input')!;
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      (cfg as any)[def.key] = v;
      valEls[def.key].textContent = v.toFixed(decimals);
    });
  }

  const btns = document.createElement('div');
  btns.className = 'dp-btns';
  btns.innerHTML = `<div class="dp-btn" id="dp-copy-b2d">COPY JSON</div><div class="dp-btn" id="dp-reset-b2d">RESET</div>`;
  body.appendChild(btns);

  const note = document.createElement('div');
  note.className = 'dp-note';
  note.textContent = 'Gravity & damping apply on next session';
  body.appendChild(note);

  // ── Teleport section ────────────────────────────────────────────────────
  const tpLabel = document.createElement('div');
  tpLabel.style.cssText = 'margin-top: 12px; padding-top: 8px; border-top: 1px solid rgba(110,169,200,0.2); font-size: 11px; font-weight: 700; letter-spacing: 0.1em; margin-bottom: 6px;';
  tpLabel.textContent = 'TELEPORT';
  body.appendChild(tpLabel);

  const tpGrid = document.createElement('div');
  tpGrid.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 4px;';
  for (const target of TELEPORT_TARGETS) {
    const btn = document.createElement('div');
    btn.className = 'dp-btn';
    btn.textContent = target.label;
    btn.style.fontSize = '9px';
    btn.addEventListener('click', () => {
      if (teleportPlayer) teleportPlayer(target.x, target.y);
    });
    tpGrid.appendChild(btn);
  }
  body.appendChild(tpGrid);

  btns.querySelector('#dp-copy-b2d')!.addEventListener('click', () => {
    navigator.clipboard.writeText(JSON.stringify(cfg, null, 2));
  });

  const defaults = { ...cfg };
  btns.querySelector('#dp-reset-b2d')!.addEventListener('click', () => {
    Object.assign(cfg, defaults);
    for (const def of SLIDER_DEFS) {
      const slider = body.querySelector(`input[data-key="${def.key}"]`) as HTMLInputElement;
      const v = cfg[def.key];
      slider.value = String(v);
      const decimals = def.step < 0.0001 ? 5 : def.step < 0.001 ? 4 : def.step < 0.01 ? 3 : def.step < 1 ? 2 : 0;
      valEls[def.key].textContent = Number(v).toFixed(decimals);
    }
  });

  panel.querySelector('#dp-header-b2d')!.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    const arrow = panel.querySelector('#dp-toggle-b2d')!;
    arrow.innerHTML = panel.classList.contains('collapsed') ? '&#9654;' : '&#9660;';
  });

  return panel;
}

function destroyDevPanel(): void {
  if (devPanelEl) { devPanelEl.remove(); devPanelEl = null; }
}

// ─── Kitchen item vector drawings ────────────────────────────────────────────
function drawKitchenItemGfx(
  gfx: Phaser.GameObjects.Graphics,
  cx: number, cy: number,
  w: number, h: number,
  kind: string,
): void {
  const rw = w / 2, rh = h / 2;
  const sz = Math.min(rw, rh);
  switch (kind) {
    case 'plate': {
      const r = sz * 0.88;
      gfx.fillStyle(0x000000, 0.08);
      gfx.fillEllipse(cx + 4, cy + 5, r * 2.2, r * 0.45);
      gfx.fillStyle(0xF8F8F4);
      gfx.fillCircle(cx, cy, r);
      gfx.lineStyle(3, 0x1D4ED8);
      gfx.strokeCircle(cx, cy, r);
      gfx.lineStyle(2.5, 0x2563EB);
      gfx.strokeCircle(cx, cy, r * 0.76);
      gfx.lineStyle(1.5, 0x93C5FD, 0.8);
      gfx.strokeCircle(cx, cy, r * 0.48);
      gfx.fillStyle(0xFFFFFF, 0.5);
      gfx.fillEllipse(cx - r * 0.28, cy - r * 0.3, r * 0.52, r * 0.24);
      break;
    }
    case 'platter': {
      const pW = rw * 0.9, pH = rh * 0.76;
      gfx.fillStyle(0x000000, 0.1);
      gfx.fillEllipse(cx + 4, cy + 6, pW * 2.2, pH * 0.45);
      gfx.fillStyle(0xD4AF37);
      gfx.fillEllipse(cx, cy, pW * 2, pH * 2);
      gfx.fillStyle(0xFAF0DC);
      gfx.fillEllipse(cx, cy, pW * 1.72, pH * 1.72);
      gfx.lineStyle(4, 0xC9A227);
      gfx.strokeEllipse(cx, cy, pW * 2, pH * 2);
      gfx.lineStyle(1.5, 0xD4AF37);
      gfx.strokeEllipse(cx, cy, pW * 1.72, pH * 1.72);
      gfx.lineStyle(1, 0xD4AF37, 0.45);
      gfx.strokeEllipse(cx, cy, pW * 0.75, pH * 0.75);
      gfx.fillStyle(0xFFEE88, 0.38);
      gfx.fillEllipse(cx - pW * 0.24, cy - pH * 0.28, pW * 0.48, pH * 0.28);
      break;
    }
    case 'bowl': {
      const bw = rw * 0.88, bh = rh * 0.82;
      gfx.fillStyle(0xFEF3C7);
      gfx.beginPath();
      gfx.moveTo(cx - bw, cy - bh * 0.15);
      gfx.lineTo(cx + bw, cy - bh * 0.15);
      gfx.lineTo(cx + bw * 0.52, cy + bh);
      gfx.lineTo(cx - bw * 0.52, cy + bh);
      gfx.closePath(); gfx.fillPath();
      gfx.lineStyle(2, 0xD97706);
      gfx.beginPath();
      gfx.moveTo(cx - bw, cy - bh * 0.15);
      gfx.lineTo(cx + bw, cy - bh * 0.15);
      gfx.lineTo(cx + bw * 0.52, cy + bh);
      gfx.lineTo(cx - bw * 0.52, cy + bh);
      gfx.closePath(); gfx.strokePath();
      gfx.fillStyle(0xFFF8E0);
      gfx.fillEllipse(cx, cy - bh * 0.15, bw * 2, bh * 0.46);
      gfx.lineStyle(2, 0xD97706);
      gfx.strokeEllipse(cx, cy - bh * 0.15, bw * 2, bh * 0.46);
      gfx.lineStyle(1.5, 0xD97706, 0.4);
      gfx.strokeEllipse(cx, cy - bh * 0.15, bw * 1.3, bh * 0.28);
      gfx.fillStyle(0xFFFFFF, 0.45);
      gfx.fillEllipse(cx - bw * 0.3, cy, bw * 0.45, bh * 0.2);
      break;
    }
    case 'pot': {
      const pw = rw * 0.74, ph = rh * 0.78;
      gfx.fillStyle(0x4B5563);
      gfx.fillRoundedRect(cx - pw - 15, cy - 8, 16, 16, 3);
      gfx.fillRoundedRect(cx + pw - 1,  cy - 8, 16, 16, 3);
      gfx.lineStyle(1.5, 0x6B7280);
      gfx.strokeRoundedRect(cx - pw - 15, cy - 8, 16, 16, 3);
      gfx.strokeRoundedRect(cx + pw - 1,  cy - 8, 16, 16, 3);
      gfx.fillStyle(0x374151);
      gfx.fillRoundedRect(cx - pw, cy - ph, pw * 2, ph * 1.85, 7);
      gfx.lineStyle(2, 0x6B7280, 0.38);
      gfx.lineBetween(cx - pw * 0.42, cy - ph * 0.82, cx - pw * 0.42, cy + ph * 0.75);
      gfx.lineStyle(1, 0x9CA3AF, 0.22);
      gfx.lineBetween(cx + pw * 0.12, cy - ph * 0.82, cx + pw * 0.12, cy + ph * 0.75);
      gfx.lineStyle(2, 0x6B7280);
      gfx.strokeRoundedRect(cx - pw, cy - ph, pw * 2, ph * 1.85, 7);
      gfx.fillStyle(0x4B5563);
      gfx.fillRoundedRect(cx - pw * 1.1, cy - ph - 13, pw * 2.2, 14, 4);
      gfx.lineStyle(1.5, 0x374151);
      gfx.strokeRoundedRect(cx - pw * 1.1, cy - ph - 13, pw * 2.2, 14, 4);
      gfx.fillStyle(0x9CA3AF);
      gfx.fillCircle(cx, cy - ph - 20, 6);
      gfx.lineStyle(1.5, 0x6B7280);
      gfx.strokeCircle(cx, cy - ph - 20, 6);
      break;
    }
    case 'board': {
      const bw = rw * 0.88, bh = rh * 0.88;
      gfx.fillStyle(0xA07040);
      gfx.fillRoundedRect(cx - bw, cy - bh, bw * 2, bh * 2, 9);
      gfx.lineStyle(1.2, 0x7A5030, 0.48);
      for (let gy2 = cy - bh * 0.78; gy2 <= cy + bh * 0.78; gy2 += 9)
        gfx.lineBetween(cx - bw * 0.86, gy2, cx + bw * 0.86, gy2 + 2);
      gfx.lineStyle(1, 0x5C3A1A, 0.28);
      gfx.lineBetween(cx - bw * 0.55, cy - bh * 0.78, cx - bw * 0.55, cy + bh * 0.78);
      gfx.lineBetween(cx + bw * 0.28, cy - bh * 0.78, cx + bw * 0.28, cy + bh * 0.78);
      gfx.lineStyle(2.5, 0x7A5230);
      gfx.strokeRoundedRect(cx - bw, cy - bh, bw * 2, bh * 2, 9);
      gfx.fillStyle(0x4A2C0A);
      gfx.fillCircle(cx + bw * 0.68, cy - bh * 0.68, 5.5);
      gfx.lineStyle(1.5, 0x7A5230);
      gfx.strokeCircle(cx + bw * 0.68, cy - bh * 0.68, 5.5);
      gfx.fillStyle(0xC09060, 0.32);
      gfx.fillEllipse(cx - bw * 0.2, cy - bh * 0.4, bw * 0.5, bh * 0.24);
      break;
    }
    case 'mug': {
      const mw = sz * 0.72, mh = sz * 0.88;
      gfx.lineStyle(4.5, 0xA02020);
      gfx.strokeEllipse(cx + mw + 13, cy + 2, 22, mh * 1.05);
      gfx.fillStyle(0xD95040);
      gfx.beginPath();
      gfx.moveTo(cx - mw,       cy - mh);
      gfx.lineTo(cx + mw,       cy - mh);
      gfx.lineTo(cx + mw * 0.9, cy + mh);
      gfx.lineTo(cx - mw * 0.9, cy + mh);
      gfx.closePath(); gfx.fillPath();
      gfx.lineStyle(2, 0x7F1D1D);
      gfx.beginPath();
      gfx.moveTo(cx - mw,       cy - mh);
      gfx.lineTo(cx + mw,       cy - mh);
      gfx.lineTo(cx + mw * 0.9, cy + mh);
      gfx.lineTo(cx - mw * 0.9, cy + mh);
      gfx.closePath(); gfx.strokePath();
      gfx.fillStyle(0xE06050);
      gfx.fillEllipse(cx, cy - mh, mw * 2, mh * 0.38);
      gfx.lineStyle(2, 0x7F1D1D);
      gfx.strokeEllipse(cx, cy - mh, mw * 2, mh * 0.38);
      gfx.fillStyle(0x3A1800, 0.75);
      gfx.fillEllipse(cx, cy - mh, mw * 1.45, mh * 0.25);
      gfx.lineStyle(2.5, 0xFF9080, 0.48);
      gfx.lineBetween(cx - mw * 0.65, cy - mh * 0.7, cx - mw * 0.65, cy + mh * 0.55);
      break;
    }
    case 'pan': {
      const pr = sz * 0.78;
      const hl = Math.max(rw, rh) * 0.88;
      gfx.fillStyle(0x2D3748);
      gfx.fillRoundedRect(cx + pr * 0.75, cy - 7.5, hl - pr * 0.75, 15, 5);
      gfx.lineStyle(1.5, 0x4B5563);
      gfx.strokeRoundedRect(cx + pr * 0.75, cy - 7.5, hl - pr * 0.75, 15, 5);
      gfx.fillStyle(0x718096);
      gfx.fillCircle(cx + pr * 0.75 + 9,  cy, 3.5);
      gfx.fillCircle(cx + pr * 0.75 + 21, cy, 3.5);
      gfx.lineStyle(1, 0x4A5568);
      gfx.strokeCircle(cx + pr * 0.75 + 9,  cy, 3.5);
      gfx.strokeCircle(cx + pr * 0.75 + 21, cy, 3.5);
      gfx.fillStyle(0x1F2937);
      gfx.fillCircle(cx, cy, pr);
      gfx.fillStyle(0x2D3748);
      gfx.fillCircle(cx, cy, pr * 0.8);
      gfx.lineStyle(1.5, 0x4B5563, 0.5);
      gfx.strokeCircle(cx, cy, pr * 0.55);
      gfx.fillStyle(0x718096, 0.4);
      gfx.fillEllipse(cx - pr * 0.25, cy - pr * 0.28, pr * 0.38, pr * 0.2);
      gfx.lineStyle(2, 0x6B7280);
      gfx.strokeCircle(cx, cy, pr);
      break;
    }
    case 'knife': {
      const kl = rw * 0.9, kh = rh * 0.68;
      const handleRatio = 0.32;
      const bladeEnd = cx - kl;
      const bolsterX = cx + kl * (1 - handleRatio * 2);
      gfx.fillStyle(0xD8D8E4);
      gfx.beginPath();
      gfx.moveTo(bladeEnd, cy);
      gfx.lineTo(bolsterX, cy - kh);
      gfx.lineTo(bolsterX, cy + kh * 0.6);
      gfx.closePath(); gfx.fillPath();
      gfx.lineStyle(1, 0xA0A0B0);
      gfx.beginPath();
      gfx.moveTo(bladeEnd, cy);
      gfx.lineTo(bolsterX, cy - kh);
      gfx.lineTo(bolsterX, cy + kh * 0.6);
      gfx.closePath(); gfx.strokePath();
      gfx.lineStyle(1.5, 0xFFFFFF, 0.65);
      gfx.lineBetween(bladeEnd + 12, cy - kh * 0.28, bolsterX - 8, cy - kh * 0.55);
      gfx.fillStyle(0x7A8090);
      gfx.fillRect(bolsterX - 2, cy - kh, 7, kh * 1.6);
      gfx.lineStyle(1, 0x5A6070);
      gfx.strokeRect(bolsterX - 2, cy - kh, 7, kh * 1.6);
      gfx.fillStyle(0x7C5C3A);
      gfx.fillRoundedRect(bolsterX + 5, cy - kh * 0.82, kl * handleRatio * 2 - 5, kh * 1.64, 4);
      gfx.lineStyle(1.5, 0x5A3E22);
      gfx.strokeRoundedRect(bolsterX + 5, cy - kh * 0.82, kl * handleRatio * 2 - 5, kh * 1.64, 4);
      gfx.fillStyle(0xAAAAAA);
      gfx.fillCircle(bolsterX + 14, cy, 3);
      gfx.fillCircle(bolsterX + 26, cy, 3);
      gfx.lineStyle(1, 0x888888);
      gfx.strokeCircle(bolsterX + 14, cy, 3);
      gfx.strokeCircle(bolsterX + 26, cy, 3);
      break;
    }
    case 'spoon': {
      const sl  = rw * 0.9;
      const sbr = rh * 0.72;
      const bowlCX   = cx + sl - sbr;
      const handleEnd = cx - sl;
      gfx.fillStyle(0xC8905A);
      gfx.fillRoundedRect(handleEnd, cy - rh * 0.18, sl * 1.22, rh * 0.36, 5);
      gfx.lineStyle(1.5, 0x8B6035);
      gfx.strokeRoundedRect(handleEnd, cy - rh * 0.18, sl * 1.22, rh * 0.36, 5);
      gfx.fillStyle(0xBD8A50);
      gfx.beginPath();
      gfx.moveTo(cx + sl * 0.2, cy - rh * 0.18);
      gfx.lineTo(cx + sl * 0.2, cy + rh * 0.18);
      gfx.lineTo(bowlCX - sbr * 0.5, cy + sbr * 0.62);
      gfx.lineTo(bowlCX - sbr * 0.5, cy - sbr * 0.62);
      gfx.closePath(); gfx.fillPath();
      gfx.fillStyle(0xC8905A);
      gfx.fillEllipse(bowlCX, cy, sbr * 2, sbr * 1.38);
      gfx.lineStyle(2, 0x8B6035);
      gfx.strokeEllipse(bowlCX, cy, sbr * 2, sbr * 1.38);
      gfx.fillStyle(0xE8B878, 0.6);
      gfx.fillEllipse(bowlCX - sbr * 0.22, cy - sbr * 0.18, sbr * 0.85, sbr * 0.5);
      break;
    }
  }
}

// ─── Hand helper (Hand.cs port) ──────────────────────────────────────────────
// Hand.cs: rotates sprite from Vector3.down → handDir; flips X per (rightHand ^ handDir.y>0)
// Canvas Y is inverted vs Unity, so Unity "handDir.y > 0" = canvas dy < 0 (hammer above shoulder).
function drawTomatoHand(
  gfx: Phaser.GameObjects.Graphics,
  sx: number, sy: number,   // shoulder origin
  hx: number, hy: number,   // hammer handle target
  isRight: boolean,
): void {
  const dx   = hx - sx;
  const dy   = hy - sy;
  const dist = Math.hypot(dx, dy) || 1;

  // Unit vectors along arm and perpendicular
  const ux = dx / dist, uy = dy / dist;
  const px = -uy,       py =  ux;          // perp: 90° left of arm

  // Arm length capped so it doesn't exceed shoulder→hammer distance
  const ARM_MAX = (BODY_R + 5) * 2.6;
  const armLen  = Math.min(dist, ARM_MAX);
  const ax = sx + ux * armLen;
  const ay = sy + uy * armLen;

  // Openness 0–1 (Hand.cs: spriteIndex = magnitude * 8, clamped)
  const open = Math.min(1, dist / 90);

  // flipX logic from Hand.cs — canvas dy<0 ↔ Unity handDir.y>0 (hammer is above shoulder)
  const flip      = isRight ? (dy >= 0) : (dy < 0);
  const flipSign  = flip ? -1 : 1;

  // ── Elbow joint — midpoint + perpendicular offset ────────────────────────
  const elbowBend = Math.max(8, armLen * 0.22);
  const perpSign  = isRight ? 1 : -1;
  const mx = (sx + ax) / 2;
  const my = (sy + ay) / 2;
  const elbowX = mx + uy * elbowBend * perpSign;
  const elbowY = my - ux * elbowBend * perpSign;

  // ── Upper arm + forearm ───────────────────────────────────────────────────
  gfx.lineStyle(3.5, 0xC53030);
  gfx.lineBetween(sx, sy, elbowX, elbowY);
  gfx.lineBetween(elbowX, elbowY, ax, ay);

  // ── Elbow knob ────────────────────────────────────────────────────────────
  gfx.fillStyle(0xD43030);
  gfx.fillCircle(elbowX, elbowY, 4.5);
  gfx.lineStyle(1.5, 0xA01818);
  gfx.strokeCircle(elbowX, elbowY, 4.5);

  // ── Palm ─────────────────────────────────────────────────────────────────
  gfx.fillStyle(0xE53E3E);
  gfx.fillCircle(ax, ay, 5.5);
  gfx.lineStyle(1.5, 0xB91C1C);
  gfx.strokeCircle(ax, ay, 5.5);

  // ── Three fingers (spread in perp direction, extend toward hammer) ────────
  const lateralStep = (3 + open * 4) * flipSign;
  const fwdBase     = 7 + open * 5;
  const lats = [-1, 0, 1];
  for (const lat of lats) {
    const lw  = lat * lateralStep;
    const fwd = fwdBase - Math.abs(lat) * 1.5;   // middle finger longest
    const fx2 = ax + ux * fwd + px * lw;
    const fy2 = ay + uy * fwd + py * lw;
    // Knuckle stub
    gfx.lineStyle(2.5, 0xC53030);
    gfx.lineBetween(ax + px * lw * 0.3, ay + py * lw * 0.3, fx2, fy2);
    gfx.fillStyle(0xE53E3E);
    gfx.fillCircle(fx2, fy2, 3.5);
    gfx.lineStyle(1.5, 0xB91C1C);
    gfx.strokeCircle(fx2, fy2, 3.5);
  }
}

// ─── Phaser Scene ────────────────────────────────────────────────────────────
class Box2DClimbScene extends Phaser.Scene {
  private worldId: any = null;
  private playerBodyId: any = null;
  private hammerPos = { x: SPAWN_X, y: SPAWN_Y - 60 };
  private mouseWorld  = { x: SPAWN_X, y: SPAWN_Y };
  private mouseScreen = { x: 0, y: 0 };
  private gfx!: Phaser.GameObjects.Graphics;
  private maxHeight = 0;

  // Head blinking
  private blinking    = false;
  private blinkTimer  = 0;
  private nextBlinkAt = 0;
  private blinkPhase  = 0;

  constructor() { super({ key: 'Box2DClimbScene' }); }

  create(): void {
    SetWorldScale(PPM);

    // Box2D world (Y-up, gravity downward = negative Y)
    const worldDef: any = b2DefaultWorldDef();
    worldDef.gravity = new b2Vec2(0, -cfg.gravity);
    const { worldId } = CreateWorld({ worldDef });
    this.worldId = worldId;

    // Ground floor — wide enough to span the whole slope (x: -300 → 3200)
    // Centre at x=1450, half-width=1750 → covers slope rocks up to x≈2200
    CreateBoxPolygon({
      worldId,
      type: STATIC,
      position: new b2Vec2(1450 / PPM, -(GROUND_Y + 25) / PPM),
      size: new b2Vec2(1750 / PPM, 25 / PPM),
      friction: 0.9,
    });

    // Left wall only — slope extends rightward so no right wall needed
    CreateBoxPolygon({
      worldId, type: STATIC,
      position: new b2Vec2(10 / PPM, -300 / PPM),
      size: new b2Vec2(20 / PPM, 600 / PPM), friction: 0.5,
    });

    // Rock physics bodies (static polygons, vertices in Box2D Y-up space)
    for (const rock of ROCKS) {
      const localVerts = rock.verts.map(
        v => new b2Vec2((v.x - rock.cx) / PPM, -(v.y - rock.cy) / PPM),
      );
      if (localVerts.length < 3) continue;
      CreatePolygon({
        worldId,
        type: STATIC,
        position: new b2Vec2(rock.cx / PPM, -rock.cy / PPM),
        vertices: localVerts,
        friction: cfg.rockFriction,
        restitution: cfg.rockRestitution,
      });
    }

    // Player (dynamic circle)
    const bodyDef: any = b2DefaultBodyDef();
    bodyDef.linearDamping  = cfg.playerLinearDamp;
    bodyDef.angularDamping = 3.0;  // resist spinning — cauldron feels planted, not a pinball
    bodyDef.fixedRotation  = false; // allow some rotation for natural tumble, damping controls it
    const { bodyId } = CreateCircle({
      worldId,
      type: DYNAMIC,
      bodyDef,
      position: new b2Vec2(SPAWN_X / PPM, -SPAWN_Y / PPM),
      radius: BODY_R / PPM,
      density: cfg.playerDensity,
      friction: cfg.playerFriction,
      restitution: cfg.playerRestitution,
    });
    this.playerBodyId = bodyId;

    this.hammerPos    = { x: SPAWN_X, y: SPAWN_Y - 60 };
    this.gfx          = this.add.graphics();
    this.nextBlinkAt  = Math.random() * 10000;

    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      this.mouseWorld.x  = ptr.worldX;
      this.mouseWorld.y  = ptr.worldY;
      this.mouseScreen.x = (ptr.x / this.scale.width)  * 2 - 1;
      this.mouseScreen.y = (ptr.y / this.scale.height) * 2 - 1;
    });
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      this.mouseWorld.x  = ptr.worldX;
      this.mouseWorld.y  = ptr.worldY;
      this.mouseScreen.x = (ptr.x / this.scale.width)  * 2 - 1;
      this.mouseScreen.y = (ptr.y / this.scale.height) * 2 - 1;
    });

    // Wire up teleport callback for dev panel
    teleportPlayer = (sx: number, sy: number) => {
      if (!this.playerBodyId) return;
      // Set Box2D body position (screen → Box2D coords: Y flip)
      b2Body_SetTransform(this.playerBodyId, new b2Vec2(sx / PPM, -sy / PPM), b2MakeRot(0));
      b2Body_SetLinearVelocity(this.playerBodyId, new b2Vec2(0, 0));
      // Reset hammer to just above the new position
      this.hammerPos.x = sx;
      this.hammerPos.y = sy - 40;
      // Snap camera immediately
      const cam = this.cameras.main;
      cam.scrollX = sx - cam.width / 2;
      cam.scrollY = sy - cam.height * 0.6;
    };
  }

  update(_time: number, delta: number): void {
    if (!this.worldId || !this.playerBodyId) return;

    // ── 1. Read player screen position (from last physics step) ─────────────
    const b2pos = b2Body_GetPosition(this.playerBodyId);
    const bx = b2pos.x * PPM;       // screen X
    const by = -(b2pos.y * PPM);    // screen Y (Y-flip)

    // ── 2. Mouse vector (clamped to maxRange, relative to player body) ──────
    // Matches Unity: mouseVec = ClampMagnitude(mouse - body.position, maxRange)
    const cam  = this.cameras.main;
    const rawDx   = this.mouseWorld.x - bx;
    const rawDy   = this.mouseWorld.y - by;
    const rawDist = Math.hypot(rawDx, rawDy);
    const clamped = Math.min(rawDist, cfg.maxRange);
    const mouseVec = rawDist > 0
      ? { x: (rawDx / rawDist) * clamped, y: (rawDy / rawDist) * clamped }
      : { x: 0, y: 0 };

    // ── 3. Force check with PREVIOUS frame's hammer pos (Unity order) ────────
    // Unity applies force BEFORE moving the hammer in FixedUpdate
    const hammerOnRock = isHammerNearRock(this.hammerPos.x, this.hammerPos.y);
    if (hammerOnRock) {
      // targetBodyPos = hammerHead.position - mouseVec  (Unity)
      // force = (targetBodyPos - body.position) * K
      const tbx = this.hammerPos.x - mouseVec.x;
      const tby = this.hammerPos.y - mouseVec.y;
      const dx  = tbx - bx;
      const dy  = tby - by;
      // Force in Box2D space: Y is flipped (screen down = Box2D negative Y)
      b2Body_ApplyForceToCenter(
        this.playerBodyId,
        new b2Vec2(dx * cfg.forceMult, -dy * cfg.forceMult),
        true,
      );
      // Cap velocity — Unity: velocity = ClampMagnitude(velocity, 6)
      const vel   = b2Body_GetLinearVelocity(this.playerBodyId);
      const speed = Math.hypot(vel.x, vel.y);
      if (speed > cfg.maxSpeed) {
        const s = cfg.maxSpeed / speed;
        b2Body_SetLinearVelocity(this.playerBodyId, new b2Vec2(vel.x * s, vel.y * s));
      }
    }

    // ── 4. Step physics ──────────────────────────────────────────────────────
    WorldStep({ worldId: this.worldId, deltaTime: delta / 1000, subStepCount: 4 });

    // ── 5. Read post-step position ───────────────────────────────────────────
    const b2pos2 = b2Body_GetPosition(this.playerBodyId);
    const rx = b2pos2.x * PPM;
    const ry = -(b2pos2.y * PPM);

    // ── 6. Move hammer AFTER physics step (Unity: MovePosition called last) ──
    // Anchor to post-step player position so hammer tracks updated body location
    const htx    = rx + mouseVec.x;
    const hty    = ry + mouseVec.y;
    const prevHx = this.hammerPos.x;
    const prevHy = this.hammerPos.y;
    let newHx = prevHx + (htx - prevHx) * cfg.hammerLerp;
    let newHy = prevHy + (hty - prevHy) * cfg.hammerLerp;

    // Binary search uses inside-only check so hammer stops AT the rock surface
    if (isHammerInsideRock(newHx, newHy)) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        const mx  = prevHx + (newHx - prevHx) * mid;
        const my  = prevHy + (newHy - prevHy) * mid;
        if (isHammerInsideRock(mx, my)) hi = mid; else lo = mid;
      }
      newHx = prevHx + (newHx - prevHx) * lo;
      newHy = prevHy + (newHy - prevHy) * lo;
    }
    this.hammerPos.x = newHx;
    this.hammerPos.y = newHy;

    // ── 7. Camera ────────────────────────────────────────────────────────────
    cam.scrollX += (rx - cam.width  / 2 - cam.scrollX) * 0.12;
    cam.scrollY += (ry - cam.height * 0.6 - cam.scrollY) * 0.12;

    // ── 8. Altitude ──────────────────────────────────────────────────────────
    const alt = Math.max(0, Math.round((SPAWN_Y - ry) / 9));
    if (alt > this.maxHeight) this.maxHeight = alt;
    if (onAltitudeUpdate) onAltitudeUpdate(this.maxHeight);

    // ── 9. Blink ─────────────────────────────────────────────────────────────
    this.updateBlink(delta);

    // ── 10. Render ───────────────────────────────────────────────────────────
    this.renderScene(rx, ry, hammerOnRock);
  }

  private updateBlink(delta: number): void {
    this.blinkTimer += delta;
    if (!this.blinking) {
      if (this.blinkTimer >= this.nextBlinkAt) {
        this.blinking = true; this.blinkPhase = 0; this.blinkTimer = 0;
      }
    } else {
      if (this.blinkTimer >= 200) {
        this.blinkTimer = 0; this.blinkPhase++;
        if (this.blinkPhase >= 4) {
          this.blinking = false;
          this.nextBlinkAt = Math.random() * 10000;
          this.blinkTimer  = 0;
        }
      }
    }
  }

  private get isEyesClosed(): boolean {
    return this.blinking && (this.blinkPhase === 0 || this.blinkPhase === 2);
  }

  private renderScene(bx: number, by: number, hammerOnRock: boolean): void {
    const gfx = this.gfx;
    gfx.clear();

    const hx  = this.hammerPos.x;
    const hy  = this.hammerPos.y;
    const cam = this.cameras.main;
    const cL  = cam.scrollX - 20;
    const cT  = cam.scrollY - 20;
    const cW  = cam.width  + 40;
    const cH  = cam.height + 40;

    // ── 1. Kitchen wall — cream tiles ────────────────────────────────────────
    gfx.fillStyle(0xFFFBF0);
    gfx.fillRect(cL, cT, cW, cH);

    // Tile grid lines
    const TILE = 64;
    const tx0  = Math.floor(cam.scrollX / TILE) * TILE;
    const ty0  = Math.floor(cam.scrollY / TILE) * TILE;
    gfx.lineStyle(1, 0xE2D8C8, 0.9);
    for (let tx = tx0; tx < cam.scrollX + cam.width + TILE; tx += TILE)
      gfx.lineBetween(tx, cT, tx, cT + cH);
    for (let ty = ty0; ty < cam.scrollY + cam.height + TILE; ty += TILE)
      gfx.lineBetween(cL, ty, cL + cW, ty);

    // ── 2. Wooden counter surface (ground) ───────────────────────────────────
    gfx.fillStyle(0x7C4A1E);
    gfx.fillRect(cL, GROUND_Y, cW, 260);
    // Planks / grain streaks
    gfx.lineStyle(1, 0x5E3410, 0.55);
    for (let g = 0; g < 260; g += 20)
      gfx.lineBetween(cL, GROUND_Y + g, cL + cW, GROUND_Y + g + 3);
    // Countertop lip
    gfx.fillStyle(0x9A6132);
    gfx.fillRect(cL, GROUND_Y - 7, cW, 10);
    gfx.lineStyle(2, 0x5C3011);
    gfx.lineBetween(cL, GROUND_Y - 7, cL + cW, GROUND_Y - 7);
    gfx.lineBetween(cL, GROUND_Y + 3,  cL + cW, GROUND_Y + 3);

    // ── 3. Kitchen items (rocks) ──────────────────────────────────────────────
    // Section boundaries (by rock index):
    //   0           = spawn platform (board)
    //   1..5        = tutorial (SEC0)
    //   6..21       = trash pile (SEC1)
    //   22          = rest ledge 1
    //   23..32      = chimney (SEC2)
    //   33          = rest ledge 2
    //   34..45      = orange hell (SEC3)
    //   46          = rest ledge 3 (false summit)
    //   47..54      = devil's chimney (SEC4)
    //   55          = summit (platter)
    const SEC0_END  = 1 + SEC0_COUNT;                          // 6
    const SEC1_END  = SEC0_END + SEC1_COUNT;                   // 22
    const REST1     = SEC1_END;                                // 22
    const SEC2_END  = REST1 + 1 + SEC2_COUNT;                  // 33
    const REST2     = SEC2_END;                                // 33
    const SEC3_END  = REST2 + 1 + SEC3_COUNT;                  // 46
    const REST3     = SEC3_END;                                // 46
    const SEC4_END  = REST3 + 1 + SEC4_COUNT;                  // 55
    const FINAL_RI  = ROCKS.length - 1;

    const cullL = cam.scrollX - 150, cullR = cam.scrollX + cam.width  + 150;
    const cullT = cam.scrollY - 150, cullB = cam.scrollY + cam.height + 150;

    for (let ri = 0; ri < ROCKS.length; ri++) {
      const rock = ROCKS[ri];
      const v    = rock.verts;
      if (v.length < 3) continue;
      if (rock.cx < cullL || rock.cx > cullR || rock.cy < cullT || rock.cy > cullB) continue;

      // Bounding values used for decorations
      let vMinX = Infinity, vMaxX = -Infinity, vMinY = Infinity, vMaxY = -Infinity;
      for (const p of v) {
        if (p.x < vMinX) vMinX = p.x;
        if (p.x > vMaxX) vMaxX = p.x;
        if (p.y < vMinY) vMinY = p.y;
        if (p.y > vMaxY) vMaxY = p.y;
      }

      // ── Assign kitchen item type per section ──────────────────────────────
      // Tutorial & pile = heavy kitchen items (plates, pots, bowls, pans, boards)
      // Chimney         = boards and mugs (vertical feel)
      // Orange hell     = knives and spoons (thin, dangerous)
      // Devil's chimney = mugs and bowls (small, round, precarious)
      // Rest ledges     = plates (safe, flat)
      // Summit          = golden platter (reward)
      type KItem = 'board'|'plate'|'pot'|'bowl'|'mug'|'pan'|'knife'|'spoon'|'platter';
      let kind: KItem = 'plate';
      if (ri === 0) {
        kind = 'board';                            // spawn platform
      } else if (ri === FINAL_RI) {
        kind = 'platter';                          // summit reward
      } else if (ri === REST1 || ri === REST2 || ri === REST3) {
        kind = 'plate';                            // rest ledges — safe flat plates
      } else if (ri < SEC0_END) {
        // Tutorial: big friendly items
        const items: KItem[] = ['plate', 'pot', 'bowl', 'board', 'pan'];
        kind = items[(ri - 1) % items.length];
      } else if (ri < SEC1_END) {
        // Trash pile: all item types, messy variety
        switch ((ri - SEC0_END) % 6) {
          case 0: kind = 'plate'; break;
          case 1: kind = 'pot';   break;
          case 2: kind = 'bowl';  break;
          case 3: kind = 'board'; break;
          case 4: kind = 'mug';   break;
          case 5: kind = 'pan';   break;
        }
      } else if (ri < SEC2_END) {
        // Chimney: boards (flat ledges on walls) and mugs
        kind = (ri % 2 === 0) ? 'board' : 'mug';
      } else if (ri < SEC3_END) {
        // Orange hell: knives and spoons (thin, scary)
        kind = (ri % 2 === 0) ? 'knife' : 'spoon';
      } else if (ri < SEC4_END) {
        // Devil's chimney: mugs and bowls (small, round)
        kind = (ri % 2 === 0) ? 'mug' : 'bowl';
      }

      const cx = rock.cx, cy = rock.cy;
      const w  = vMaxX - vMinX;
      const h  = vMaxY - vMinY;
      drawKitchenItemGfx(gfx, cx, cy, w, h, kind);
    }

    // ── 4. Bottle opener (T-shape) + Hands ─────────────────────────────────
    // Shaft is drawn first; hands drawn on top appear to grip it.
    // The tomato body (rendered next) covers the hidden inner portion.
    const TR    = BODY_R + 5;  // tomato visual radius
    const tAng  = Math.atan2(hy - by, hx - bx);
    const tDist = Math.hypot(hx - bx, hy - by) || 1;

    // Perpendicular direction for the T-bar
    const perpX = -Math.sin(tAng);
    const perpY =  Math.cos(tAng);

    // Handle (shaft) — metallic silver
    gfx.lineStyle(4, 0x9CA3AF);
    gfx.lineBetween(bx, by, hx, hy);
    // Highlight line on handle
    gfx.lineStyle(1.5, 0xD1D5DB, 0.5);
    gfx.lineBetween(bx + perpX * 1.2, by + perpY * 1.2, hx + perpX * 1.2, hy + perpY * 1.2);

    // T-bar at hammer head — perpendicular to the shaft
    const barHalf = 14;
    const barLx = hx + perpX * barHalf;
    const barLy = hy + perpY * barHalf;
    const barRx = hx - perpX * barHalf;
    const barRy = hy - perpY * barHalf;

    // T-bar thick line
    gfx.lineStyle(6, hammerOnRock ? 0xEAB308 : 0x6B7280);
    gfx.lineBetween(barLx, barLy, barRx, barRy);
    // T-bar highlight
    gfx.lineStyle(2, hammerOnRock ? 0xFDE68A : 0x9CA3AF, 0.6);
    gfx.lineBetween(barLx, barLy, barRx, barRy);

    // Rounded caps at T-bar ends
    gfx.fillStyle(hammerOnRock ? 0xEAB308 : 0x6B7280);
    gfx.fillCircle(barLx, barLy, 3.5);
    gfx.fillCircle(barRx, barRy, 3.5);

    // Hook/lip under the T-bar (the opener part) — small prongs
    const hookFwd = 6;
    const hookTipX = hx + Math.cos(tAng) * hookFwd;
    const hookTipY = hy + Math.sin(tAng) * hookFwd;
    gfx.lineStyle(3, hammerOnRock ? 0xD97706 : 0x4B5563);
    gfx.lineBetween(barLx, barLy, hookTipX + perpX * 4, hookTipY + perpY * 4);
    gfx.lineBetween(barRx, barRy, hookTipX - perpX * 4, hookTipY - perpY * 4);

    // Contact glow
    if (hammerOnRock) {
      gfx.fillStyle(0xFEF08A, 0.3);
      gfx.fillCircle(hx, hy, 18);
      gfx.lineStyle(1, 0xEAB308, 0.45);
      gfx.strokeCircle(hx, hy, 22);
    }

    // Hands grip the shaft at two points — NOT the tip
    const sOff   = TR * 0.65;
    const g1Dist = Math.min(TR + 5, tDist * 0.3);     // left — just past tomato edge
    const g2Dist = Math.min(TR * 2.8, tDist * 0.72);  // right — further out
    const lgX = bx + Math.cos(tAng) * g1Dist;
    const lgY = by + Math.sin(tAng) * g1Dist;
    const rgX = bx + Math.cos(tAng) * g2Dist;
    const rgY = by + Math.sin(tAng) * g2Dist;
    drawTomatoHand(gfx, bx - sOff, by + 3, lgX, lgY, false);  // left grips near base
    drawTomatoHand(gfx, bx + sOff, by + 3, rgX, rgY, true);   // right grips further out

    // ── 5. Tomato player ──────────────────────────────────────────────────────
    // Drop shadow
    gfx.fillStyle(0x000000, 0.1);
    gfx.fillEllipse(bx + 4, by + TR + 1, TR * 2.4, 10);

    // Main body — red tomato
    gfx.fillStyle(0xE53E3E);
    gfx.fillCircle(bx, by, TR);

    // Darker bottom half shading
    gfx.fillStyle(0xB91C1C, 0.28);
    gfx.fillEllipse(bx, by + TR * 0.3, TR * 2, TR * 1.4);

    // Subtle vertical ribs (tomato lobes)
    gfx.lineStyle(1.5, 0xC53030, 0.35);
    for (let rib = -1; rib <= 1; rib++) {
      const rx2 = bx + rib * (TR * 0.44);
      gfx.lineBetween(rx2, by - TR + 5, rx2, by + TR - 5);
    }

    // Specular highlight (top-left gloss)
    gfx.fillStyle(0xFF8080, 0.5);
    gfx.fillCircle(bx - TR * 0.32, by - TR * 0.32, TR * 0.35);
    gfx.fillStyle(0xFFFFFF, 0.25);
    gfx.fillCircle(bx - TR * 0.36, by - TR * 0.36, TR * 0.18);

    // Outline
    gfx.lineStyle(2, 0xB91C1C);
    gfx.strokeCircle(bx, by, TR);

    // Green calyx / stem leaves at the top
    const leafCx = bx, leafCy = by - TR + 2;
    gfx.fillStyle(0x16A34A);
    for (let li = 0; li < 5; li++) {
      const la   = (li / 5) * Math.PI * 2 - Math.PI / 2;
      const lx1  = leafCx + Math.cos(la - 0.35) * 4;
      const ly1  = leafCy + Math.sin(la - 0.35) * 4;
      const lx2  = leafCx + Math.cos(la + 0.35) * 4;
      const ly2  = leafCy + Math.sin(la + 0.35) * 4;
      const ltx  = leafCx + Math.cos(la) * 11;
      const lty  = leafCy + Math.sin(la) * 8;
      gfx.fillTriangle(lx1, ly1, lx2, ly2, ltx, lty);
    }
    // Stalk
    gfx.fillStyle(0x15803D);
    gfx.fillRect(leafCx - 1.5, leafCy - 9, 3, 9);

    // Face (on the tomato body)
    const facing  = this.mouseScreen.x >= 0 ? 1 : -1;
    const eyeOffX = 6 * facing;
    const eyeY    = by - 4;

    if (this.isEyesClosed) {
      gfx.lineStyle(2, 0x7F1D1D);
      gfx.lineBetween(bx + eyeOffX - 5, eyeY, bx + eyeOffX + 5, eyeY);
      gfx.lineBetween(bx - eyeOffX - 3, eyeY, bx - eyeOffX + 3, eyeY);
    } else {
      gfx.fillStyle(0xFFFFFF);
      gfx.fillCircle(bx + eyeOffX, eyeY,     3.5);
      gfx.fillCircle(bx - eyeOffX * 0.5, eyeY, 3);
      gfx.fillStyle(0x1A0000);
      gfx.fillCircle(bx + eyeOffX + facing * 0.8, eyeY,     1.8);
      gfx.fillCircle(bx - eyeOffX * 0.5 + facing * 0.8, eyeY, 1.5);
    }

    // Mouth — slight smile
    gfx.lineStyle(2, 0x7F1D1D);
    gfx.lineBetween(bx - 5, by + 6, bx - 1, by + 8);
    gfx.lineBetween(bx - 1, by + 8, bx + 5, by + 6);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────
export function launchBox2DGame(container: HTMLElement): Phaser.Game {
  devPanelEl = createDevPanel();

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: container,
    width: window.innerWidth,
    height: window.innerHeight,
    transparent: true,
    scene: [Box2DClimbScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: {
      mouse: { preventDefaultWheel: true },
    },
  };

  return new Phaser.Game(config);
}

export function destroyBox2DGame(game: Phaser.Game): void {
  onAltitudeUpdate = null;
  teleportPlayer   = null;
  destroyDevPanel();
  game.destroy(true);
}
