// Stone Ascent – Phaser Mode (MatterJS Physics)
// Force-based hammer system matching PlayerControl.cs from Unity reference.
// The hammer does NOT attach to rocks. When the hammer overlaps a rock,
// a spring force pushes the player body. Only input: move the mouse.
//
// Visual reference:
//   Hand.cs  — two hands rotate toward hammer handle, stretch with distance
//   Head.cs  — head looks toward mouse (±30° clamp), random blinking
//   PlayerControl.cs — force = (hammerPos - mouseVec - bodyPos) * 80

import Phaser from 'phaser';

// ─── Tweakable config (mutable — dev panel reads/writes these) ──────────────
const cfg = {
  // Hammer physics
  maxRange:       150,     // max mouse offset px
  forceMult:      0.002,   // spring force multiplier
  maxSpeed:       8,       // velocity clamp
  hammerLerp:     0.2,     // hammer lerp toward target
  hammerR:        14,      // hammer overlap check radius

  // Player body
  playerFriction:       0.95,
  playerFrictionStatic: 0.8,
  playerFrictionAir:    0.015,
  playerRestitution:    0.02,
  playerDensity:        0.002,

  // Rock surfaces
  rockFriction:       0.95,
  rockFrictionStatic: 0.8,
  rockRestitution:    0.05,

  // World
  gravity: 1.2,
};

// ─── Fixed constants (not tweakable) ────────────────────────────────────────
const BODY_R    = 18;
const HEAD_R    = 12;
const HAND_R    = 5;
const GROUND_Y  = 580;
const SPAWN_X   = 400;
const SPAWN_Y   = 500;
const WORLD_W   = 800;
const WORLD_H   = 4000;

// ─── Deterministic pseudo-random ────────────────────────────────────────────
function seeded(s: number): number {
  const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ─── Rock polygon generation ────────────────────────────────────────────────
interface RockData {
  cx: number;
  cy: number;
  verts: { x: number; y: number }[];
}

function generateRock(
  cx: number, cy: number, rx: number, ry: number, n: number, seed: number,
): RockData {
  const verts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = 0.55 + 0.45 * Math.abs(Math.sin(i * 2.7181 + seed));
    verts.push({ x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r });
  }
  return { cx, cy, verts };
}

function buildRockLayout(): RockData[] {
  const rocks: RockData[] = [];
  rocks.push(generateRock(400, 560, 200, 28, 9, 1.1));
  let curY = 490;
  let side = -1;
  for (let i = 0; i < 25; i++) {
    const hOff = 60 + seeded(i * 3.1) * 50;
    const cx = 400 + side * hOff;
    const rx = 55 + seeded(i * 5.7 + 10) * 30;
    const ry = 22 + seeded(i * 7.3 + 20) * 16;
    const n  = 6 + Math.floor(seeded(i * 11.1 + 30) * 4);
    rocks.push(generateRock(cx, curY, rx, ry, n, i * 1.37 + 0.5));
    curY -= 65 + seeded(i * 4.9 + 40) * 20;
    side *= -1;
  }
  return rocks;
}

const ROCKS = buildRockLayout();

// ─── Callbacks for HUD ─────────────────────────────────────────────────────
let onAltitudeUpdate: ((meters: number) => void) | null = null;
export function setAltitudeCallback(cb: (meters: number) => void): void {
  onAltitudeUpdate = cb;
}

// ─── Dev Panel ──────────────────────────────────────────────────────────────
let devPanelEl: HTMLElement | null = null;

interface SliderDef {
  key: keyof typeof cfg;
  label: string;
  min: number;
  max: number;
  step: number;
}

