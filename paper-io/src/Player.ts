import {
  Direction,
  DIRECTION_VEC,
  PLAYER_SPEED,
  TRAIL_SAMPLE_DIST,
  MAP_RADIUS,
  type Vec2,
  dist2,
} from "./constants.ts";
import { Territory, type TerritoryGrid } from "./Territory.ts";

export interface PlayerState {
  id: number;
  color: number;
  colorStr: string;
  name: string;
  skinId: string;
  position: Vec2;
  moveDir: Vec2; // normalized movement direction
  trail: Vec2[];
  trailStartTangent: Vec2 | null;
  territory: Territory;
  alive: boolean;
  isHuman: boolean;
  speed: number;
  isTrailing: boolean;
  hasInput: boolean; // has the player given any input yet
}

export function createPlayer(
  id: number,
  color: number,
  colorStr: string,
  name: string,
  spawnX: number,
  spawnZ: number,
  isHuman: boolean,
  grid: TerritoryGrid,
  skinId: string = "cyan",
): PlayerState {
  const territory = new Territory(grid, id);
  territory.initAtSpawn(spawnX, spawnZ);

  return {
    id,
    color,
    colorStr,
    name,
    skinId,
    position: { x: spawnX, z: spawnZ },
    moveDir: { x: 1, z: 0 },
    trail: [],
    trailStartTangent: null,
    territory,
    alive: true,
    isHuman,
    speed: PLAYER_SPEED,
    isTrailing: false,
    hasInput: false,
  };
}

/** Set direction from a Direction enum (used by bots) */
export function setDirectionEnum(player: PlayerState, dir: Direction): void {
  const vec = DIRECTION_VEC[dir];
  player.moveDir = { x: vec.dx, z: vec.dz };
  player.hasInput = true;
}

/** Set direction toward a world target point */
export function setDirectionToward(player: PlayerState, target: Vec2): void {
  const dx = target.x - player.position.x;
  const dz = target.z - player.position.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.1) return; // too close, don't change direction
  player.moveDir = { x: dx / len, z: dz / len };
  player.hasInput = true;
}

export function computeMovement(player: PlayerState, dt: number): Vec2 {
  return {
    x: player.position.x + player.moveDir.x * player.speed * dt,
    z: player.position.z + player.moveDir.z * player.speed * dt,
  };
}

export function isInBounds(pos: Vec2): boolean {
  return pos.x * pos.x + pos.z * pos.z <= MAP_RADIUS * MAP_RADIUS;
}

/** Clamp position to stay inside the circular arena */
export function clampToArena(pos: Vec2): Vec2 {
  const d2 = pos.x * pos.x + pos.z * pos.z;
  const r2 = MAP_RADIUS * MAP_RADIUS;
  if (d2 <= r2) return pos;
  const scale = MAP_RADIUS / Math.sqrt(d2);
  return { x: pos.x * scale, z: pos.z * scale };
}

export function sampleTrailPoint(player: PlayerState): void {
  const lastPoint =
    player.trail.length > 0 ? player.trail[player.trail.length - 1] : null;
  if (
    !lastPoint ||
    dist2(player.position, lastPoint) >= TRAIL_SAMPLE_DIST * TRAIL_SAMPLE_DIST
  ) {
    player.trail.push({ x: player.position.x, z: player.position.z });
  }
}

const JOYSTICK_MAX_RADIUS = 50;
const JOYSTICK_DEAD_ZONE = 8;
const PLAYER_TURN_RATE = 4.5; // radians per second

export class InputHandler {
  private player: PlayerState;
  private joystickDir: Vec2 | null = null;
  private targetDir: Vec2 | null = null; // desired direction from input

  private zone: HTMLElement;
  private base: HTMLElement;
  private knob: HTMLElement;
  private activeId: number | null = null;
  private mouseActive = false;
  private originX = 0;
  private originY = 0;

  constructor(player: PlayerState) {
    this.player = player;
    this.zone = document.getElementById("joystick-zone")!;
    this.base = document.getElementById("joystick-base")!;
    this.knob = document.getElementById("joystick-knob")!;
    this.setupKeyboard();
    this.setupJoystick();
    this.setupMouse();
  }

