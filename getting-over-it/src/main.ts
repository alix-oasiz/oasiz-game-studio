// Stone Ascent – POC
// Player with pendulum physics + rock obstacles to prove the core mechanic.

import { launchPhaserGame, destroyPhaserGame, setAltitudeCallback as setPhaserAltCb } from './phaser-mode';
import { launchBox2DGame, destroyBox2DGame, setAltitudeCallback as setBox2DAltCb } from './box2d-mode';

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
let activeMode: 1 | 2 | 3 = 1;
let phaserGame: ReturnType<typeof launchPhaserGame> | null = null;
let box2dGame: Phaser.Game | null = null;

// ─── UI elements ─────────────────────────────────────────────────────────────
const startScreen      = document.getElementById('start-screen')!;
const physics1Btn      = document.getElementById('physics1-btn')!;
const physics2Btn      = document.getElementById('physics2-btn')!;
const physics3Btn      = document.getElementById('physics3-btn')!;
const hud              = document.getElementById('hud')!;
const settingsBtn      = document.getElementById('settings-btn')!;
const quitBtn          = document.getElementById('quit-btn')!;
const phaserContainer  = document.getElementById('phaser-container')!;

function startVanillaGame(): void {
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

function startMatterJSGame(): void {
  activeMode     = 2;
  gameState      = 'playing';
  startScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  settingsBtn.classList.remove('hidden');
  quitBtn.classList.remove('hidden');
  canvas.style.display = 'none';
  phaserContainer.classList.remove('hidden');
  setPhaserAltCb((meters) => { maxHeight = meters; });
  phaserGame = launchPhaserGame(phaserContainer);
}

function stopMatterJSGame(): void {
  if (phaserGame) {
    destroyPhaserGame(phaserGame);
    phaserGame = null;
  }
  phaserContainer.classList.add('hidden');
  canvas.style.display = 'block';
}

function startBox2DGame(): void {
  activeMode     = 3;
  gameState      = 'playing';
  startScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  settingsBtn.classList.remove('hidden');
  quitBtn.classList.remove('hidden');
  maxHeight      = 0;
  canvas.style.display = 'none';
  phaserContainer.classList.remove('hidden');
  setBox2DAltCb((meters) => { maxHeight = meters; });
  box2dGame = launchBox2DGame(phaserContainer);
}

function stopBox2DGame(): void {
  if (box2dGame) {
    destroyBox2DGame(box2dGame);
    box2dGame = null;
  }
  phaserContainer.classList.add('hidden');
  canvas.style.display = 'block';
}

physics1Btn.addEventListener('click', () => startVanillaGame());
physics2Btn.addEventListener('click', () => startMatterJSGame());
physics3Btn.addEventListener('click', () => startBox2DGame());

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

  // Check rocks
  for (const rock of ROCKS) {
    if (canGrip(tipX, tipY, rock)) {
      player.gripped = true;
      player.gripX   = tipX;
      player.gripY   = tipY;
      player.theta   = Math.atan2(player.y - tipY, player.x - tipX);
      player.omega   = 0;
      prevGripAngle  = Math.atan2(mouseWY - tipY, mouseWX - tipX);
      return;
    }
  }

  // Check ground surface — can hook toothpick into the counter top
  if (Math.abs(tipY - GROUND_Y) < GRIP_RADIUS) {
    player.gripped = true;
    player.gripX   = tipX;
    player.gripY   = GROUND_Y;
    player.theta   = Math.atan2(player.y - GROUND_Y, player.x - tipX);
    player.omega   = 0;
    prevGripAngle  = Math.atan2(mouseWY - GROUND_Y, mouseWX - tipX);
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
  const screenY = w2s(0, GROUND_Y).y;

  // Wooden counter fill
  ctx.fillStyle = '#7C4A1E';
  ctx.fillRect(0, screenY, canvas.width, canvas.height - screenY);

  // Wood grain streaks
  ctx.strokeStyle = 'rgba(94,52,16,0.55)';
  ctx.lineWidth   = 1;
  for (let g = 0; g < canvas.height - screenY; g += 20) {
    ctx.beginPath();
    ctx.moveTo(0,            screenY + g);
    ctx.lineTo(canvas.width, screenY + g + 3);
    ctx.stroke();
  }

  // Countertop lip
  ctx.fillStyle = '#9A6132';
  ctx.fillRect(0, screenY - 7, canvas.width, 10);
  ctx.strokeStyle = '#5C3011';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(0, screenY - 7); ctx.lineTo(canvas.width, screenY - 7); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, screenY + 3); ctx.lineTo(canvas.width, screenY + 3); ctx.stroke();
}

