// Stone Ascent – Phaser Mode (Hammer Physics)
// Force-based hammer system matching PlayerControl.cs from Unity reference.
// The hammer does NOT attach to rocks. When the hammer overlaps a rock,
// a spring force pushes the player body. Only input: move the mouse.

import Phaser from 'phaser';

// ─── Constants (tuned from Unity's PlayerControl.cs → pixel scale) ──────────
const MAX_RANGE   = 150;    // max mouse offset px (Unity: 2.0 world units)
const FORCE_MULT  = 0.0015; // spring force multiplier (Unity: 80, scaled for Matter.js)
const MAX_SPEED   = 8;      // velocity clamp (Unity: 6)
const LERP        = 0.2;    // hammer position lerp toward target (same as Unity)
const BODY_R      = 20;     // player body radius
const HAMMER_R    = 14;     // hammer head visual radius
const GROUND_Y    = 580;    // world Y of ground floor
const SPAWN_X     = 400;    // player spawn X
const SPAWN_Y     = 500;    // player spawn Y (above ground)
const WORLD_W     = 800;    // world width
const WORLD_H     = 4000;   // world height (tall for climbing)

// ─── Rock definitions ───────────────────────────────────────────────────────
// Each rock: { x, y, w, h } — positioned for ascending climb
const ROCK_DEFS = [
  // Starting platform
  { x: 400, y: 560, w: 500, h: 40 },
  // Ascending rocks — alternating left/right
  { x: 250, y: 440, w: 140, h: 30 },
  { x: 550, y: 340, w: 130, h: 28 },
  { x: 200, y: 230, w: 150, h: 32 },
  { x: 580, y: 120, w: 120, h: 28 },
  { x: 280, y:  10, w: 140, h: 30 },
  { x: 520, y: -100, w: 130, h: 28 },
  { x: 220, y: -210, w: 150, h: 32 },
  { x: 560, y: -320, w: 120, h: 30 },
  { x: 300, y: -430, w: 140, h: 28 },
  { x: 500, y: -540, w: 130, h: 30 },
  { x: 250, y: -650, w: 150, h: 32 },
  { x: 550, y: -760, w: 120, h: 28 },
  { x: 280, y: -870, w: 140, h: 30 },
  { x: 520, y: -980, w: 130, h: 28 },
  // Walls on the sides to keep player in bounds
  { x: 20, y: -200, w: 40, h: 2000 },
  { x: 780, y: -200, w: 40, h: 2000 },
];

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
  private rockBodies: MatterJS.BodyType[] = [];
  private gfx!: Phaser.GameObjects.Graphics;
  private maxHeight = 0;

  constructor() {
    super({ key: 'ClimbScene' });
  }

  create(): void {
    // Set world bounds (wide and very tall for climbing)
    this.matter.world.setBounds(0, -WORLD_H + 600, WORLD_W, WORLD_H + 200);

    // Create rocks as static Matter.js bodies
    for (const def of ROCK_DEFS) {
      const body = this.matter.add.rectangle(def.x, def.y, def.w, def.h, {
        isStatic: true,
        label: 'rock',
        friction: 0.8,
        restitution: 0.1,
      });
      this.rockBodies.push(body);
    }

    // Create ground
    this.matter.add.rectangle(WORLD_W / 2, GROUND_Y + 25, WORLD_W + 200, 50, {
      isStatic: true,
      label: 'ground',
      friction: 0.9,
    });

    // Create player body (dynamic circle)
    this.playerBody = this.matter.add.circle(SPAWN_X, SPAWN_Y, BODY_R, {
      label: 'player',
      friction: 0.3,
      frictionAir: 0.01,
      restitution: 0.05,
      density: 0.002,
    });

    // Initialize hammer at player position
    this.hammerPos.x = SPAWN_X;
    this.hammerPos.y = SPAWN_Y - 60;

    // Graphics for rendering
    this.gfx = this.add.graphics();

    // Camera follows player
    this.cameras.main.startFollow(
      { x: SPAWN_X, y: SPAWN_Y } as any,
      false, 0.08, 0.08
    );
    this.cameras.main.setDeadzone(50, 50);

    // Mouse tracking
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.mouseWorld.x = pointer.worldX;
      this.mouseWorld.y = pointer.worldY;
    });

    // Also track when pointer isn't moving (initial position)
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.mouseWorld.x = pointer.worldX;
      this.mouseWorld.y = pointer.worldY;
    });
  }

  update(): void {
    const body = this.playerBody;
    const bx = body.position.x;
    const by = body.position.y;

    // ── 1. Compute mouseVec (clamped offset from screen center to mouse) ────
    // In Unity: mouseVec = clamp(mouse - screenCenter, maxRange)
    // Here: offset from player body to mouse, clamped to MAX_RANGE
    const cam = this.cameras.main;
    const screenCenterWorld = {
      x: cam.scrollX + cam.width / 2,
      y: cam.scrollY + cam.height / 2,
    };
    const rawDx = this.mouseWorld.x - screenCenterWorld.x;
    const rawDy = this.mouseWorld.y - screenCenterWorld.y;
    const rawDist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);
    const clampedDist = Math.min(rawDist, MAX_RANGE);
    const mouseVec = rawDist > 0
      ? { x: (rawDx / rawDist) * clampedDist, y: (rawDy / rawDist) * clampedDist }
      : { x: 0, y: 0 };

    // ── 2. Compute hammer target and lerp ───────────────────────────────────
    // Unity: newHammerPos = body.position + mouseVec, then lerp 20%
    const hammerTarget = { x: bx + mouseVec.x, y: by + mouseVec.y };
    this.hammerPos.x += (hammerTarget.x - this.hammerPos.x) * LERP;
    this.hammerPos.y += (hammerTarget.y - this.hammerPos.y) * LERP;

    // ── 3. Check if hammer overlaps any rock ────────────────────────────────
    // Use Matter.js Query to check point overlap
    const MatterLib = (Phaser.Physics.Matter as any).Matter;
    const allBodies = (this.matter.world.localWorld as any).bodies as MatterJS.BodyType[];
    const staticBodies = allBodies.filter(
      (b: MatterJS.BodyType) => b.isStatic && (b.label === 'rock' || b.label === 'ground')
    );

    // Check if hammer position overlaps any static body
    const hammerQuery = MatterLib.Query.point(staticBodies, this.hammerPos);
    const hammerTouchingRock = hammerQuery.length > 0;

    // Also check a small area around hammer head for better detection
    const hammerBounds = {
      min: { x: this.hammerPos.x - HAMMER_R * 0.6, y: this.hammerPos.y - HAMMER_R * 0.6 },
      max: { x: this.hammerPos.x + HAMMER_R * 0.6, y: this.hammerPos.y + HAMMER_R * 0.6 },
    };
    const hammerRegionQuery = MatterLib.Query.region(staticBodies, hammerBounds);
    const isOverlapping = hammerTouchingRock || hammerRegionQuery.length > 0;

    // ── 4. Apply force if hammer is on a rock ───────────────────────────────
    // Unity: targetBodyPos = hammerHead.position - mouseVec
    //        force = (targetBodyPos - body.position) * 80
    if (isOverlapping) {
      const targetBodyX = this.hammerPos.x - mouseVec.x;
      const targetBodyY = this.hammerPos.y - mouseVec.y;
      const fx = (targetBodyX - bx) * FORCE_MULT;
      const fy = (targetBodyY - by) * FORCE_MULT;
      MatterLib.Body.applyForce(body, body.position, { x: fx, y: fy });

      // Clamp velocity (Unity: ClampMagnitude(velocity, 6))
      const vx = body.velocity.x;
      const vy = body.velocity.y;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > MAX_SPEED) {
        const scale = MAX_SPEED / speed;
        MatterLib.Body.setVelocity(body, { x: vx * scale, y: vy * scale });
      }
    }

    // ── 5. Camera follow ────────────────────────────────────────────────────
    // Manually update the follow target position for smooth camera
    cam.scrollX += (bx - cam.width / 2 - cam.scrollX) * 0.08;
    cam.scrollY += (by - cam.height * 0.6 - cam.scrollY) * 0.08;

    // ── 6. Track altitude ───────────────────────────────────────────────────
    const altitude = Math.max(0, Math.round((SPAWN_Y - by) / 9));
    if (altitude > this.maxHeight) this.maxHeight = altitude;
    if (onAltitudeUpdate) onAltitudeUpdate(this.maxHeight);

    // ── 7. Render everything ────────────────────────────────────────────────
    this.renderScene(isOverlapping);
  }

  private renderScene(hammerOnRock: boolean): void {
    const gfx = this.gfx;
    gfx.clear();

    const bx = this.playerBody.position.x;
    const by = this.playerBody.position.y;
    const hx = this.hammerPos.x;
    const hy = this.hammerPos.y;

    // ── Background gradient (drawn as filled rect) ──────────────────────────
    const cam = this.cameras.main;
    gfx.fillStyle(0x0a0a0f);
    gfx.fillRect(cam.scrollX - 10, cam.scrollY - 10, cam.width + 20, cam.height + 20);

    // ── Ground ──────────────────────────────────────────────────────────────
    gfx.fillStyle(0x0d0b08);
    gfx.fillRect(0, GROUND_Y, WORLD_W, 200);
    gfx.lineStyle(3, 0x4b5563);
    gfx.lineBetween(0, GROUND_Y, WORLD_W, GROUND_Y);

    // ── Rocks ───────────────────────────────────────────────────────────────
    for (const def of ROCK_DEFS) {
      // Rock body fill
      gfx.fillStyle(0x374151);
      gfx.fillRect(def.x - def.w / 2, def.y - def.h / 2, def.w, def.h);
      // Rock edge highlight
      gfx.lineStyle(2, 0x4b5563);
      gfx.strokeRect(def.x - def.w / 2, def.y - def.h / 2, def.w, def.h);
      // Top edge lighter
      gfx.lineStyle(1, 0x6b7280);
      gfx.lineBetween(
        def.x - def.w / 2, def.y - def.h / 2,
        def.x + def.w / 2, def.y - def.h / 2
      );
    }

    // ── Pickaxe handle (line from body to hammer) ───────────────────────────
    gfx.lineStyle(5, 0x92400e);
    gfx.lineBetween(bx, by, hx, hy);

    // ── Pickaxe head ────────────────────────────────────────────────────────
    const angle = Math.atan2(hy - by, hx - bx);
    const headLen = 16;
    const headW = 7;
    // Draw as a filled triangle/wedge shape
    const tipX = hx + Math.cos(angle) * headLen;
    const tipY = hy + Math.sin(angle) * headLen;
    const perpX = -Math.sin(angle) * headW;
    const perpY =  Math.cos(angle) * headW;

    gfx.fillStyle(hammerOnRock ? 0xfbbf24 : 0x9ca3af);
    gfx.beginPath();
    gfx.moveTo(tipX, tipY);
    gfx.lineTo(hx + perpX, hy + perpY);
    gfx.lineTo(hx - Math.cos(angle) * 10, hy - Math.sin(angle) * 10);
    gfx.lineTo(hx - perpX, hy - perpY);
    gfx.closePath();
    gfx.fillPath();
    gfx.lineStyle(1, 0x374151);
    gfx.strokePath();

    // ── Hammer glow when touching rock ──────────────────────────────────────
    if (hammerOnRock) {
      gfx.fillStyle(0xfbbf24, 0.3);
      gfx.fillCircle(hx, hy, HAMMER_R + 6);
    }

    // ── Stone slab the figure sits on ───────────────────────────────────────
    gfx.fillStyle(0x374151);
    gfx.fillEllipse(bx, by + BODY_R + 4, 40, 12);
    gfx.lineStyle(1, 0x4b5563);
    gfx.strokeEllipse(bx, by + BODY_R + 4, 40, 12);

    // ── Player body (stone climber circle) ──────────────────────────────────
    // Radial gradient approximation - draw two circles
    gfx.fillStyle(0x78563d);
    gfx.fillCircle(bx, by, BODY_R);
    gfx.fillStyle(0x2d1f14, 0.5);
    gfx.fillCircle(bx + 3, by + 3, BODY_R - 2);
    gfx.lineStyle(1.5, 0x5a3e28);
    gfx.strokeCircle(bx, by, BODY_R);

    // ── Eyes (face toward hammer direction) ─────────────────────────────────
    const perp = angle + Math.PI / 2;
    const ex = Math.cos(angle) * 5;
    const ey = Math.sin(angle) * 5;
    const px = Math.cos(perp) * 3.5;
    const py = Math.sin(perp) * 3.5;
    gfx.fillStyle(0xc8a96e);
    gfx.fillCircle(bx + ex + px, by + ey + py, 2.2);
    gfx.fillCircle(bx + ex - px, by + ey - py, 2.2);
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
