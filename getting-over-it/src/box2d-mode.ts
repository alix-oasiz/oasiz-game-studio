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

// Used by binary search ONLY — stops hammer when it enters a rock polygon
function isHammerInsideRock(hx: number, hy: number): boolean {
  for (const rock of ROCKS) {
    if (pointInPoly(hx, hy, rock.verts)) return true;
  }
  return false;
}

// Used for FORCE APPLICATION — true when hammer is on or near a rock surface
function isHammerNearRock(hx: number, hy: number): boolean {
  const hr = cfg.hammerR;
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

    // Background
    gfx.fillStyle(0x0a0a0f);
    gfx.fillRect(cam.scrollX - 10, cam.scrollY - 10, cam.width + 20, cam.height + 20);

    // Ground — drawn wide enough to cover the full slope width
    gfx.fillStyle(0x0d0b08);
    gfx.fillRect(cam.scrollX - 20, GROUND_Y, cam.width + 40, 200);
    gfx.lineStyle(3, 0x4b5563);
    gfx.lineBetween(cam.scrollX - 20, GROUND_Y, cam.scrollX + cam.width + 20, GROUND_Y);

    // Rocks — skip rocks fully outside the current camera view
    const cullL = cam.scrollX - 150;
    const cullR = cam.scrollX + cam.width  + 150;
    const cullT = cam.scrollY - 150;
    const cullB = cam.scrollY + cam.height + 150;
    for (const rock of ROCKS) {
      const v = rock.verts;
      if (v.length < 3) continue;
      if (rock.cx < cullL || rock.cx > cullR || rock.cy < cullT || rock.cy > cullB) continue;
      gfx.fillStyle(0x374151);
      gfx.beginPath();
      gfx.moveTo(v[0].x, v[0].y);
      for (let i = 1; i < v.length; i++) gfx.lineTo(v[i].x, v[i].y);
      gfx.closePath(); gfx.fillPath();
      gfx.lineStyle(2, 0x4b5563);
      gfx.beginPath();
      gfx.moveTo(v[0].x, v[0].y);
      for (let i = 1; i < v.length; i++) gfx.lineTo(v[i].x, v[i].y);
      gfx.closePath(); gfx.strokePath();
      let topIdx = 0;
      for (let i = 1; i < v.length; i++) { if (v[i].y < v[topIdx].y) topIdx = i; }
      const ni = (topIdx + 1) % v.length, pi = (topIdx - 1 + v.length) % v.length;
      gfx.lineStyle(1, 0x6b7280);
      gfx.lineBetween(v[pi].x, v[pi].y, v[topIdx].x, v[topIdx].y);
      gfx.lineBetween(v[topIdx].x, v[topIdx].y, v[ni].x, v[ni].y);
      gfx.lineStyle(1, 0x1f2937);
      for (let i = 0; i < 2; i++) {
        const a   = (i * 2.1 + rock.cx * 0.013 + rock.cy * 0.007) % (Math.PI * 2);
        const len = 12 + ((i * 13 + Math.abs(rock.cx * 0.4)) % 18);
        gfx.lineBetween(rock.cx, rock.cy, rock.cx + Math.cos(a) * len, rock.cy + Math.sin(a) * len);
      }
    }

    // Arms + hands
    const shoulderOff = BODY_R * 0.7, shoulderY = by - 2;
    const hmX = bx + (hx - bx) * 0.4, hmY = by + (hy - by) * 0.4;
    const drawArm = (sx: number, sy: number) => {
      const dx = hmX - sx, dy = hmY - sy;
      const d  = Math.hypot(dx, dy) || 1;
      const al = Math.min(d, BODY_R * 2.5);
      const ex = sx + (dx / d) * al, ey = sy + (dy / d) * al;
      gfx.lineStyle(4, 0x78563d);
      gfx.lineBetween(sx, sy, ex, ey);
      gfx.fillStyle(0x9e7b5a);
      gfx.fillCircle(ex, ey, HAND_R + Math.min(2, d * 0.02));
      gfx.lineStyle(1, 0x5a3e28);
      gfx.strokeCircle(ex, ey, HAND_R);
      return { x: ex, y: ey };
    };
    const lh = drawArm(bx - shoulderOff, shoulderY);
    const rh = drawArm(bx + shoulderOff, shoulderY);

    // Pickaxe handle
    const gx = (lh.x + rh.x) / 2, gy = (lh.y + rh.y) / 2;
    gfx.lineStyle(5, 0x92400e);
    gfx.lineBetween(gx, gy, hx, hy);

    // Pickaxe head
    const pw = 20, ph = 8;
    gfx.fillStyle(hammerOnRock ? 0xfbbf24 : 0x9ca3af);
    gfx.beginPath();
    gfx.moveTo(hx - pw * 0.6, hy + ph);
    gfx.lineTo(hx - pw * 0.1, hy - ph * 0.5);
    gfx.lineTo(hx + pw * 0.1, hy - ph * 0.5);
    gfx.lineTo(hx + pw * 0.6, hy + ph);
    gfx.lineTo(hx, hy + ph * 0.3);
    gfx.closePath(); gfx.fillPath();
    gfx.lineStyle(1, 0x374151); gfx.strokePath();
    if (hammerOnRock) {
      gfx.fillStyle(0xfbbf24, 0.25);
      gfx.fillCircle(hx, hy, cfg.hammerR + 6);
    }

    // Cauldron
    gfx.fillStyle(0x374151);
    gfx.fillEllipse(bx, by + BODY_R + 4, 40, 12);
    gfx.lineStyle(1, 0x4b5563);
    gfx.strokeEllipse(bx, by + BODY_R + 4, 40, 12);

    // Player body
    gfx.fillStyle(0x78563d);
    gfx.fillCircle(bx, by, BODY_R);
    gfx.fillStyle(0x2d1f14, 0.4);
    gfx.fillCircle(bx + 2, by + 2, BODY_R - 2);
    gfx.lineStyle(1.5, 0x5a3e28);
    gfx.strokeCircle(bx, by, BODY_R);

    // Head
    const headX = bx, headY = by - BODY_R - HEAD_R + 4;
    const msx   = this.mouseScreen.x, msy = -this.mouseScreen.y;
    const headFlipped = msx < 0;
    let headDeg = (180 / Math.PI) * Math.atan2(msy, Math.abs(msx));
    headDeg = Math.max(-30, Math.min(30, headDeg));
    gfx.fillStyle(0xd4a574);
    gfx.fillCircle(headX, headY, HEAD_R);
    gfx.lineStyle(1, 0x8b6b4a);
    gfx.strokeCircle(headX, headY, HEAD_R);
    const eox = headFlipped ? -3 : 3, esp = 4, eyeY = headY - 2;
    if (this.isEyesClosed) {
      gfx.lineStyle(1.5, 0x2d1f14);
      gfx.lineBetween(headX + eox - esp - 2, eyeY, headX + eox - esp + 2, eyeY);
      gfx.lineBetween(headX + eox + esp - 2, eyeY, headX + eox + esp + 2, eyeY);
    } else {
      gfx.fillStyle(0xffffff);
      gfx.fillCircle(headX + eox - esp, eyeY, 2.5);
      gfx.fillCircle(headX + eox + esp, eyeY, 2.5);
      const ps = headFlipped ? -0.8 : 0.8;
      gfx.fillStyle(0x1a1008);
      gfx.fillCircle(headX + eox - esp + ps, eyeY, 1.2);
      gfx.fillCircle(headX + eox + esp + ps, eyeY, 1.2);
    }
    const mx = headX + (headFlipped ? -1 : 1);
    gfx.lineStyle(1, 0x5a3020);
    gfx.lineBetween(mx - 2.5, headY + 4, mx + 2.5, headY + 4);

    void headDeg; // suppress unused warning
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
