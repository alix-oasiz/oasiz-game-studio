// Stone Ascent – Phaser Mode (Hammer Physics)
// Force-based hammer system matching PlayerControl.cs from Unity reference.
// The hammer does NOT attach to rocks. When the hammer overlaps a rock,
// a spring force pushes the player body. Only input: move the mouse.
//
// Visual reference:
//   Hand.cs  — two hands rotate toward hammer handle, stretch with distance
//   Head.cs  — head looks toward mouse (±30° clamp), random blinking
//   PlayerControl.cs — force = (hammerPos - mouseVec - bodyPos) * 80

import Phaser from 'phaser';

// ─── Constants ──────────────────────────────────────────────────────────────
const MAX_RANGE   = 150;     // max mouse offset px (Unity: maxRange=2.0)
const FORCE_MULT  = 0.002;   // spring force multiplier (Unity: 80, scaled for Matter.js)
const MAX_SPEED   = 8;       // velocity clamp (Unity: 6, slightly higher for pixel scale)
const LERP        = 0.2;     // hammer lerp toward target (same as Unity)
const BODY_R      = 18;      // player body radius
const HEAD_R      = 12;      // head radius
const HAND_R      = 5;       // hand circle radius
const HAMMER_R    = 14;      // hammer head collision check radius
const GROUND_Y    = 580;     // world Y of ground floor
const SPAWN_X     = 400;
const SPAWN_Y     = 500;
const WORLD_W     = 800;
const WORLD_H     = 4000;

