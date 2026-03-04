// Stone Ascent – POC
// Player with pendulum physics + rock obstacles to prove the core mechanic.

import { launchPhaserGame, destroyPhaserGame, setAltitudeCallback } from './phaser-mode';

// ─── Canvas setup ────────────────────────────────────────────────────────────
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx    = canvas.getContext('2d')!;

function resize(): void {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ─── Game state ──────────────────────────────────────────────────────────────
type GameState = 'start' | 'playing';
let gameState: GameState = 'start';
let activeMode: 1 | 2 = 1;
let phaserGame: ReturnType<typeof launchPhaserGame> | null = null;

// ─── UI elements ─────────────────────────────────────────────────────────────
const startScreen      = document.getElementById('start-screen')!;
const physics1Btn      = document.getElementById('physics1-btn')!;
const physics2Btn      = document.getElementById('physics2-btn')!;
const hud              = document.getElementById('hud')!;
const settingsBtn      = document.getElementById('settings-btn')!;
const quitBtn          = document.getElementById('quit-btn')!;
const phaserContainer  = document.getElementById('phaser-container')!;

function startClassicGame(): void {
  activeMode     = 1;
  gameState      = 'playing';
  startScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  settingsBtn.classList.remove('hidden');
  quitBtn.classList.remove('hidden');
  canvas.style.display = 'block';
  phaserContainer.classList.add('hidden');
  // Reset player to spawn position
  player.x          = 0;
  player.y          = 80;
  player.vx         = 0;
  player.vy         = 0;
  player.gripped    = false;
  player.omega      = 0;
  maxHeight         = 0;
  hintFrame         = 0;
  hintAlpha         = 1;
  camX              = 0;
  camY              = 80;
}

function startPhaserGame(): void {
  activeMode     = 2;
  gameState      = 'playing';
  startScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  settingsBtn.classList.remove('hidden');
  quitBtn.classList.remove('hidden');
  // Hide canvas, show Phaser container
  canvas.style.display = 'none';
  phaserContainer.classList.remove('hidden');
  // Launch Phaser
  setAltitudeCallback((meters) => {
    maxHeight = meters;
  });
  phaserGame = launchPhaserGame(phaserContainer);
}

function stopPhaserGame(): void {
  if (phaserGame) {
    destroyPhaserGame(phaserGame);
    phaserGame = null;
  }
  phaserContainer.classList.add('hidden');
  canvas.style.display = 'block';
}

physics1Btn.addEventListener('click', () => startClassicGame());
physics2Btn.addEventListener('click', () => startPhaserGame());

// ─── Constants ───────────────────────────────────────────────────────────────
const GRAVITY      = 0.45;   // px / frame²  (downward = +y in canvas)
const ARM_LEN      = 92;     // fixed arm length for Classic mode, px
const ANG_DAMP     = 0.93;   // angular damping while gripped  (higher = slower spin)
const LIN_DAMP     = 0.983;  // linear damping in free flight
const MOUSE_SENS   = 0.15;   // how strongly mouse rotation drives omega (lower = slower)
const GRIP_RADIUS  = 15;     // px – how close tip must be to rock edge to grip
const GROUND_Y     = 320;    // world-space Y of the flat ground floor
const PLAYER_R     = 16;     // body radius for ground collision

// ─── Types ───────────────────────────────────────────────────────────────────
interface V2   { x: number; y: number; }
interface Rock { cx: number; cy: number; verts: V2[]; }

// ─── Geometry helpers ────────────────────────────────────────────────────────
function pointInPoly(px: number, py: number, verts: V2[]): boolean {
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

function distToEdges(px: number, py: number, verts: V2[]): number {
  let best = Infinity;
  const n = verts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ax = verts[j].x, ay = verts[j].y;
    const bx = verts[i].x, by = verts[i].y;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t    = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const cx2  = ax + t * dx, cy2 = ay + t * dy;
    best = Math.min(best, Math.hypot(px - cx2, py - cy2));
  }
  return best;
}

function canGrip(tx: number, ty: number, rock: Rock): boolean {
  return pointInPoly(tx, ty, rock.verts) || distToEdges(tx, ty, rock.verts) < GRIP_RADIUS;
}

function wrapAngle(a: number): number {
  while (a >  Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// ─── Rock factory ────────────────────────────────────────────────────────────
// Uses deterministic variance from seed — no Math.random() here.
function makeRock(cx: number, cy: number, rx: number, ry: number, n: number, seed: number): Rock {
  const verts: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = 0.58 + 0.42 * Math.abs(Math.sin(i * 2.7181 + seed));
    verts.push({ x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r });
  }
  return { cx, cy, verts };
}

// World-space rocks.  y=0 is spawn.  Negative y = higher altitude.
// Each rock is positioned so its nearest edge is ~120-160 px from the
// previous rock's nearest edge — within comfortable swinging distance.
const ROCKS: Rock[] = [
  //                cx    cy    rx   ry   n  seed
  makeRock(   0,  220, 190,  75,  9, 1.10),  // 0 – wide starting platform
  makeRock(-110,   90, 100,  50,  7, 2.30),  // 1 – left,  130 up
  makeRock(  90,  -20, 110,  52,  8, 0.70),  // 2 – right, 110 up
  makeRock( -80, -140,  90,  48,  7, 3.20),  // 3 – left,  120 up
  makeRock( 110, -240, 105,  52,  8, 1.80),  // 4 – right, 100 up
  makeRock( -60, -360, 115,  55,  9, 0.50),  // 5 – left,  120 up
  makeRock( 100, -470,  95,  50,  7, 2.90),  // 6 – right, 110 up
  makeRock( -70, -590, 110,  55,  8, 1.40),  // 7 – left,  120 up
  makeRock(  80, -700, 120,  58,  9, 3.60),  // 8 – right, 110 up
  makeRock( -50, -820, 100,  52,  7, 0.90),  // 9 – left,  120 up
  makeRock(  90, -930, 115,  55,  8, 2.10),  // 10 – right, 110 up
];

// ─── Player state ────────────────────────────────────────────────────────────
const player = {
  x: 0, y: 80,          // body world position (starts above first rock)
  vx: 0, vy: 0,         // free-flight velocity

  gripped: false,
  gripX:   0, gripY: 0, // grip anchor (world-space, fixed when gripped)

  // Pendulum state (used only when gripped)
  // theta = angle FROM grip TO body  (screen coords, 0=right, π/2=down)
  theta: Math.PI / 2,
  omega: 0,             // angular velocity (rad/frame)
};

// ─── Camera ──────────────────────────────────────────────────────────────────
let camX = 0;
let camY = 80;

function w2s(wx: number, wy: number): V2 {
  return {
    x: wx - camX + canvas.width  * 0.5,
    y: wy - camY + canvas.height * 0.62,
  };
}
function s2w(sx: number, sy: number): V2 {
  return {
    x: sx - canvas.width  * 0.5 + camX,
    y: sy - canvas.height * 0.62 + camY,
  };
}

// ─── Pointer / input state ───────────────────────────────────────────────────
let mouseWX = 0, mouseWY = 0;
let prevGripAngle = 0;   // last frame's angle from grip → mouse (for delta)
let activeTouchId: number | null = null;

function setPointer(sx: number, sy: number): void {
  const w = s2w(sx, sy);
  mouseWX = w.x;
  mouseWY = w.y;
}

function armAngleFree(): number {
  // Angle from body to mouse when not gripped
  return Math.atan2(mouseWY - player.y, mouseWX - player.x);
}

// ─── Grip / release ──────────────────────────────────────────────────────────
function tryGrip(): void {
  if (player.gripped) { doRelease(); return; }

  const angle = armAngleFree();
  const tipX  = player.x + Math.cos(angle) * ARM_LEN;
  const tipY  = player.y + Math.sin(angle) * ARM_LEN;

  for (const rock of ROCKS) {
    if (canGrip(tipX, tipY, rock)) {
      player.gripped = true;
      player.gripX   = tipX;
      player.gripY   = tipY;
      // Body angle from grip
      player.theta   = Math.atan2(player.y - tipY, player.x - tipX);
      player.omega   = 0;
      // Seed the grip-angle tracker so first delta is 0
      prevGripAngle  = Math.atan2(mouseWY - tipY, mouseWX - tipX);
      return;
    }
  }
}

function doRelease(): void {
  // Transfer rotational momentum → linear velocity on release.
  player.vx      = -Math.sin(player.theta) * player.omega * ARM_LEN;
  player.vy      =  Math.cos(player.theta) * player.omega * ARM_LEN;
  player.gripped = false;
}

// ─── Input listeners ─────────────────────────────────────────────────────────
canvas.addEventListener('mousemove', e => {
  setPointer(e.clientX, e.clientY);
});

canvas.addEventListener('mousedown', e => {
  if (gameState !== 'playing') return;
  setPointer(e.clientX, e.clientY);
  tryGrip();
});

canvas.addEventListener('mouseup', () => {
  if (gameState !== 'playing') return;
  if (player.gripped) doRelease();
});

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (gameState !== 'playing') return;
  const t = e.changedTouches[0];
  activeTouchId = t.identifier;
  setPointer(t.clientX, t.clientY);
  tryGrip();
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier === activeTouchId) {
      setPointer(t.clientX, t.clientY);
      break;
    }
  }
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === activeTouchId) {
      if (player.gripped) doRelease();
      activeTouchId = null;
      break;
    }
  }
}, { passive: false });