function drawBackground(): void {
  // Kitchen wall — cream background with tile grid
  ctx.fillStyle = '#FFFbF0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const TILE = 64;
  const ox = ((-camX % TILE) + TILE) % TILE + canvas.width * 0.5;
  const oy = ((-camY % TILE) + TILE) % TILE + canvas.height * 0.62;
  ctx.strokeStyle = 'rgba(226,216,200,0.9)';
  ctx.lineWidth   = 1;
  for (let tx = ox % TILE; tx < canvas.width  + TILE; tx += TILE) {
    ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx, canvas.height); ctx.stroke();
  }
  for (let ty = oy % TILE; ty < canvas.height + TILE; ty += TILE) {
    ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(canvas.width, ty); ctx.stroke();
  }
}

function drawKitchenItemCanvas(
  cx: number, cy: number,
  w: number, h: number,
  kind: string,
): void {
  const rw = w / 2, rh = h / 2;
  const sz = Math.min(rw, rh);
  ctx.save();
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'plate': {
      const r = sz * 0.88;
      ctx.globalAlpha = 0.08; ctx.fillStyle = '#000000';
      ctx.beginPath(); ctx.ellipse(cx + 4, cy + 5, r * 1.1, r * 0.225, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = '#F8F8F4';
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1D4ED8'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#2563EB'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.76, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#93C5FD'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.48, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.ellipse(cx - r * 0.28, cy - r * 0.3, r * 0.26, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'platter': {
      const pW = rw * 0.9, pH = rh * 0.76;
      ctx.globalAlpha = 0.1; ctx.fillStyle = '#000000';
      ctx.beginPath(); ctx.ellipse(cx + 4, cy + 6, pW * 1.1, pH * 0.225, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = '#D4AF37';
      ctx.beginPath(); ctx.ellipse(cx, cy, pW, pH, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FAF0DC';
      ctx.beginPath(); ctx.ellipse(cx, cy, pW * 0.86, pH * 0.86, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#C9A227'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(cx, cy, pW, pH, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#D4AF37'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(cx, cy, pW * 0.86, pH * 0.86, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.45; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(cx, cy, pW * 0.375, pH * 0.375, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.38; ctx.fillStyle = '#FFEE88';
      ctx.beginPath(); ctx.ellipse(cx - pW * 0.24, cy - pH * 0.28, pW * 0.24, pH * 0.14, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'bowl': {
      const bw = rw * 0.88, bh = rh * 0.82;
      ctx.globalAlpha = 1; ctx.fillStyle = '#FEF3C7';
      ctx.beginPath();
      ctx.moveTo(cx - bw, cy - bh * 0.15);
      ctx.lineTo(cx + bw, cy - bh * 0.15);
      ctx.lineTo(cx + bw * 0.52, cy + bh);
      ctx.lineTo(cx - bw * 0.52, cy + bh);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#D97706'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - bw, cy - bh * 0.15);
      ctx.lineTo(cx + bw, cy - bh * 0.15);
      ctx.lineTo(cx + bw * 0.52, cy + bh);
      ctx.lineTo(cx - bw * 0.52, cy + bh);
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle = '#FFF8E0';
      ctx.beginPath(); ctx.ellipse(cx, cy - bh * 0.15, bw, bh * 0.23, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#D97706'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, cy - bh * 0.15, bw, bh * 0.23, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.4; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(cx, cy - bh * 0.15, bw * 0.65, bh * 0.14, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.45; ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.ellipse(cx - bw * 0.3, cy, bw * 0.225, bh * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'pot': {
      const pw = rw * 0.74, ph = rh * 0.78;
      ctx.globalAlpha = 1; ctx.fillStyle = '#4B5563';
      ctx.beginPath(); ctx.roundRect(cx - pw - 15, cy - 8, 16, 16, 3); ctx.fill();
      ctx.beginPath(); ctx.roundRect(cx + pw - 1,  cy - 8, 16, 16, 3); ctx.fill();
      ctx.strokeStyle = '#6B7280'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(cx - pw - 15, cy - 8, 16, 16, 3); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(cx + pw - 1,  cy - 8, 16, 16, 3); ctx.stroke();
      ctx.fillStyle = '#374151';
      ctx.beginPath(); ctx.roundRect(cx - pw, cy - ph, pw * 2, ph * 1.85, 7); ctx.fill();
      ctx.strokeStyle = '#6B7280'; ctx.lineWidth = 2; ctx.globalAlpha = 0.38;
      ctx.beginPath(); ctx.moveTo(cx - pw * 0.42, cy - ph * 0.82); ctx.lineTo(cx - pw * 0.42, cy + ph * 0.75); ctx.stroke();
      ctx.strokeStyle = '#9CA3AF'; ctx.lineWidth = 1; ctx.globalAlpha = 0.22;
      ctx.beginPath(); ctx.moveTo(cx + pw * 0.12, cy - ph * 0.82); ctx.lineTo(cx + pw * 0.12, cy + ph * 0.75); ctx.stroke();
      ctx.globalAlpha = 1; ctx.strokeStyle = '#6B7280'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(cx - pw, cy - ph, pw * 2, ph * 1.85, 7); ctx.stroke();
      ctx.fillStyle = '#4B5563';
      ctx.beginPath(); ctx.roundRect(cx - pw * 1.1, cy - ph - 13, pw * 2.2, 14, 4); ctx.fill();
      ctx.strokeStyle = '#374151'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(cx - pw * 1.1, cy - ph - 13, pw * 2.2, 14, 4); ctx.stroke();
      ctx.fillStyle = '#9CA3AF';
      ctx.beginPath(); ctx.arc(cx, cy - ph - 20, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6B7280'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy - ph - 20, 6, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'board': {
      const bw = rw * 0.88, bh = rh * 0.88;
      ctx.globalAlpha = 1; ctx.fillStyle = '#A07040';
      ctx.beginPath(); ctx.roundRect(cx - bw, cy - bh, bw * 2, bh * 2, 9); ctx.fill();
      ctx.strokeStyle = '#7A5030'; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.48;
      for (let gy2 = cy - bh * 0.78; gy2 <= cy + bh * 0.78; gy2 += 9) {
        ctx.beginPath(); ctx.moveTo(cx - bw * 0.86, gy2); ctx.lineTo(cx + bw * 0.86, gy2 + 2); ctx.stroke();
      }
      ctx.strokeStyle = '#5C3A1A'; ctx.lineWidth = 1; ctx.globalAlpha = 0.28;
      ctx.beginPath(); ctx.moveTo(cx - bw * 0.55, cy - bh * 0.78); ctx.lineTo(cx - bw * 0.55, cy + bh * 0.78); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + bw * 0.28, cy - bh * 0.78); ctx.lineTo(cx + bw * 0.28, cy + bh * 0.78); ctx.stroke();
      ctx.globalAlpha = 1; ctx.strokeStyle = '#7A5230'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect(cx - bw, cy - bh, bw * 2, bh * 2, 9); ctx.stroke();
      ctx.fillStyle = '#4A2C0A';
      ctx.beginPath(); ctx.arc(cx + bw * 0.68, cy - bh * 0.68, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7A5230'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx + bw * 0.68, cy - bh * 0.68, 5.5, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.32; ctx.fillStyle = '#C09060';
      ctx.beginPath(); ctx.ellipse(cx - bw * 0.2, cy - bh * 0.4, bw * 0.25, bh * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'mug': {
      const mw = sz * 0.72, mh = sz * 0.88;
      ctx.globalAlpha = 1; ctx.strokeStyle = '#A02020'; ctx.lineWidth = 4.5;
      ctx.beginPath(); ctx.ellipse(cx + mw + 13, cy + 2, 11, mh * 0.525, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#D95040';
      ctx.beginPath();
      ctx.moveTo(cx - mw, cy - mh);
      ctx.lineTo(cx + mw, cy - mh);
      ctx.lineTo(cx + mw * 0.9, cy + mh);
      ctx.lineTo(cx - mw * 0.9, cy + mh);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#7F1D1D'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - mw, cy - mh);
      ctx.lineTo(cx + mw, cy - mh);
      ctx.lineTo(cx + mw * 0.9, cy + mh);
      ctx.lineTo(cx - mw * 0.9, cy + mh);
      ctx.closePath(); ctx.stroke();
      ctx.fillStyle = '#E06050';
      ctx.beginPath(); ctx.ellipse(cx, cy - mh, mw, mh * 0.19, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7F1D1D'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, cy - mh, mw, mh * 0.19, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.75; ctx.fillStyle = '#3A1800';
      ctx.beginPath(); ctx.ellipse(cx, cy - mh, mw * 0.725, mh * 0.125, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.48; ctx.strokeStyle = '#FF9080'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(cx - mw * 0.65, cy - mh * 0.7); ctx.lineTo(cx - mw * 0.65, cy + mh * 0.55); ctx.stroke();
      break;
    }
    case 'pan': {
      const pr = sz * 0.78;
      const hl = Math.max(rw, rh) * 0.88;
      ctx.globalAlpha = 1; ctx.fillStyle = '#2D3748';
      ctx.beginPath(); ctx.roundRect(cx + pr * 0.75, cy - 7.5, hl - pr * 0.75, 15, 5); ctx.fill();
      ctx.strokeStyle = '#4B5563'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(cx + pr * 0.75, cy - 7.5, hl - pr * 0.75, 15, 5); ctx.stroke();
      ctx.fillStyle = '#718096';
      ctx.beginPath(); ctx.arc(cx + pr * 0.75 + 9,  cy, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + pr * 0.75 + 21, cy, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#4A5568'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx + pr * 0.75 + 9,  cy, 3.5, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + pr * 0.75 + 21, cy, 3.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#1F2937';
      ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2D3748';
      ctx.beginPath(); ctx.arc(cx, cy, pr * 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.strokeStyle = '#4B5563'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, pr * 0.55, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.4; ctx.fillStyle = '#718096';
      ctx.beginPath(); ctx.ellipse(cx - pr * 0.25, cy - pr * 0.28, pr * 0.19, pr * 0.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = '#6B7280'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'knife': {
      const kl = rw * 0.9, kh = rh * 0.68;
      const handleRatio = 0.32;
      const bladeEnd = cx - kl;
      const bolsterX = cx + kl * (1 - handleRatio * 2);
      ctx.globalAlpha = 1; ctx.fillStyle = '#D8D8E4';
      ctx.beginPath();
      ctx.moveTo(bladeEnd, cy);
      ctx.lineTo(bolsterX, cy - kh);
      ctx.lineTo(bolsterX, cy + kh * 0.6);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#A0A0B0'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bladeEnd, cy);
      ctx.lineTo(bolsterX, cy - kh);
      ctx.lineTo(bolsterX, cy + kh * 0.6);
      ctx.closePath(); ctx.stroke();
      ctx.globalAlpha = 0.65; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(bladeEnd + 12, cy - kh * 0.28); ctx.lineTo(bolsterX - 8, cy - kh * 0.55); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = '#7A8090';
      ctx.fillRect(bolsterX - 2, cy - kh, 7, kh * 1.6);
      ctx.strokeStyle = '#5A6070'; ctx.lineWidth = 1;
      ctx.strokeRect(bolsterX - 2, cy - kh, 7, kh * 1.6);
      ctx.fillStyle = '#7C5C3A';
      ctx.beginPath(); ctx.roundRect(bolsterX + 5, cy - kh * 0.82, kl * handleRatio * 2 - 5, kh * 1.64, 4); ctx.fill();
      ctx.strokeStyle = '#5A3E22'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(bolsterX + 5, cy - kh * 0.82, kl * handleRatio * 2 - 5, kh * 1.64, 4); ctx.stroke();
      ctx.fillStyle = '#AAAAAA';
      ctx.beginPath(); ctx.arc(bolsterX + 14, cy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(bolsterX + 26, cy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#888888'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(bolsterX + 14, cy, 3, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(bolsterX + 26, cy, 3, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'spoon': {
      const sl  = rw * 0.9;
      const sbr = rh * 0.72;
      const bowlCX    = cx + sl - sbr;
      const handleEnd = cx - sl;
      ctx.globalAlpha = 1; ctx.fillStyle = '#C8905A';
      ctx.beginPath(); ctx.roundRect(handleEnd, cy - rh * 0.18, sl * 1.22, rh * 0.36, 5); ctx.fill();
      ctx.strokeStyle = '#8B6035'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(handleEnd, cy - rh * 0.18, sl * 1.22, rh * 0.36, 5); ctx.stroke();
      ctx.fillStyle = '#BD8A50';
      ctx.beginPath();
      ctx.moveTo(cx + sl * 0.2, cy - rh * 0.18);
      ctx.lineTo(cx + sl * 0.2, cy + rh * 0.18);
      ctx.lineTo(bowlCX - sbr * 0.5, cy + sbr * 0.62);
      ctx.lineTo(bowlCX - sbr * 0.5, cy - sbr * 0.62);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#C8905A';
      ctx.beginPath(); ctx.ellipse(bowlCX, cy, sbr, sbr * 0.69, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8B6035'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(bowlCX, cy, sbr, sbr * 0.69, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.6; ctx.fillStyle = '#E8B878';
      ctx.beginPath(); ctx.ellipse(bowlCX - sbr * 0.22, cy - sbr * 0.18, sbr * 0.425, sbr * 0.25, 0, 0, Math.PI * 2); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

function drawRock(rock: Rock, ri: number): void {
  const sv     = rock.verts.map(v => w2s(v.x, v.y));
  const sc     = w2s(rock.cx, rock.cy);
  const svMinX = Math.min(...sv.map(p => p.x));
  const svMaxX = Math.max(...sv.map(p => p.x));
  const svMinY = Math.min(...sv.map(p => p.y));
  const svMaxY = Math.max(...sv.map(p => p.y));

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

  drawKitchenItemCanvas(sc.x, sc.y, svMaxX - svMinX, svMaxY - svMinY, kind);
}

// ── Hand helper (Hand.cs port, canvas) ───────────────────────────────────────
function drawTomatoHandCanvas(
  sx: number, sy: number,
  hx: number, hy: number,
  isRight: boolean,
): void {
  const dx   = hx - sx;
  const dy   = hy - sy;
  const dist = Math.hypot(dx, dy) || 1;

  const ux = dx / dist, uy = dy / dist;
  const px = -uy,       py =  ux;

  const ARM_MAX  = (PLAYER_R + 5) * 2.6;
  const armLen   = Math.min(dist, ARM_MAX);
  const ax = sx + ux * armLen;
  const ay = sy + uy * armLen;

  const open     = Math.min(1, dist / 90);
  const flip     = isRight ? (dy >= 0) : (dy < 0);
  const flipSign = flip ? -1 : 1;

  // Arm
  ctx.strokeStyle = '#C53030';
  ctx.lineWidth   = 3.5;
  ctx.lineCap     = 'round';
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ax, ay); ctx.stroke();

  // Palm
  ctx.fillStyle   = '#E53E3E';
  ctx.beginPath(); ctx.arc(ax, ay, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#B91C1C'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(ax, ay, 5.5, 0, Math.PI * 2); ctx.stroke();

  // Fingers
  const lateralStep = (3 + open * 4) * flipSign;
  const fwdBase     = 7 + open * 5;
  for (const lat of [-1, 0, 1]) {
    const lw  = lat * lateralStep;
    const fwd = fwdBase - Math.abs(lat) * 1.5;
    const fx2 = ax + ux * fwd + px * lw;
    const fy2 = ay + uy * fwd + py * lw;
    ctx.strokeStyle = '#C53030'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(ax + px * lw * 0.3, ay + py * lw * 0.3);
    ctx.lineTo(fx2, fy2); ctx.stroke();
    ctx.fillStyle = '#E53E3E';
    ctx.beginPath(); ctx.arc(fx2, fy2, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#B91C1C'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(fx2, fy2, 3.5, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawPlayer(): void {
  const armAngle = player.gripped
    ? Math.atan2(player.gripY - player.y, player.gripX - player.x)
    : armAngleFree();

  const tipWX = player.gripped ? player.gripX : player.x + Math.cos(armAngle) * ARM_LEN;
  const tipWY = player.gripped ? player.gripY : player.y + Math.sin(armAngle) * ARM_LEN;

  const bs  = w2s(player.x, player.y);
  const ts  = w2s(tipWX, tipWY);
  const TR  = PLAYER_R + 5;

  // ── Hands (draw behind toothpick) ──
  const sOff = TR * 0.65;
  drawTomatoHandCanvas(bs.x - sOff, bs.y + 3, ts.x, ts.y, false);
  drawTomatoHandCanvas(bs.x + sOff, bs.y + 3, ts.x, ts.y, true);

  // ── Toothpick ──
  const tSrcX = bs.x + Math.cos(armAngle) * TR;
  const tSrcY = bs.y + Math.sin(armAngle) * TR;
  ctx.beginPath();
  ctx.moveTo(tSrcX, tSrcY);
  ctx.lineTo(ts.x,  ts.y);
  ctx.strokeStyle = '#D4A574';
  ctx.lineWidth   = 3;
  ctx.lineCap     = 'round';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tSrcX + 1, tSrcY + 1);
  ctx.lineTo(ts.x  + 1, ts.y  + 1);
  ctx.strokeStyle = 'rgba(176,128,64,0.6)';
  ctx.lineWidth   = 1;
  ctx.stroke();
  // Pointed tip
  const tipX = ts.x + Math.cos(armAngle) * 7;
  const tipY = ts.y + Math.sin(armAngle) * 7;
  ctx.beginPath();
  ctx.moveTo(ts.x + Math.cos(armAngle - 1.3) * 3, ts.y + Math.sin(armAngle - 1.3) * 3);
  ctx.lineTo(ts.x + Math.cos(armAngle + 1.3) * 3, ts.y + Math.sin(armAngle + 1.3) * 3);
  ctx.lineTo(tipX, tipY);
  ctx.closePath();
  ctx.fillStyle = '#A06828';
  ctx.fill();

  // ── Grip glow when hooked ──
  if (player.gripped) {
    const gs = w2s(player.gripX, player.gripY);
    ctx.beginPath();
    ctx.arc(gs.x, gs.y, 16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(254,240,138,0.35)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(gs.x, gs.y, 20, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(234,179,8,0.55)';
    ctx.lineWidth   = 1;
    ctx.stroke();
  }

  // ── Drop shadow ──
  ctx.beginPath();
  ctx.ellipse(bs.x + 4, bs.y + TR + 1, TR * 1.2, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fill();

  // ── Tomato body ──
  ctx.beginPath();
  ctx.arc(bs.x, bs.y, TR, 0, Math.PI * 2);
  ctx.fillStyle = '#E53E3E';
  ctx.fill();

  // Bottom shading
  ctx.beginPath();
  ctx.ellipse(bs.x, bs.y + TR * 0.3, TR, TR * 0.7, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(185,28,28,0.28)';
  ctx.fill();

  // Vertical ribs
  ctx.strokeStyle = 'rgba(197,48,48,0.35)';
  ctx.lineWidth   = 1.5;
  for (let rib = -1; rib <= 1; rib++) {
    const rx2 = bs.x + rib * (TR * 0.44);
    ctx.beginPath();
    ctx.moveTo(rx2, bs.y - TR + 5);
    ctx.lineTo(rx2, bs.y + TR - 5);
    ctx.stroke();
  }

  // Specular highlight
  ctx.beginPath();
  ctx.arc(bs.x - TR * 0.32, bs.y - TR * 0.32, TR * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,128,128,0.5)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(bs.x - TR * 0.36, bs.y - TR * 0.36, TR * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fill();

  // Outline
  ctx.beginPath();
  ctx.arc(bs.x, bs.y, TR, 0, Math.PI * 2);
  ctx.strokeStyle = '#B91C1C';
  ctx.lineWidth   = 2;
  ctx.stroke();

  // ── Calyx leaves ──
  const leafCx = bs.x, leafCy = bs.y - TR + 2;
  ctx.fillStyle = '#16A34A';
  for (let li = 0; li < 5; li++) {
    const la  = (li / 5) * Math.PI * 2 - Math.PI / 2;
    const lx1 = leafCx + Math.cos(la - 0.35) * 4;
    const ly1 = leafCy + Math.sin(la - 0.35) * 4;
    const lx2 = leafCx + Math.cos(la + 0.35) * 4;
    const ly2 = leafCy + Math.sin(la + 0.35) * 4;
    const ltx = leafCx + Math.cos(la) * 11;
    const lty = leafCy + Math.sin(la) * 8;
    ctx.beginPath();
    ctx.moveTo(lx1, ly1);
    ctx.lineTo(lx2, ly2);
    ctx.lineTo(ltx, lty);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#15803D';
  ctx.fillRect(leafCx - 1.5, leafCy - 9, 3, 9);

  // ── Face ──
  const facing  = mouseWX >= player.x ? 1 : -1;
  const eyeOffX = 6 * facing;
  const eyeY    = bs.y - 4;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(bs.x + eyeOffX,       eyeY, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(bs.x - eyeOffX * 0.5, eyeY, 3,   0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1A0000';
  ctx.beginPath(); ctx.arc(bs.x + eyeOffX       + facing * 0.8, eyeY, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(bs.x - eyeOffX * 0.5 + facing * 0.8, eyeY, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#7F1D1D';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(bs.x - 5, bs.y + 6);
  ctx.lineTo(bs.x - 1, bs.y + 8);
  ctx.lineTo(bs.x + 5, bs.y + 6);
  ctx.stroke();
}

function drawHUD(): void {
  // Height box — kitchen cream card
  const bx = canvas.width / 2 - 62, by = 52, bw = 124, bh = 42;
  ctx.fillStyle   = 'rgba(255,251,240,0.88)';
  ctx.strokeStyle = 'rgba(229,62,62,0.4)';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.rect(bx, by, bw, bh);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#B91C1C';
  ctx.font      = 'bold 22px Cinzel, serif';
  ctx.fillText(maxHeight + 'm', canvas.width / 2, by + 28);
  ctx.fillStyle = '#9A6132';
  ctx.font      = '9px Cinzel, serif';
  ctx.fillText('ALTITUDE', canvas.width / 2, by + 40);

  // Control hint (fade after 5 s)
  if (hintAlpha > 0) {
    ctx.globalAlpha = hintAlpha;
    ctx.fillStyle   = 'rgba(185,28,28,0.85)';
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
  if (activeMode === 2) stopMatterJSGame();
  else if (activeMode === 3) stopBox2DGame();
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
    ROCKS.forEach((rock, i) => drawRock(rock, i));
    drawPlayer();
    drawHUD();
  }

  requestAnimationFrame(loop);
}

loop();