// ─── Deterministic pseudo-random ────────────────────────────────────────────
function seeded(s: number): number {
  const x = Math.sin(s * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ─── Rock polygon generation (same technique as Classic mode's makeRock) ────
interface RockData {
  cx: number;
  cy: number;
  verts: { x: number; y: number }[];  // world-space vertices (convex, wound CCW)
}

function generateRock(
  cx: number, cy: number,
  rx: number, ry: number,
  n: number, seed: number,
): RockData {
  const verts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const r = 0.55 + 0.45 * Math.abs(Math.sin(i * 2.7181 + seed));
    verts.push({
      x: cx + Math.cos(a) * rx * r,
      y: cy + Math.sin(a) * ry * r,
    });
  }
  return { cx, cy, verts };
}

// ─── Build rock layout — procedural, deterministic, reachable ───────────────
// Each rock is 65-85px above the previous, offset left/right by 60-100px.
// Diagonal distance between adjacent rocks stays within ~100-130px (< MAX_RANGE).
function buildRockLayout(): RockData[] {
  const rocks: RockData[] = [];

  // Wide starting platform
  rocks.push(generateRock(400, 560, 200, 28, 9, 1.1));

  let curY = 490;
  let side = -1;
  for (let i = 0; i < 25; i++) {
    const hOffset = 60 + seeded(i * 3.1) * 50;           // 60-110px from center
    const cx = 400 + side * hOffset;
    const rx = 55 + seeded(i * 5.7 + 10) * 30;           // 55-85px wide
    const ry = 22 + seeded(i * 7.3 + 20) * 16;           // 22-38px tall
    const n  = 6 + Math.floor(seeded(i * 11.1 + 30) * 4);// 6-9 vertices
    const seed = i * 1.37 + 0.5;

    rocks.push(generateRock(cx, curY, rx, ry, n, seed));

    curY -= 65 + seeded(i * 4.9 + 40) * 20;              // 65-85px gap
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

// ─── Phaser Scene ───────────────────────────────────────────────────────────
class ClimbScene extends Phaser.Scene {
  private playerBody!: MatterJS.BodyType;
  private hammerPos = { x: SPAWN_X, y: SPAWN_Y - 50 };
  private mouseWorld = { x: SPAWN_X, y: SPAWN_Y };
  private mouseScreen = { x: 0, y: 0 };
  private rockBodies: MatterJS.BodyType[] = [];
  private gfx!: Phaser.GameObjects.Graphics;
  private maxHeight = 0;

  // Head blinking (Head.cs)
  private blinking = false;
  private blinkTimer = 0;
  private nextBlinkAt = 0;
  private blinkPhase = 0;

  constructor() {
    super({ key: 'ClimbScene' });
  }

  create(): void {
    const MatterLib = (Phaser.Physics.Matter as any).Matter;

    this.matter.world.setBounds(0, -WORLD_H + 600, WORLD_W, WORLD_H + 200);

    // ── Create polygon rock bodies from generated vertices ──────────────────
    for (const rock of ROCKS) {
      // Convert world-space verts to local (relative to center) for Matter.js
      const localVerts = rock.verts.map(v => ({
        x: v.x - rock.cx,
        y: v.y - rock.cy,
      }));

      const body = MatterLib.Bodies.fromVertices(
        rock.cx, rock.cy, [localVerts],
        { isStatic: true, label: 'rock', friction: 0.8, restitution: 0.1 },
      ) as MatterJS.BodyType;

      // fromVertices may shift the center — correct position back
      MatterLib.Body.setPosition(body, { x: rock.cx, y: rock.cy });
      this.matter.world.add(body);
      this.rockBodies.push(body);
    }

    // Walls (rectangles — boundary only)
    const leftWall = this.matter.add.rectangle(20, -200, 40, 2000, {
      isStatic: true, label: 'rock', friction: 0.5,
    });
    const rightWall = this.matter.add.rectangle(780, -200, 40, 2000, {
      isStatic: true, label: 'rock', friction: 0.5,
    });
    this.rockBodies.push(leftWall, rightWall);

    // Ground
    this.matter.add.rectangle(WORLD_W / 2, GROUND_Y + 25, WORLD_W + 200, 50, {
      isStatic: true, label: 'ground', friction: 0.9,
    });

    // Player body
    this.playerBody = this.matter.add.circle(SPAWN_X, SPAWN_Y, BODY_R, {
      label: 'player',
      friction: 0.4,
      frictionAir: 0.012,
      restitution: 0.05,
      density: 0.002,
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
    const body = this.playerBody;
    const bx = body.position.x;
    const by = body.position.y;

    // ── 1. mouseVec (PlayerControl.cs) ──────────────────────────────────────
    const cam = this.cameras.main;
    const scx = cam.scrollX + cam.width / 2;
    const scy = cam.scrollY + cam.height / 2;
    const rawDx = this.mouseWorld.x - scx;
    const rawDy = this.mouseWorld.y - scy;
    const rawDist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
    const clampedDist = Math.min(rawDist, MAX_RANGE);
    const mouseVec = rawDist > 0
      ? { x: (rawDx / rawDist) * clampedDist, y: (rawDy / rawDist) * clampedDist }
      : { x: 0, y: 0 };

    // ── 2. Gather static bodies for collision queries ─────────────────────
    const MatterLib = (Phaser.Physics.Matter as any).Matter;
    const allBodies = (this.matter.world.localWorld as any).bodies as MatterJS.BodyType[];
    const staticBodies = allBodies.filter(
      (b: MatterJS.BodyType) => b.isStatic && (b.label === 'rock' || b.label === 'ground')
    );

    // ── 3. Hammer target + lerp (with solid-rock collision) ─────────────────
    // Unity's MovePosition is blocked by colliders — hammer can't pass through
    // rocks.  We replicate this: lerp toward target, but if the new position
    // is inside a rock, binary-search along the movement to find the surface
    // contact point and stop there.  This keeps the hammer lodged against the
    // rock face, which in turn keeps the spring force active and prevents the
    // player from slipping.
    const htx = bx + mouseVec.x;
    const hty = by + mouseVec.y;
    const prevHx = this.hammerPos.x;
    const prevHy = this.hammerPos.y;
    let newHx = prevHx + (htx - prevHx) * LERP;
    let newHy = prevHy + (hty - prevHy) * LERP;

    // Check if the desired new position is inside a rock body
    const penetrating = MatterLib.Query.point(staticBodies, { x: newHx, y: newHy });
    if (penetrating.length > 0) {
      // Binary search between old (outside) and new (inside) to find surface
      let lo = 0, hi = 1;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        const mx = prevHx + (newHx - prevHx) * mid;
        const my = prevHy + (newHy - prevHy) * mid;
        if (MatterLib.Query.point(staticBodies, { x: mx, y: my }).length > 0) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
      // Place hammer at the last safe (outside) position — right at the surface
      newHx = prevHx + (newHx - prevHx) * lo;
      newHy = prevHy + (newHy - prevHy) * lo;
    }

    this.hammerPos.x = newHx;
    this.hammerPos.y = newHy;

    // ── 4. Check hammer overlap with rocks (for force application) ──────────
    // Use a region query (HAMMER_R buffer) so the hammer registers contact
    // even when sitting right at the surface.
    const regionHit = MatterLib.Query.region(staticBodies, {
      min: { x: this.hammerPos.x - HAMMER_R, y: this.hammerPos.y - HAMMER_R },
      max: { x: this.hammerPos.x + HAMMER_R, y: this.hammerPos.y + HAMMER_R },
    });
    const isOverlapping = regionHit.length > 0;

    // ── 5. Apply force (PlayerControl.cs) ───────────────────────────────────
    if (isOverlapping) {
      const tbx = this.hammerPos.x - mouseVec.x;
      const tby = this.hammerPos.y - mouseVec.y;
      MatterLib.Body.applyForce(body, body.position, {
        x: (tbx - bx) * FORCE_MULT,
        y: (tby - by) * FORCE_MULT,
      });
      const vx = body.velocity.x, vy = body.velocity.y;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > MAX_SPEED) {
        const s = MAX_SPEED / speed;
        MatterLib.Body.setVelocity(body, { x: vx * s, y: vy * s });
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

    // ── Background ──────────────────────────────────────────────────────────
    gfx.fillStyle(0x0a0a0f);
    gfx.fillRect(cam.scrollX - 10, cam.scrollY - 10, cam.width + 20, cam.height + 20);

    // ── Ground ──────────────────────────────────────────────────────────────
    gfx.fillStyle(0x0d0b08);
    gfx.fillRect(0, GROUND_Y, WORLD_W, 200);
    gfx.lineStyle(3, 0x4b5563);
    gfx.lineBetween(0, GROUND_Y, WORLD_W, GROUND_Y);

    // ── Rocks (polygon shapes) ──────────────────────────────────────────────
    for (const rock of ROCKS) {
      const v = rock.verts;
      if (v.length < 3) continue;

      // Fill
      gfx.fillStyle(0x374151);
      gfx.beginPath();
      gfx.moveTo(v[0].x, v[0].y);
      for (let i = 1; i < v.length; i++) gfx.lineTo(v[i].x, v[i].y);
      gfx.closePath();
      gfx.fillPath();

      // Edge highlight
      gfx.lineStyle(2, 0x4b5563);
      gfx.beginPath();
      gfx.moveTo(v[0].x, v[0].y);
      for (let i = 1; i < v.length; i++) gfx.lineTo(v[i].x, v[i].y);
      gfx.closePath();
      gfx.strokePath();

      // Top-edge lighter line (topmost two vertices)
      let topIdx = 0;
      for (let i = 1; i < v.length; i++) {
        if (v[i].y < v[topIdx].y) topIdx = i;
      }
      const nextIdx = (topIdx + 1) % v.length;
      const prevIdx = (topIdx - 1 + v.length) % v.length;
      gfx.lineStyle(1, 0x6b7280);
      gfx.lineBetween(v[prevIdx].x, v[prevIdx].y, v[topIdx].x, v[topIdx].y);
      gfx.lineBetween(v[topIdx].x, v[topIdx].y, v[nextIdx].x, v[nextIdx].y);

      // Deterministic crack lines
      gfx.lineStyle(1, 0x1f2937);
      for (let i = 0; i < 2; i++) {
        const a = (i * 2.1 + rock.cx * 0.013 + rock.cy * 0.007) % (Math.PI * 2);
        const len = 12 + ((i * 13 + Math.abs(rock.cx * 0.4)) % 18);
        gfx.lineBetween(rock.cx, rock.cy,
          rock.cx + Math.cos(a) * len, rock.cy + Math.sin(a) * len);
      }
    }

    // ── Hands + Arms (Hand.cs) ──────────────────────────────────────────────
    const shoulderOff = BODY_R * 0.7;
    const shoulderY = by - 2;
    const handleMidX = bx + (hx - bx) * 0.4;
    const handleMidY = by + (hy - by) * 0.4;

    const drawArm = (sx: number, sy: number) => {
      const dx = handleMidX - sx, dy = handleMidY - sy;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const armLen = Math.min(d, BODY_R * 2.5);
      const ex = sx + (dx / d) * armLen;
      const ey = sy + (dy / d) * armLen;
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

    // ── Pickaxe handle ──────────────────────────────────────────────────────
    const gripX = (lh.x + rh.x) / 2;
    const gripY = (lh.y + rh.y) / 2;
    gfx.lineStyle(5, 0x92400e);
    gfx.lineBetween(gripX, gripY, hx, hy);

    // ── Pickaxe head (fixed orientation — does NOT rotate) ──────────────────
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
      gfx.fillCircle(hx, hy, HAMMER_R + 6);
    }

    // ── Cauldron / stone slab ───────────────────────────────────────────────
    gfx.fillStyle(0x374151);
    gfx.fillEllipse(bx, by + BODY_R + 4, 40, 12);
    gfx.lineStyle(1, 0x4b5563);
    gfx.strokeEllipse(bx, by + BODY_R + 4, 40, 12);

    // ── Player body ─────────────────────────────────────────────────────────
    gfx.fillStyle(0x78563d);
    gfx.fillCircle(bx, by, BODY_R);
    gfx.fillStyle(0x2d1f14, 0.4);
    gfx.fillCircle(bx + 2, by + 2, BODY_R - 2);
    gfx.lineStyle(1.5, 0x5a3e28);
    gfx.strokeCircle(bx, by, BODY_R);

    // ── Head (Head.cs) ──────────────────────────────────────────────────────
    const headX = bx;
    const headY = by - BODY_R - HEAD_R + 4;
    const msx = this.mouseScreen.x;
    const msy = -this.mouseScreen.y;
    const headFlipped = msx < 0;
    let headDeg = (180 / Math.PI) * Math.atan2(msy, Math.abs(msx));
    headDeg = Math.max(-30, Math.min(30, headDeg));

    gfx.fillStyle(0xd4a574);
    gfx.fillCircle(headX, headY, HEAD_R);
    gfx.lineStyle(1, 0x8b6b4a);
    gfx.strokeCircle(headX, headY, HEAD_R);

    const eyeOffX = headFlipped ? -3 : 3;
    const eyeSp = 4;
    const eyeY = headY - 2;
    if (this.isEyesClosed) {
      gfx.lineStyle(1.5, 0x2d1f14);
      gfx.lineBetween(headX + eyeOffX - eyeSp - 2, eyeY, headX + eyeOffX - eyeSp + 2, eyeY);
      gfx.lineBetween(headX + eyeOffX + eyeSp - 2, eyeY, headX + eyeOffX + eyeSp + 2, eyeY);
    } else {
      gfx.fillStyle(0xffffff);
      gfx.fillCircle(headX + eyeOffX - eyeSp, eyeY, 2.5);
      gfx.fillCircle(headX + eyeOffX + eyeSp, eyeY, 2.5);
      const ps = headFlipped ? -0.8 : 0.8;
      gfx.fillStyle(0x1a1008);
      gfx.fillCircle(headX + eyeOffX - eyeSp + ps, eyeY, 1.2);
      gfx.fillCircle(headX + eyeOffX + eyeSp + ps, eyeY, 1.2);
    }
    const mouthX = headX + (headFlipped ? -1 : 1);
    gfx.lineStyle(1, 0x5a3020);
    gfx.lineBetween(mouthX - 2.5, headY + 4, mouthX + 2.5, headY + 4);
  }

  getMaxHeight(): number {
    return this.maxHeight;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────
export function launchPhaserGame(container: HTMLElement): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: container,
    width: window.innerWidth,
    height: window.innerHeight,
    transparent: true,
    physics: {
      default: 'matter',
      matter: {
        gravity: { x: 0, y: 1.2 },
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
  game.destroy(true);
}
