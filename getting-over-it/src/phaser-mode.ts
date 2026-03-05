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

    // Background
    gfx.fillStyle(0x0a0a0f);
    gfx.fillRect(cam.scrollX - 10, cam.scrollY - 10, cam.width + 20, cam.height + 20);

    // Ground
    gfx.fillStyle(0x0d0b08);
    gfx.fillRect(0, GROUND_Y, WORLD_W, 200);
    gfx.lineStyle(3, 0x4b5563);
    gfx.lineBetween(0, GROUND_Y, WORLD_W, GROUND_Y);

    // Rocks
    for (const rock of ROCKS) {
      const v = rock.verts;
      if (v.length < 3) continue;
      gfx.fillStyle(0x374151);
      gfx.beginPath();
      gfx.moveTo(v[0].x, v[0].y);
      for (let i = 1; i < v.length; i++) gfx.lineTo(v[i].x, v[i].y);
      gfx.closePath();
      gfx.fillPath();
      gfx.lineStyle(2, 0x4b5563);
      gfx.beginPath();
      gfx.moveTo(v[0].x, v[0].y);
      for (let i = 1; i < v.length; i++) gfx.lineTo(v[i].x, v[i].y);
      gfx.closePath();
      gfx.strokePath();
      let topIdx = 0;
      for (let i = 1; i < v.length; i++) { if (v[i].y < v[topIdx].y) topIdx = i; }
      const ni = (topIdx + 1) % v.length, pi = (topIdx - 1 + v.length) % v.length;
      gfx.lineStyle(1, 0x6b7280);
      gfx.lineBetween(v[pi].x, v[pi].y, v[topIdx].x, v[topIdx].y);
      gfx.lineBetween(v[topIdx].x, v[topIdx].y, v[ni].x, v[ni].y);
      gfx.lineStyle(1, 0x1f2937);
      for (let i = 0; i < 2; i++) {
        const a = (i * 2.1 + rock.cx * 0.013 + rock.cy * 0.007) % (Math.PI * 2);
        const len = 12 + ((i * 13 + Math.abs(rock.cx * 0.4)) % 18);
        gfx.lineBetween(rock.cx, rock.cy, rock.cx + Math.cos(a) * len, rock.cy + Math.sin(a) * len);
      }
    }

    // Arms + Hands
    const shoulderOff = BODY_R * 0.7, shoulderY = by - 2;
    const hmX = bx + (hx - bx) * 0.4, hmY = by + (hy - by) * 0.4;
    const drawArm = (sx: number, sy: number) => {
      const dx = hmX - sx, dy = hmY - sy;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const al = Math.min(d, BODY_R * 2.5);
      const ex = sx + (dx / d) * al, ey = sy + (dy / d) * al;
      gfx.lineStyle(4, 0x78563d);
      gfx.lineBetween(sx, sy, ex, ey);
      const hs = HAND_R + Math.min(2, d * 0.02);
      gfx.fillStyle(0x9e7b5a);
      gfx.fillCircle(ex, ey, hs);
      gfx.lineStyle(1, 0x5a3e28);
      gfx.strokeCircle(ex, ey, hs);
      return { x: ex, y: ey };
    };
    const lh = drawArm(bx - shoulderOff, shoulderY);
    const rh = drawArm(bx + shoulderOff, shoulderY);

    // Pickaxe handle
    const gx = (lh.x + rh.x) / 2, gy = (lh.y + rh.y) / 2;
    gfx.lineStyle(5, 0x92400e);
    gfx.lineBetween(gx, gy, hx, hy);

    // Pickaxe head (fixed orientation)
    const pw = 20, ph = 8;
    gfx.fillStyle(hammerOnRock ? 0xfbbf24 : 0x9ca3af);
    gfx.beginPath();
    gfx.moveTo(hx - pw * 0.6, hy + ph);
    gfx.lineTo(hx - pw * 0.1, hy - ph * 0.5);
    gfx.lineTo(hx + pw * 0.1, hy - ph * 0.5);
    gfx.lineTo(hx + pw * 0.6, hy + ph);
    gfx.lineTo(hx, hy + ph * 0.3);
    gfx.closePath();
    gfx.fillPath();
    gfx.lineStyle(1, 0x374151);
    gfx.strokePath();
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
    const msx = this.mouseScreen.x, msy = -this.mouseScreen.y;
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