  private setupKeyboard(): void {
    window.addEventListener("keydown", (e) => {
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          this.targetDir = { x: 0, z: -1 };
          this.joystickDir = null;
          this.player.hasInput = true;
          break;
        case "ArrowDown":
        case "s":
        case "S":
          this.targetDir = { x: 0, z: 1 };
          this.joystickDir = null;
          this.player.hasInput = true;
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          this.targetDir = { x: -1, z: 0 };
          this.joystickDir = null;
          this.player.hasInput = true;
          break;
        case "ArrowRight":
        case "d":
        case "D":
          this.targetDir = { x: 1, z: 0 };
          this.joystickDir = null;
          this.player.hasInput = true;
          break;
      }
    });
  }

  private setupJoystick(): void {
    this.zone.addEventListener(
      "touchstart",
      (e) => {
        e.preventDefault();
        if (this.activeId !== null) return;
        const t = e.changedTouches[0];
        this.activeId = t.identifier;
        this.originX = t.clientX;
        this.originY = t.clientY;
        this.showJoystickAt(t.clientX, t.clientY);
        this.player.hasInput = true;
      },
      { passive: false },
    );

    this.zone.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
        const t = this.findTouch(e.changedTouches);
        if (!t) return;
        this.updateJoystickFromTouch(t.clientX, t.clientY);
      },
      { passive: false },
    );

    const endTouch = (e: TouchEvent) => {
      const t = this.findTouch(e.changedTouches);
      if (!t) return;
      this.activeId = null;
      this.hideJoystick();
    };
    this.zone.addEventListener("touchend", endTouch);
    this.zone.addEventListener("touchcancel", endTouch);
  }

  private setupMouse(): void {
    this.zone.addEventListener("mousedown", (e) => {
      if (this.activeId !== null) return;
      this.mouseActive = true;
      this.originX = e.clientX;
      this.originY = e.clientY;
      this.showJoystickAt(e.clientX, e.clientY);
      this.player.hasInput = true;
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.mouseActive) return;
      this.updateJoystickFromTouch(e.clientX, e.clientY);
    });

    window.addEventListener("mouseup", () => {
      if (!this.mouseActive) return;
      this.mouseActive = false;
      this.hideJoystick();
    });
  }

  private findTouch(list: TouchList): Touch | null {
    for (let i = 0; i < list.length; i++) {
      if (list[i].identifier === this.activeId) return list[i];
    }
    return null;
  }

  private showJoystickAt(cx: number, cy: number): void {
    const rect = this.zone.getBoundingClientRect();
    const x = cx - rect.left;
    const y = cy - rect.top;
    this.base.style.left = `${x}px`;
    this.base.style.top = `${y}px`;
    this.base.style.display = "block";
    this.knob.style.left = `${x}px`;
    this.knob.style.top = `${y}px`;
    this.knob.style.display = "block";
  }

  private hideJoystick(): void {
    this.base.style.display = "none";
    this.knob.style.display = "none";
  }

  private updateJoystickFromTouch(cx: number, cy: number): void {
    let dx = cx - this.originX;
    let dy = cy - this.originY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > JOYSTICK_MAX_RADIUS) {
      dx = (dx / dist) * JOYSTICK_MAX_RADIUS;
      dy = (dy / dist) * JOYSTICK_MAX_RADIUS;
    }

    const rect = this.zone.getBoundingClientRect();
    this.knob.style.left = `${this.originX - rect.left + dx}px`;
    this.knob.style.top = `${this.originY - rect.top + dy}px`;

    if (dist < JOYSTICK_DEAD_ZONE) {
      this.joystickDir = null;
      return;
    }

    const len = Math.sqrt(dx * dx + dy * dy);
    this.joystickDir = { x: dx / len, z: dy / len };
  }

  update(dt: number): void {
    // Joystick overrides keyboard target
    const desired = this.joystickDir ?? this.targetDir;
    if (!desired) return;

    this.player.hasInput = true;

    const currentAngle = Math.atan2(
      this.player.moveDir.z,
      this.player.moveDir.x,
    );
    const targetAngle = Math.atan2(desired.z, desired.x);

    let angleDiff = targetAngle - currentAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    const maxTurn = PLAYER_TURN_RATE * dt;
    const turn = Math.max(-maxTurn, Math.min(maxTurn, angleDiff));

    const newAngle = currentAngle + turn;
    this.player.moveDir = { x: Math.cos(newAngle), z: Math.sin(newAngle) };
  }

  updatePlayer(p: PlayerState): void {
    this.player = p;
  }
}