const SLIDER_DEFS: SliderDef[] = [
  { key: 'maxRange',              label: 'Max Range',            min: 50,    max: 400,  step: 5 },
  { key: 'forceMult',             label: 'Force Mult',           min: 0.0001,max: 0.01, step: 0.0001 },
  { key: 'maxSpeed',              label: 'Max Speed',            min: 1,     max: 30,   step: 0.5 },
  { key: 'hammerLerp',            label: 'Hammer Lerp',          min: 0.01,  max: 1,    step: 0.01 },
  { key: 'hammerR',               label: 'Hammer Radius',        min: 2,     max: 40,   step: 1 },
  { key: 'gravity',               label: 'Gravity',              min: 0.1,   max: 5,    step: 0.1 },
  { key: 'playerFriction',        label: 'Player Friction',      min: 0,     max: 1,    step: 0.01 },
  { key: 'playerFrictionStatic',  label: 'Player FrictionStatic',min: 0,     max: 2,    step: 0.05 },
  { key: 'playerFrictionAir',     label: 'Player FrictionAir',   min: 0,     max: 0.1,  step: 0.001 },
  { key: 'playerRestitution',     label: 'Player Restitution',   min: 0,     max: 1,    step: 0.01 },
  { key: 'playerDensity',         label: 'Player Density',       min: 0.0001,max: 0.02, step: 0.0001 },
  { key: 'rockFriction',          label: 'Rock Friction',        min: 0,     max: 1,    step: 0.01 },
  { key: 'rockFrictionStatic',    label: 'Rock FrictionStatic',  min: 0,     max: 2,    step: 0.05 },
  { key: 'rockRestitution',       label: 'Rock Restitution',     min: 0,     max: 1,    step: 0.01 },
];

function createDevPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'dev-panel';
  panel.innerHTML = `
    <style>
      #dev-panel {
        position: fixed; top: 10px; right: 10px; z-index: 9999;
        width: 280px; max-height: 90vh; overflow-y: auto;
        background: rgba(10,8,5,0.92); border: 1px solid rgba(200,169,110,0.35);
        border-radius: 8px; padding: 12px; font-family: 'Cinzel', monospace;
        color: #c8a96e; font-size: 11px; backdrop-filter: blur(6px);
        pointer-events: auto; user-select: none;
      }
      #dev-panel.collapsed > .dp-body { display: none; }
      #dev-panel .dp-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 8px; cursor: pointer;
      }
      #dev-panel .dp-title { font-size: 13px; font-weight: 700; letter-spacing: 0.1em; }
      #dev-panel .dp-toggle { font-size: 16px; color: #7a6a4a; }
      #dev-panel .dp-row {
        display: flex; flex-direction: column; margin-bottom: 6px;
        padding-bottom: 6px; border-bottom: 1px solid rgba(200,169,110,0.1);
      }
      #dev-panel .dp-row-top {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 2px;
      }
      #dev-panel .dp-label { color: #a89060; font-size: 10px; }
      #dev-panel .dp-val {
        color: #c8a96e; font-size: 10px; font-family: monospace;
        min-width: 55px; text-align: right;
      }
      #dev-panel input[type=range] {
        width: 100%; height: 14px; -webkit-appearance: none; appearance: none;
        background: rgba(200,169,110,0.12); border-radius: 7px; outline: none;
        cursor: pointer;
      }
      #dev-panel input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
        background: #c8a96e; cursor: pointer;
      }
      #dev-panel input[type=range]::-moz-range-thumb {
        width: 14px; height: 14px; border-radius: 50%; border: none;
        background: #c8a96e; cursor: pointer;
      }
      #dev-panel .dp-btns { display: flex; gap: 6px; margin-top: 8px; }
      #dev-panel .dp-btn {
        flex: 1; padding: 6px; font-family: 'Cinzel', serif; font-size: 10px;
        letter-spacing: 0.1em; border: 1px solid rgba(200,169,110,0.3);
        border-radius: 4px; cursor: pointer; text-align: center;
        background: rgba(200,169,110,0.08); color: #c8a96e;
        transition: background 0.15s;
      }
      #dev-panel .dp-btn:hover { background: rgba(200,169,110,0.2); }
      #dev-panel .dp-copied {
        text-align: center; color: #4ade80; font-size: 10px;
        margin-top: 4px; opacity: 0; transition: opacity 0.3s;
      }
      #dev-panel .dp-copied.show { opacity: 1; }
    </style>
    <div class="dp-header" id="dp-header">
      <span class="dp-title">DEV TOOLS</span>
      <span class="dp-toggle" id="dp-toggle">&#9660;</span>
    </div>
    <div class="dp-body" id="dp-body"></div>
  `;
  document.body.appendChild(panel);

  const body = panel.querySelector('#dp-body')!;
  const valEls: Record<string, HTMLElement> = {};

  // Build sliders
  for (const def of SLIDER_DEFS) {
    const row = document.createElement('div');
    row.className = 'dp-row';
    const val = cfg[def.key];
    const decimals = def.step < 0.001 ? 4 : def.step < 0.01 ? 3 : def.step < 1 ? 2 : 0;
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

  // Buttons
  const btns = document.createElement('div');
  btns.className = 'dp-btns';
  btns.innerHTML = `
    <div class="dp-btn" id="dp-copy">COPY JSON</div>
    <div class="dp-btn" id="dp-reset">RESET</div>
  `;
  body.appendChild(btns);

  const copiedEl = document.createElement('div');
  copiedEl.className = 'dp-copied';
  copiedEl.textContent = 'Copied to clipboard!';
  body.appendChild(copiedEl);

  // Copy JSON
  btns.querySelector('#dp-copy')!.addEventListener('click', () => {
    const json = JSON.stringify(cfg, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      copiedEl.classList.add('show');
      setTimeout(() => copiedEl.classList.remove('show'), 1500);
    });
  });

  // Reset to defaults
  const defaults = { ...cfg };
  btns.querySelector('#dp-reset')!.addEventListener('click', () => {
    Object.assign(cfg, defaults);
    // Update all sliders and value labels
    for (const def of SLIDER_DEFS) {
      const slider = body.querySelector(`input[data-key="${def.key}"]`) as HTMLInputElement;
      const v = cfg[def.key];
      slider.value = String(v);
      const decimals = def.step < 0.001 ? 4 : def.step < 0.01 ? 3 : def.step < 1 ? 2 : 0;
      valEls[def.key].textContent = Number(v).toFixed(decimals);
    }
  });

  // Collapse/expand toggle
  panel.querySelector('#dp-header')!.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    const arrow = panel.querySelector('#dp-toggle')!;
    arrow.innerHTML = panel.classList.contains('collapsed') ? '&#9654;' : '&#9660;';
  });

  return panel;
}