// ─── Score ───────────────────────────────────────────────────────────────────
let maxHeight = 0;  // meters above spawn

// ─── Rock body collision ─────────────────────────────────────────────────────
// Circle (player body, radius PLAYER_R) vs convex polygon (each rock).
//
// Strategy: find the closest point Q on the polygon boundary to the player
// centre P, then resolve depending on whether P is inside or outside:
//
//   Outside: push P along (P-Q) by (PLAYER_R - dist)
//   Inside : push P along (Q-P) by (dist + PLAYER_R), landing P just outside Q
//
// After position correction the outward normal is always (new_P - Q) / PLAYER_R,
// which we use to cancel the inward velocity component.

function resolveBodyVsRocks(): void {
  for (const rock of ROCKS) {
    const n = rock.verts.length;

    // Find closest point on rock boundary to player centre
    let minDist = Infinity;
    let cpx = 0, cpy = 0;

    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = rock.verts[j].x, ay = rock.verts[j].y;
      const bx = rock.verts[i].x, by = rock.verts[i].y;
      const edx = bx - ax, edy = by - ay;
      const len2 = edx * edx + edy * edy;
      const t  = len2 === 0 ? 0 : Math.max(0, Math.min(1,
                   ((player.x - ax) * edx + (player.y - ay) * edy) / len2));
      const cx2 = ax + t * edx;
      const cy2 = ay + t * edy;
      const d   = Math.hypot(player.x - cx2, player.y - cy2);
      if (d < minDist) { minDist = d; cpx = cx2; cpy = cy2; }
    }

    const inside = pointInPoly(player.x, player.y, rock.verts);
    if (!inside && minDist >= PLAYER_R) continue;  // no contact

    // Collision normal (outward from rock surface toward player after resolution)
    let outNx: number, outNy: number;

    if (inside) {
      // Player somehow inside rock — push through closest edge and out
      if (minDist < 0.001) {
        // Degenerate: just push straight up
        player.y -= PLAYER_R;
        outNx = 0; outNy = -1;
      } else {
        const nx = (cpx - player.x) / minDist;   // direction toward boundary
        const ny = (cpy - player.y) / minDist;
        player.x += nx * (minDist + PLAYER_R);   // past boundary by PLAYER_R
        player.y += ny * (minDist + PLAYER_R);
        outNx = nx; outNy = ny;                   // same direction = outward here
      }
    } else {
      // Outside but within PLAYER_R — push away from rock
      outNx = (player.x - cpx) / minDist;
      outNy = (player.y - cpy) / minDist;
      player.x += outNx * (PLAYER_R - minDist);
      player.y += outNy * (PLAYER_R - minDist);
    }

    // Velocity response
    if (!player.gripped) {
      // Cancel velocity component going into the surface, keep tangential
      const vDot = player.vx * outNx + player.vy * outNy;
      if (vDot < 0) {
        player.vx -= vDot * outNx;
        player.vy -= vDot * outNy;
        // Light friction
        player.vx *= 0.78;
        player.vy *= 0.78;
      }
    } else {
      // Gripped: position has changed so recompute theta to stay consistent
      player.theta = Math.atan2(player.y - player.gripY, player.x - player.gripX);
      // Dampen omega so the body doesn't bounce wildly against rock faces
      player.omega *= 0.6;
    }
  }
}

