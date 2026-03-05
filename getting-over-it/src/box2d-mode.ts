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
  STATIC, DYNAMIC,
  b2Vec2, b2DefaultWorldDef, b2DefaultBodyDef,
} from 'phaser-box2d';

// ─── Scale ───────────────────────────────────────────────────────────────────
const PPM = 30; // pixels per meter

// ─── Tweakable config ────────────────────────────────────────────────────────
const cfg = {
  maxRange:          120,    // max hammer offset (px) — Unity 2.0 WU @ ~60px/WU
  forceMult:         0.0045, // N per pixel — Unity K=80 N/WU * mass / PPM_unity
  maxSpeed:          6,      // velocity cap (m/s) — Unity ClampMagnitude(vel, 6)
  hammerLerp:        0.2,    // hammer lerp factor
  hammerR:           14,     // hammer overlap radius (px)
  gravity:           9.0,    // m/s²  — real-weight feel (real = 9.8)
  playerFriction:    0.6,
  playerRestitution: 0.0,    // no bounce — hooks feel solid
  playerDensity:     0.003,  // slightly heavier body
  playerLinearDamp:  0.08,   // low: momentum carries naturally, gravity pulls firmly
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

// ─── Procedural messy-pile map ────────────────────────────────────────────────
// Each rock is placed relative to the PREVIOUS rock (incremental), not a global
// formula.  Y advances by (TREND_UP + large noise), then clamped so no single
// step is ever unclimbable.  X advances by a variable amount to create both
// tight "pile" clusters and occasional gaps.
//
// Spawn safety: slope starts at x = 530, well to the right of SPAWN_X = 400,
// so no rock can ever overlap the spawn position.
const PILE_START_X    = 530;  // first slope rock — right of spawn (x=400) so no overlap
const PILE_START_Y    = 552;  // near ground level
const PILE_COUNT      = 22;   // number of rocks on the pile
const PILE_TREND_UP   = 32;   // average upward step per rock (px)  — gentle overall slope
const PILE_NOISE_AMP  = 58;   // ±px of random deviation   — large = messy-pile feel
const PILE_MAX_UP     = 66;   // clamp: maximum single step upward   (keeps it climbable)
const PILE_MAX_DOWN   = 20;   // clamp: maximum single step downward (pile can dip a bit)
const PILE_STEP_BASE  = 88;   // nominal horizontal distance between rock centres
const PILE_STEP_NOISE = 36;   // ±px horizontal noise (clusters some rocks, gaps others)

function buildRockLayout(): RockData[] {
  const rocks: RockData[] = [];

  // ── Wide flat base — player spawns at (400, 460) and falls onto this ──────
  rocks.push(generateRock(300, 562, 295, 24, 6, 1.1));

  // ── Incremental messy-pile loop ───────────────────────────────────────────
  let px = PILE_START_X;
  let py = PILE_START_Y;

  for (let i = 0; i < PILE_COUNT; i++) {
    // 1. Raw vertical step = upward trend + large noise
    const noise  = (seeded(i * 4.1 + 2.7) - 0.5) * 2 * PILE_NOISE_AMP;
    const rawDy  = PILE_TREND_UP + noise;

    // 2. Clamp so the step is never a cliff (too high) or a slide (too low).
    //    This is what makes every step climbable while still feeling chaotic.
    const stepDy = Math.max(-PILE_MAX_DOWN, Math.min(PILE_MAX_UP, rawDy));
    const cy     = py - stepDy;   // subtract because screen Y goes downward

    // 3. Variable X step — tighter = cluster/pile, wider = exposed gap
    const dxNoise = (seeded(i * 8.3 + 4.1) - 0.5) * 2 * PILE_STEP_NOISE;
    const dx      = Math.max(62, Math.round(PILE_STEP_BASE + dxNoise));

    // 4. Rock shape variety: wide+flat OR rounder, with different vertex counts
    const rx = 50 + seeded(i * 5.3 + 1.9) * 42;  // 50 – 92 px  (radius)
    const ry = 20 + seeded(i * 7.7 + 3.5) * 28;  // 20 – 48 px
    const n  = 6  + Math.floor(seeded(i * 13.1 + 5.3) * 2);

    rocks.push(generateRock(px, cy, rx, ry, n, i * 1.73 + 0.9));

    px += dx;
    py  = cy;  // next rock departs from this one's Y, not from a global formula
  }

  // ── Section 1 summit — rest point before the hard part ───────────────────
  const sumCx = px + 65;
  const sumCy = py - 42;
  rocks.push(generateRock(sumCx, sumCy, 108, 22, 6, 38.5));

  // ─────────────────────────────────────────────────────────────────────────
  // Section 2 : Zigzag path — flat slabs alternating LEFT ↔ RIGHT
  //
  // Rules:
  //   • X jumps by PATH_LATERAL (±noise) to one side, then flips.
  //   • Y rises by PATH_RISE (±noise) per step — purely upward, no dips.
  //   • Rocks are thin slabs (large rx, tiny ry) so balance is harder.
  //   • Lateral offset (150-200 px) forces the player to swing and commit;
  //     it's within reach of the 120 px hammer + 14 px proximity zone
  //     when the player leans toward the target rock.
  //   • Seeds are offset by 200 to keep shapes independent of Section 1.
  // ─────────────────────────────────────────────────────────────────────────
  const PATH_COUNT         = 14;
  const PATH_LATERAL_BASE  = 158;  // base lateral jump left or right (px)
  const PATH_LATERAL_NOISE = 40;   // ±px variation on lateral jump
  const PATH_RISE_BASE     = 58;   // base upward step per slab (px)
  const PATH_RISE_NOISE    = 28;   // ±px variation on upward step

  let zpx  = sumCx;
  let zpy  = sumCy;
  let side = 1;  // +1 = right, -1 = left; flips every rock

  for (let i = 0; i < PATH_COUNT; i++) {
    const s = i + 200;  // seed offset — independent shapes from pile section

    // Lateral: always jumps to the current side, then flips
    const lateral = PATH_LATERAL_BASE + (seeded(s * 3.7 + 10) - 0.5) * 2 * PATH_LATERAL_NOISE;
    // Rise: always upward (no clamp downward — path must never dip back)
    const rise    = PATH_RISE_BASE    + (seeded(s * 4.3 + 20) - 0.5) * 2 * PATH_RISE_NOISE;

    const cx = zpx + side * lateral;
    const cy = zpy - Math.max(30, rise);  // guarantee at least 30 px upward

    // Thin flat slabs — wide enough to hook onto, thin enough to fall off of
    const rx = 52 + seeded(s * 5.1 + 30) * 32;  // 52 – 84 px
    const ry =  8 + seeded(s * 3.9 + 40) * 10;  //  8 – 18 px  ← thin!
    const n  =  5 + Math.floor(seeded(s * 11.3 + 50) * 2);  // 5 or 6 verts

    rocks.push(generateRock(cx, cy, rx, ry, n, s * 1.73 + 0.9));

    zpx   = cx;
    zpy   = cy;
    side *= -1;  // flip to opposite side every step
  }

  // ── Final summit of the zigzag path — the true top ────────────────────────
  rocks.push(generateRock(zpx, zpy - 55, 130, 20, 6, 99.9));

  return rocks;
}

const ROCKS = buildRockLayout();

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
  { key: 'forceMult',         label: 'Force Mult',       min: 0.0001, max: 0.02, step: 0.0001 },
  { key: 'maxSpeed',          label: 'Max Speed (m/s)',  min: 1,      max: 30,   step: 0.5 },
  { key: 'hammerLerp',        label: 'Hammer Lerp',      min: 0.01,   max: 1,    step: 0.01 },
  { key: 'hammerR',           label: 'Hammer Radius',    min: 2,      max: 40,   step: 1 },
  { key: 'gravity',           label: 'Gravity (m/s²)',   min: 1,      max: 20,   step: 0.5 },
  { key: 'playerFriction',    label: 'Player Friction',  min: 0,      max: 1,    step: 0.01 },
  { key: 'playerRestitution', label: 'Restitution',      min: 0,      max: 0.5,  step: 0.01 },
  { key: 'playerDensity',     label: 'Density',          min: 0.001,  max: 0.02, step: 0.001 },
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
      <span class="dp-toggle" id="dp-toggle-b2d">&#9660;</span>
    </div>
    <div class="dp-body" id="dp-body-b2d"></div>
  `;
  document.body.appendChild(panel);

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
    bodyDef.linearDamping = cfg.playerLinearDamp;
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
    WorldStep({ worldId: this.worldId, deltaTime: delta / 1000, subStepCount: 1 });

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
    cam.scrollX += (rx - cam.width  / 2 - cam.scrollX) * 0.08;
    cam.scrollY += (ry - cam.height * 0.6 - cam.scrollY) * 0.08;

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
    // Index map:  0=base, 1..22=pile, 23=pile summit, 24..37=path slabs, 38=final
    const PILE_SUMMIT_RI = PILE_COUNT + 1;   // 23
    const PATH_START_RI  = PILE_COUNT + 2;   // 24
    const FINAL_RI       = ROCKS.length - 1; // 38

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

      // ── Assign kitchen item type ──────────────────────────────────────────
      type KItem = 'board'|'plate'|'pot'|'bowl'|'mug'|'pan'|'knife'|'spoon'|'platter';
      let kind: KItem = 'plate';
      if (ri === 0) {
        kind = 'board';
      } else if (ri >= PATH_START_RI && ri < FINAL_RI) {
        kind = ri % 2 === 0 ? 'knife' : 'spoon';
      } else if (ri === FINAL_RI) {
        kind = 'platter';
      } else if (ri === PILE_SUMMIT_RI) {
        kind = 'plate';
      } else {
        switch ((ri - 1) % 6) {
          case 0: kind = 'plate'; break;
          case 1: kind = 'pot';   break;
          case 2: kind = 'bowl';  break;
          case 3: kind = 'board'; break;
          case 4: kind = 'mug';   break;
          case 5: kind = 'pan';   break;
        }
      }

      const cx = rock.cx, cy = rock.cy;
      const w  = vMaxX - vMinX;
      const h  = vMaxY - vMinY;
      drawKitchenItemGfx(gfx, cx, cy, w, h, kind);
    }

    // ── 4. Toothpick + Hands (held naturally) ────────────────────────────────
    // Stick is drawn first; hands drawn on top appear to grip the shaft.
    // The tomato body (rendered next) covers the hidden inner portion of the stick.
    const TR    = BODY_R + 5;  // tomato visual radius
    const tAng  = Math.atan2(hy - by, hx - bx);
    const tDist = Math.hypot(hx - bx, hy - by) || 1;

    // Draw stick from tomato centre — tomato circle painted later hides the base
    gfx.lineStyle(3, 0xD4A574);
    gfx.lineBetween(bx, by, hx, hy);
    gfx.lineStyle(1, 0xB08040, 0.6);
    gfx.lineBetween(bx + 1, by + 1, hx + 1, hy + 1);
    // Pointed tip
    const tipX = hx + Math.cos(tAng) * 7;
    const tipY = hy + Math.sin(tAng) * 7;
    gfx.fillStyle(0xA06828);
    gfx.fillTriangle(
      hx + Math.cos(tAng - 1.3) * 3, hy + Math.sin(tAng - 1.3) * 3,
      hx + Math.cos(tAng + 1.3) * 3, hy + Math.sin(tAng + 1.3) * 3,
      tipX, tipY,
    );
    // Glow when hooked into a kitchen item
    if (hammerOnRock) {
      gfx.fillStyle(0xFEF08A, 0.35);
      gfx.fillCircle(hx, hy, 16);
      gfx.lineStyle(1, 0xEAB308, 0.55);
      gfx.strokeCircle(hx, hy, 20);
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
  destroyDevPanel();
  game.destroy(true);
}