function destroyDevPanel(): void {
  if (devPanelEl) {
    devPanelEl.remove();
    devPanelEl = null;
  }
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
  }
}

// ─── Hand helper (Hand.cs port) ─────────────────────────────────────────────
function drawTomatoHand(
  gfx: Phaser.GameObjects.Graphics,
  sx: number, sy: number,
  hx: number, hy: number,
  isRight: boolean,
): void {
  const dx   = hx - sx;
  const dy   = hy - sy;
  const dist = Math.hypot(dx, dy) || 1;

  const ux = dx / dist, uy = dy / dist;
  const px = -uy,       py =  ux;

  const ARM_MAX = (BODY_R + 5) * 2.6;
  const armLen  = Math.min(dist, ARM_MAX);
  const ax = sx + ux * armLen;
  const ay = sy + uy * armLen;

  const open     = Math.min(1, dist / 90);
  const flip     = isRight ? (dy >= 0) : (dy < 0);
  const flipSign = flip ? -1 : 1;

  gfx.lineStyle(3.5, 0xC53030);
  gfx.lineBetween(sx, sy, ax, ay);

  gfx.fillStyle(0xE53E3E);
  gfx.fillCircle(ax, ay, 5.5);
  gfx.lineStyle(1.5, 0xB91C1C);
  gfx.strokeCircle(ax, ay, 5.5);

  const lateralStep = (3 + open * 4) * flipSign;
  const fwdBase     = 7 + open * 5;
  for (const lat of [-1, 0, 1]) {
    const lw  = lat * lateralStep;
    const fwd = fwdBase - Math.abs(lat) * 1.5;
    const fx2 = ax + ux * fwd + px * lw;
    const fy2 = ay + uy * fwd + py * lw;
    gfx.lineStyle(2.5, 0xC53030);
    gfx.lineBetween(ax + px * lw * 0.3, ay + py * lw * 0.3, fx2, fy2);
    gfx.fillStyle(0xE53E3E);
    gfx.fillCircle(fx2, fy2, 3.5);
    gfx.lineStyle(1.5, 0xB91C1C);
    gfx.strokeCircle(fx2, fy2, 3.5);
  }
}