// ─── Physics update ──────────────────────────────────────────────────────────
function update(): void {
  if (player.gripped) {
    // ── Pendulum physics ────────────────────────────────────────────────────
    //
    // The grip anchor is fixed.  The body swings around it at radius r.
    // theta = angle from grip → body  (standard canvas coords, y down)
    //
    // Gravity torque derivation:
    //   position of body relative to grip: r = (cos θ, sin θ) · L
    //   gravity force: F = (0, g)
    //   torque  τ = r × F = cos(θ)·g  (2-D cross product)
    //   moment of inertia I = L²  →  α = τ/I = g·cos(θ)/L
    //
    // Mouse contribution: track how much the mouse has rotated around the
    // grip anchor each frame and add that as an angular impulse.
    //
    const pLen = ARM_LEN;

    const curGripAngle = Math.atan2(mouseWY - player.gripY, mouseWX - player.gripX);
    const dAngle       = wrapAngle(curGripAngle - prevGripAngle);
    player.omega      += dAngle * MOUSE_SENS;
    prevGripAngle      = curGripAngle;

    const alpha  = (GRAVITY / pLen) * Math.cos(player.theta);
    player.omega += alpha;
    player.omega *= ANG_DAMP;
    player.theta += player.omega;

    // Body position from grip + theta at current pendulum radius
    player.x = player.gripX + Math.cos(player.theta) * pLen;
    player.y = player.gripY + Math.sin(player.theta) * pLen;
  }

  if (!player.gripped) {
    // ── Free flight ─────────────────────────────────────────────────────────
    player.vy += GRAVITY;
    player.vx *= LIN_DAMP;
    player.vy *= LIN_DAMP;
    player.x  += player.vx;
    player.y  += player.vy;

    // ── Ground collision ────────────────────────────────────────────────────
    if (player.y + PLAYER_R >= GROUND_Y) {
      player.y  = GROUND_Y - PLAYER_R;
      player.vy = 0;
      player.vx *= 0.7;   // friction on landing
    }

  }

  // If gripped but body somehow below ground, push it up
  if (player.gripped && player.y + PLAYER_R > GROUND_Y) {
    player.y   = GROUND_Y - PLAYER_R;
    player.vy  = 0;
    player.omega = 0;
  }

  // ── Rock body collision ───────────────────────────────────────────────────
  resolveBodyVsRocks();

  // Track max height (positive metres above spawn)
  const h = Math.max(0, Math.round((200 - player.y) / 9));
  if (h > maxHeight) maxHeight = h;

  // Smooth camera follow
  camX += (player.x - camX) * 0.09;
  camY += (player.y - camY) * 0.09;
}