// ─── Phaser Scene ───────────────────────────────────────────────────────────
class ClimbScene extends Phaser.Scene {
  private playerBody!: MatterJS.BodyType;
  private hammerPos = { x: SPAWN_X, y: SPAWN_Y - 50 };
  private mouseWorld = { x: SPAWN_X, y: SPAWN_Y };
  private mouseScreen = { x: 0, y: 0 };
  private rockBodies: MatterJS.BodyType[] = [];
  private gfx!: Phaser.GameObjects.Graphics;
  private maxHeight = 0;
  private MatterLib: any;

  // Head blinking (Head.cs)
  private blinking = false;
  private blinkTimer = 0;
  private nextBlinkAt = 0;
  private blinkPhase = 0;

  constructor() {
    super({ key: 'ClimbScene' });
  }

  create(): void {
    this.MatterLib = (Phaser.Physics.Matter as any).Matter;
    const ML = this.MatterLib;

    this.matter.world.setBounds(0, -WORLD_H + 600, WORLD_W, WORLD_H + 200);

    // Create polygon rock bodies
    for (const rock of ROCKS) {
      const localVerts = rock.verts.map(v => ({ x: v.x - rock.cx, y: v.y - rock.cy }));
      const body = ML.Bodies.fromVertices(rock.cx, rock.cy, [localVerts], {
        isStatic: true, label: 'rock',
        friction: cfg.rockFriction, frictionStatic: cfg.rockFrictionStatic,
        restitution: cfg.rockRestitution,
      }) as MatterJS.BodyType;
      ML.Body.setPosition(body, { x: rock.cx, y: rock.cy });
      this.matter.world.add(body);
      this.rockBodies.push(body);
    }

    // Walls
    const lw = this.matter.add.rectangle(20, -200, 40, 2000, { isStatic: true, label: 'rock', friction: 0.5 });
    const rw = this.matter.add.rectangle(780, -200, 40, 2000, { isStatic: true, label: 'rock', friction: 0.5 });
    this.rockBodies.push(lw, rw);

    // Ground
    this.matter.add.rectangle(WORLD_W / 2, GROUND_Y + 25, WORLD_W + 200, 50, {
      isStatic: true, label: 'ground', friction: 0.9,
    });

    // Player body
    this.playerBody = this.matter.add.circle(SPAWN_X, SPAWN_Y, BODY_R, {
      label: 'player',
      friction: cfg.playerFriction,
      frictionStatic: cfg.playerFrictionStatic,
      frictionAir: cfg.playerFrictionAir,
      restitution: cfg.playerRestitution,
      density: cfg.playerDensity,
    });

    this.hammerPos.x = SPAWN_X;
    this.hammerPos.y = SPAWN_Y - 60;
    this.gfx = this.add.graphics();
    this.nextBlinkAt = Math.random() * 10000;
    this.blinkTimer = 0;

    // Mouse tracking
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.mouseWorld.x = pointer.worldX;
      this.mouseWorld.y = pointer.worldY;
      this.mouseScreen.x = (pointer.x / this.scale.width) * 2.0 - 1.0;
      this.mouseScreen.y = (pointer.y / this.scale.height) * 2.0 - 1.0;
    });
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.mouseWorld.x = pointer.worldX;
      this.mouseWorld.y = pointer.worldY;
      this.mouseScreen.x = (pointer.x / this.scale.width) * 2.0 - 1.0;
      this.mouseScreen.y = (pointer.y / this.scale.height) * 2.0 - 1.0;
    });
  }

  update(_time: number, delta: number): void {
    const ML = this.MatterLib;
    const body = this.playerBody;
    const bx = body.position.x;
    const by = body.position.y;

    // ── Live-apply cfg changes to physics bodies ────────────────────────────
    body.friction       = cfg.playerFriction;
    body.frictionStatic = cfg.playerFrictionStatic;
    body.frictionAir    = cfg.playerFrictionAir;
    body.restitution    = cfg.playerRestitution;
    this.matter.world.localWorld.gravity.y = cfg.gravity;

    for (const rb of this.rockBodies) {
      rb.friction       = cfg.rockFriction;
      rb.frictionStatic = cfg.rockFrictionStatic;
      rb.restitution    = cfg.rockRestitution;
    }

    // ── 1. mouseVec ─────────────────────────────────────────────────────────
    const cam = this.cameras.main;
    const scx = cam.scrollX + cam.width / 2;
    const scy = cam.scrollY + cam.height / 2;
    const rawDx = this.mouseWorld.x - scx;
    const rawDy = this.mouseWorld.y - scy;
    const rawDist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
    const clampedDist = Math.min(rawDist, cfg.maxRange);
    const mouseVec = rawDist > 0
      ? { x: (rawDx / rawDist) * clampedDist, y: (rawDy / rawDist) * clampedDist }
      : { x: 0, y: 0 };

    // ── 2. Static bodies for queries ────────────────────────────────────────
    const allBodies = (this.matter.world.localWorld as any).bodies as MatterJS.BodyType[];
    const staticBodies = allBodies.filter(
      (b: MatterJS.BodyType) => b.isStatic && (b.label === 'rock' || b.label === 'ground')
    );

    // ── 3. Hammer target + lerp (solid collision) ───────────────────────────
    const htx = bx + mouseVec.x;
    const hty = by + mouseVec.y;
    const prevHx = this.hammerPos.x;
    const prevHy = this.hammerPos.y;
    let newHx = prevHx + (htx - prevHx) * cfg.hammerLerp;
    let newHy = prevHy + (hty - prevHy) * cfg.hammerLerp;

    const penetrating = ML.Query.point(staticBodies, { x: newHx, y: newHy });
    if (penetrating.length > 0) {
      let lo = 0, hi = 1;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        const mx = prevHx + (newHx - prevHx) * mid;
        const my = prevHy + (newHy - prevHy) * mid;
        if (ML.Query.point(staticBodies, { x: mx, y: my }).length > 0) hi = mid;
        else lo = mid;
      }
      newHx = prevHx + (newHx - prevHx) * lo;
      newHy = prevHy + (newHy - prevHy) * lo;
    }
    this.hammerPos.x = newHx;
    this.hammerPos.y = newHy;

    // ── 4. Overlap check ────────────────────────────────────────────────────
    const hr = cfg.hammerR;
    const regionHit = ML.Query.region(staticBodies, {
      min: { x: this.hammerPos.x - hr, y: this.hammerPos.y - hr },
      max: { x: this.hammerPos.x + hr, y: this.hammerPos.y + hr },
    });
    const isOverlapping = regionHit.length > 0;

    // ── 5. Apply force ──────────────────────────────────────────────────────
    if (isOverlapping) {
      const tbx = this.hammerPos.x - mouseVec.x;
      const tby = this.hammerPos.y - mouseVec.y;
      ML.Body.applyForce(body, body.position, {
        x: (tbx - bx) * cfg.forceMult,
        y: (tby - by) * cfg.forceMult,
      });
      const vx = body.velocity.x, vy = body.velocity.y;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > cfg.maxSpeed) {
        const s = cfg.maxSpeed / speed;
        ML.Body.setVelocity(body, { x: vx * s, y: vy * s });
      }
    }

    // ── 6. Camera ───────────────────────────────────────────────────────────
    cam.scrollX += (bx - cam.width / 2 - cam.scrollX) * 0.08;
    cam.scrollY += (by - cam.height * 0.6 - cam.scrollY) * 0.08;

    // ── 7. Altitude ─────────────────────────────────────────────────────────
    const alt = Math.max(0, Math.round((SPAWN_Y - by) / 9));
    if (alt > this.maxHeight) this.maxHeight = alt;
    if (onAltitudeUpdate) onAltitudeUpdate(this.maxHeight);

    // ── 8. Blink ────────────────────────────────────────────────────────────
    this.updateBlink(delta);

    // ── 9. Render ───────────────────────────────────────────────────────────
    this.renderScene(isOverlapping);
  }

  private updateBlink(delta: number): void {
    this.blinkTimer += delta;
    if (!this.blinking) {
      if (this.blinkTimer >= this.nextBlinkAt) {
        this.blinking = true;
        this.blinkPhase = 0;
        this.blinkTimer = 0;
      }
    } else {
      if (this.blinkTimer >= 200) {
        this.blinkTimer = 0;
        this.blinkPhase++;
        if (this.blinkPhase >= 4) {
          this.blinking = false;
          this.nextBlinkAt = Math.random() * 10000;
          this.blinkTimer = 0;
        }
      }
    }
  }

  private get isEyesClosed(): boolean {
    return this.blinking && (this.blinkPhase === 0 || this.blinkPhase === 2);
  }

  private renderScene(hammerOnRock: boolean): void {
    const gfx = this.gfx;
    gfx.clear();

    const bx = this.playerBody.position.x;
    const by = this.playerBody.position.y;
    const hx = this.hammerPos.x;
    const hy = this.hammerPos.y;
    const cam = this.cameras.main;
    const cL  = cam.scrollX - 20;
    const cT  = cam.scrollY - 20;
    const cW  = cam.width  + 40;
    const cH  = cam.height + 40;

    // ── 1. Kitchen wall — cream tiles ────────────────────────────────────────
    gfx.fillStyle(0xFFFBF0);
    gfx.fillRect(cL, cT, cW, cH);

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
    gfx.lineStyle(1, 0x5E3410, 0.55);
    for (let g = 0; g < 260; g += 20)
      gfx.lineBetween(cL, GROUND_Y + g, cL + cW, GROUND_Y + g + 3);
    gfx.fillStyle(0x9A6132);
    gfx.fillRect(cL, GROUND_Y - 7, cW, 10);
    gfx.lineStyle(2, 0x5C3011);
    gfx.lineBetween(cL, GROUND_Y - 7, cL + cW, GROUND_Y - 7);
    gfx.lineBetween(cL, GROUND_Y + 3,  cL + cW, GROUND_Y + 3);

    // ── 3. Kitchen items (rocks) ──────────────────────────────────────────────
    for (let ri = 0; ri < ROCKS.length; ri++) {
      const rock = ROCKS[ri];
      const v    = rock.verts;
      if (v.length < 3) continue;

      let vMinX = Infinity, vMaxX = -Infinity, vMinY = Infinity, vMaxY = -Infinity;
      for (const p of v) {
        if (p.x < vMinX) vMinX = p.x;
        if (p.x > vMaxX) vMaxX = p.x;
        if (p.y < vMinY) vMinY = p.y;
        if (p.y > vMaxY) vMaxY = p.y;
      }

      type KItem = 'board'|'plate'|'pot'|'bowl'|'mug'|'pan';
      let kind: KItem = 'plate';
      if (ri === 0) {
        kind = 'board';
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

    // ── 4. Hands (Hand.cs) ───────────────────────────────────────────────────
    const TR   = BODY_R + 5;
    const sOff = TR * 0.65;
    drawTomatoHand(gfx, bx - sOff, by + 3, hx, hy, false);
    drawTomatoHand(gfx, bx + sOff, by + 3, hx, hy, true);

    // ── 5. Toothpick ──────────────────────────────────────────────────────────
    const tAng  = Math.atan2(hy - by, hx - bx);
    const tSrcX = bx + Math.cos(tAng) * TR;
    const tSrcY = by + Math.sin(tAng) * TR;
    gfx.lineStyle(3, 0xD4A574);
    gfx.lineBetween(tSrcX, tSrcY, hx, hy);
    gfx.lineStyle(1, 0xB08040, 0.6);
    gfx.lineBetween(tSrcX + 1, tSrcY + 1, hx + 1, hy + 1);
    const tipX = hx + Math.cos(tAng) * 7;
    const tipY = hy + Math.sin(tAng) * 7;
    gfx.fillStyle(0xA06828);
    gfx.fillTriangle(
      hx + Math.cos(tAng - 1.3) * 3, hy + Math.sin(tAng - 1.3) * 3,
      hx + Math.cos(tAng + 1.3) * 3, hy + Math.sin(tAng + 1.3) * 3,
      tipX, tipY,
    );
    if (hammerOnRock) {
      gfx.fillStyle(0xFEF08A, 0.35);
      gfx.fillCircle(hx, hy, 16);
      gfx.lineStyle(1, 0xEAB308, 0.55);
      gfx.strokeCircle(hx, hy, 20);
    }

    // ── 5. Tomato player ──────────────────────────────────────────────────────
    gfx.fillStyle(0x000000, 0.1);
    gfx.fillEllipse(bx + 4, by + TR + 1, TR * 2.4, 10);

    gfx.fillStyle(0xE53E3E);
    gfx.fillCircle(bx, by, TR);

    gfx.fillStyle(0xB91C1C, 0.28);
    gfx.fillEllipse(bx, by + TR * 0.3, TR * 2, TR * 1.4);

    gfx.lineStyle(1.5, 0xC53030, 0.35);
    for (let rib = -1; rib <= 1; rib++) {
      const rx2 = bx + rib * (TR * 0.44);
      gfx.lineBetween(rx2, by - TR + 5, rx2, by + TR - 5);
    }

    gfx.fillStyle(0xFF8080, 0.5);
    gfx.fillCircle(bx - TR * 0.32, by - TR * 0.32, TR * 0.35);
    gfx.fillStyle(0xFFFFFF, 0.25);
    gfx.fillCircle(bx - TR * 0.36, by - TR * 0.36, TR * 0.18);

    gfx.lineStyle(2, 0xB91C1C);
    gfx.strokeCircle(bx, by, TR);

    // Calyx leaves
    const leafCx = bx, leafCy = by - TR + 2;
    gfx.fillStyle(0x16A34A);
    for (let li = 0; li < 5; li++) {
      const la  = (li / 5) * Math.PI * 2 - Math.PI / 2;
      const lx1 = leafCx + Math.cos(la - 0.35) * 4;
      const ly1 = leafCy + Math.sin(la - 0.35) * 4;
      const lx2 = leafCx + Math.cos(la + 0.35) * 4;
      const ly2 = leafCy + Math.sin(la + 0.35) * 4;
      const ltx = leafCx + Math.cos(la) * 11;
      const lty = leafCy + Math.sin(la) * 8;
      gfx.fillTriangle(lx1, ly1, lx2, ly2, ltx, lty);
    }
    gfx.fillStyle(0x15803D);
    gfx.fillRect(leafCx - 1.5, leafCy - 9, 3, 9);

    // Face
    const facing  = this.mouseScreen.x >= 0 ? 1 : -1;
    const eyeOffX = 6 * facing;
    const eyeY    = by - 4;
    if (this.isEyesClosed) {
      gfx.lineStyle(2, 0x7F1D1D);
      gfx.lineBetween(bx + eyeOffX - 5, eyeY, bx + eyeOffX + 5, eyeY);
      gfx.lineBetween(bx - eyeOffX - 3, eyeY, bx - eyeOffX + 3, eyeY);
    } else {
      gfx.fillStyle(0xFFFFFF);
      gfx.fillCircle(bx + eyeOffX,       eyeY, 3.5);
      gfx.fillCircle(bx - eyeOffX * 0.5, eyeY, 3);
      gfx.fillStyle(0x1A0000);
      gfx.fillCircle(bx + eyeOffX       + facing * 0.8, eyeY, 1.8);
      gfx.fillCircle(bx - eyeOffX * 0.5 + facing * 0.8, eyeY, 1.5);
    }
    gfx.lineStyle(2, 0x7F1D1D);
    gfx.lineBetween(bx - 5, by + 6, bx - 1, by + 8);
    gfx.lineBetween(bx - 1, by + 8, bx + 5, by + 6);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────
export function launchPhaserGame(container: HTMLElement): Phaser.Game {
  devPanelEl = createDevPanel();

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: container,
    width: window.innerWidth,
    height: window.innerHeight,
    transparent: true,
    physics: {
      default: 'matter',
      matter: {
        gravity: { x: 0, y: cfg.gravity },
        debug: false,
      },
    },
    scene: [ClimbScene],
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

export function destroyPhaserGame(game: Phaser.Game): void {
  onAltitudeUpdate = null;
  destroyDevPanel();
  game.destroy(true);
}