// ─── Rendering ───────────────────────────────────────────────────────────────
function drawGround(): void {
  const left  = w2s(-2000, GROUND_Y);
  const right = w2s( 2000, GROUND_Y);
  const screenY = left.y;

  // Fill below ground
  ctx.fillStyle = '#0d0b08';
  ctx.fillRect(0, screenY, canvas.width, canvas.height - screenY);

  // Ground surface line
  ctx.beginPath();
  ctx.moveTo(0, screenY);
  ctx.lineTo(canvas.width, screenY);
  ctx.strokeStyle = '#4b5563';
  ctx.lineWidth   = 3;
  ctx.stroke();

  // Stone texture strip just below surface
  const stripeH = 22;
  const stripeG = ctx.createLinearGradient(0, screenY, 0, screenY + stripeH);
  stripeG.addColorStop(0, '#374151');
  stripeG.addColorStop(1, '#1f2937');
  ctx.fillStyle = stripeG;
  ctx.fillRect(0, screenY, canvas.width, stripeH);

  // Deterministic pebble marks along the surface
  for (let wx = -2000; wx < 2000; wx += 120) {
    const s = w2s(wx, GROUND_Y - 4);
    if (s.x < -10 || s.x > canvas.width + 10) continue;
    const r = 3 + ((Math.abs(wx * 7 + 13)) % 5);
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#4b5563';
    ctx.fill();
  }

  // Suppress unused warning
  void right;
}

function drawBackground(): void {
  // Gradient from deep cave (bottom) to open sky (top)
  const top = w2s(0, -1200);
  const bot = w2s(0,  400);
  const grad = ctx.createLinearGradient(0, top.y, 0, bot.y);
  grad.addColorStop(0,   '#0d1525');
  grad.addColorStop(0.5, '#0a0a0f');
  grad.addColorStop(1,   '#0f0d09');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawRock(rock: Rock): void {
  const sv = rock.verts.map(v => w2s(v.x, v.y));
  const sc = w2s(rock.cx, rock.cy);

  ctx.beginPath();
  ctx.moveTo(sv[0].x, sv[0].y);
  for (let i = 1; i < sv.length; i++) ctx.lineTo(sv[i].x, sv[i].y);
  ctx.closePath();

  // Radial gradient: lighter on top-left, darker on bottom-right
  const g = ctx.createRadialGradient(sc.x - 22, sc.y - 22, 6, sc.x, sc.y, 115);
  g.addColorStop(0,   '#6b7280');
  g.addColorStop(0.5, '#374151');
  g.addColorStop(1,   '#111827');
  ctx.fillStyle = g;
  ctx.fill();

  // Edge highlight
  ctx.strokeStyle = '#4b5563';
  ctx.lineWidth   = 2;
  ctx.stroke();

  // Deterministic cracks (never Math.random in render)
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,0.38)';
  ctx.lineWidth   = 1;
  for (let i = 0; i < 3; i++) {
    const a   = (i * 2.094 + rock.cx * 0.013 + rock.cy * 0.007) % (Math.PI * 2);
    const len = 16 + ((i * 13 + Math.abs(rock.cx * 0.4 + rock.cy * 0.3)) % 24);
    ctx.beginPath();
    ctx.moveTo(sc.x, sc.y);
    ctx.lineTo(sc.x + Math.cos(a) * len, sc.y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPlayer(): void {
  const armAngle = player.gripped
    ? Math.atan2(player.gripY - player.y, player.gripX - player.x)
    : armAngleFree();

  const tipWX = player.gripped ? player.gripX : player.x + Math.cos(armAngle) * ARM_LEN;
  const tipWY = player.gripped ? player.gripY : player.y + Math.sin(armAngle) * ARM_LEN;

  const bs = w2s(player.x,  player.y);
  const ts = w2s(tipWX, tipWY);

  // ── Stone slab the figure sits on ──
  ctx.save();
  ctx.translate(bs.x, bs.y + 16);
  ctx.beginPath();
  ctx.ellipse(0, 0, 24, 7, 0, 0, Math.PI * 2);
  const slabG = ctx.createLinearGradient(-24, 0, 24, 0);
  slabG.addColorStop(0, '#4b5563');
  slabG.addColorStop(1, '#1f2937');
  ctx.fillStyle = slabG;
  ctx.fill();
  ctx.strokeStyle = '#374151';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // ── Pickaxe handle ──
  ctx.beginPath();
  ctx.moveTo(bs.x, bs.y);
  ctx.lineTo(ts.x, ts.y);
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth   = 5;
  ctx.lineCap     = 'round';
  ctx.stroke();

  // ── Pickaxe head ──
  ctx.save();
  ctx.translate(ts.x, ts.y);
  ctx.rotate(armAngle);
  ctx.beginPath();
  ctx.moveTo( 14,  0);
  ctx.lineTo(  5, -7);
  ctx.lineTo(-13, -4);
  ctx.lineTo(-13,  4);
  ctx.lineTo(  5,  7);
  ctx.closePath();
  const hg = ctx.createLinearGradient(-13, 0, 14, 0);
  hg.addColorStop(0, '#6b7280');
  hg.addColorStop(1, '#e5e7eb');
  ctx.fillStyle   = hg;
  ctx.fill();
  ctx.strokeStyle = '#374151';
  ctx.lineWidth   = 1;
  ctx.stroke();
  ctx.restore();

  // ── Body (stone climber) ──
  ctx.beginPath();
  ctx.arc(bs.x, bs.y, 16, 0, Math.PI * 2);
  const bg = ctx.createRadialGradient(bs.x - 5, bs.y - 5, 2, bs.x, bs.y, 16);
  bg.addColorStop(0, '#78563d');
  bg.addColorStop(1, '#2d1f14');
  ctx.fillStyle   = bg;
  ctx.fill();
  ctx.strokeStyle = '#5a3e28';
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  // ── Eyes (face toward arm direction) ──
  const perp = armAngle + Math.PI / 2;
  const ex   = Math.cos(armAngle) * 5;
  const ey   = Math.sin(armAngle) * 5;
  const px   = Math.cos(perp) * 3.5;
  const py   = Math.sin(perp) * 3.5;
  ctx.fillStyle = '#c8a96e';
  ctx.beginPath();
  ctx.arc(bs.x + ex + px, bs.y + ey + py, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(bs.x + ex - px, bs.y + ey - py, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // ── Grip indicator (gold glow at anchor) ──
  if (player.gripped) {
    const gs = w2s(player.gripX, player.gripY);
    ctx.beginPath();
    ctx.arc(gs.x, gs.y, 8, 0, Math.PI * 2);
    ctx.fillStyle   = 'rgba(251,191,36,0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(251,191,36,0.35)';
    ctx.lineWidth   = 5;
    ctx.stroke();
  }
}

function drawHUD(): void {
  // Height box
  const bx = canvas.width / 2 - 62, by = 52, bw = 124, bh = 42;
  ctx.fillStyle   = 'rgba(5,4,2,0.72)';
  ctx.strokeStyle = 'rgba(200,169,110,0.25)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.rect(bx, by, bw, bh);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#c8a96e';
  ctx.font      = 'bold 22px Cinzel, serif';
  ctx.fillText(maxHeight + 'm', canvas.width / 2, by + 28);
  ctx.fillStyle = '#5a4a2a';
  ctx.font      = '9px Cinzel, serif';
  ctx.fillText('ALTITUDE', canvas.width / 2, by + 40);

  // Control hint (fade after 5 s)
  if (hintAlpha > 0) {
    ctx.globalAlpha = hintAlpha;
    ctx.fillStyle   = 'rgba(200,169,110,0.85)';
    ctx.font        = '13px Cinzel, serif';
    const isTouch   = window.matchMedia('(pointer: coarse)').matches;
    const hint      = isTouch ? 'Drag to aim  •  Tap to grip / release' : 'Move mouse to aim  •  Click to grip / release';
    ctx.fillText(hint, canvas.width / 2, canvas.height - 36);
    ctx.globalAlpha = 1;
  }
}

// ─── Hint fade ───────────────────────────────────────────────────────────────
let hintAlpha  = 1;
const HINT_DURATION  = 300; // frames (~5 s at 60 fps)
let   hintFrame      = 0;

function tickHint(): void {
  hintFrame++;
  if (hintFrame > HINT_DURATION - 60) {
    hintAlpha = Math.max(0, hintAlpha - 1 / 60);
  }
}

// ─── Quit / return to menu ───────────────────────────────────────────────────
const quitScreen    = document.getElementById('quit-screen')!;
const finalHeight   = document.getElementById('final-height')!;
const playAgainBtn  = document.getElementById('play-again-btn')!;

quitBtn.addEventListener('click', () => {
  gameState = 'start';
  finalHeight.textContent = String(maxHeight);
  hud.classList.add('hidden');
  settingsBtn.classList.add('hidden');
  quitBtn.classList.add('hidden');
  if (activeMode === 2) stopPhaserGame();
  quitScreen.classList.remove('hidden');
});

playAgainBtn.addEventListener('click', () => {
  quitScreen.classList.add('hidden');
  startScreen.classList.remove('hidden');
});

// ─── Main loop ───────────────────────────────────────────────────────────────
function loop(): void {
  if (gameState === 'playing' && activeMode === 1) {
    update();
    tickHint();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawGround();
    ROCKS.forEach(drawRock);
    drawPlayer();
    drawHUD();
  }

  requestAnimationFrame(loop);
}

loop();
