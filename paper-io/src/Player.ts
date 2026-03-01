import { Direction, OPPOSITE_DIR, DIRECTION_VEC, PLAYER_SPEED, TRAIL_SAMPLE_DIST, MAP_HALF, type Vec2, dist2 } from './constants.ts';
import { Territory } from './Territory.ts';

export interface PlayerState {
  id: number;
  color: number;
  colorStr: string;
  name: string;
  position: Vec2;
  direction: Direction;
  nextDirection: Direction | null;
  trail: Vec2[];
  territory: Territory;
  alive: boolean;
  isHuman: boolean;
  speed: number;
  isTrailing: boolean;
}

export function createPlayer(
  id: number, color: number, colorStr: string, name: string,
  spawnX: number, spawnZ: number, isHuman: boolean,
): PlayerState {
  const territory = new Territory();
  territory.initAtSpawn(spawnX, spawnZ);

  return {
    id, color, colorStr, name,
    position: { x: spawnX, z: spawnZ },
    direction: Direction.RIGHT,
    nextDirection: null,
    trail: [],
    territory,
    alive: true,
    isHuman,
    speed: PLAYER_SPEED,
    isTrailing: false,
  };
}

export function setDirection(player: PlayerState, dir: Direction): void {
  if (OPPOSITE_DIR[dir] === player.direction) return;
  player.nextDirection = dir;
}

export function applyDirection(player: PlayerState): void {
  if (player.nextDirection !== null) {
    if (OPPOSITE_DIR[player.nextDirection] !== player.direction) {
      player.direction = player.nextDirection;
    }
    player.nextDirection = null;
  }
}

export function computeMovement(player: PlayerState, dt: number): Vec2 {
  const vec = DIRECTION_VEC[player.direction];
  return {
    x: player.position.x + vec.dx * player.speed * dt,
    z: player.position.z + vec.dz * player.speed * dt,
  };
}

export function isInBounds(pos: Vec2): boolean {
  return pos.x >= -MAP_HALF && pos.x <= MAP_HALF && pos.z >= -MAP_HALF && pos.z <= MAP_HALF;
}

export function sampleTrailPoint(player: PlayerState): void {
  const lastPoint = player.trail.length > 0 ? player.trail[player.trail.length - 1] : null;
  if (!lastPoint || dist2(player.position, lastPoint) >= TRAIL_SAMPLE_DIST * TRAIL_SAMPLE_DIST) {
    player.trail.push({ x: player.position.x, z: player.position.z });
  }
}

export class InputHandler {
  private player: PlayerState;
  private swipeStart: { x: number; y: number } | null = null;

  constructor(player: PlayerState) {
    this.player = player;
    this.setupKeyboard();
    this.setupTouch();
    this.setupDpad();
  }

  private setupKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W':
          setDirection(this.player, Direction.UP); break;
        case 'ArrowDown': case 's': case 'S':
          setDirection(this.player, Direction.DOWN); break;
        case 'ArrowLeft': case 'a': case 'A':
          setDirection(this.player, Direction.LEFT); break;
        case 'ArrowRight': case 'd': case 'D':
          setDirection(this.player, Direction.RIGHT); break;
      }
    });
  }

  private setupTouch(): void {
    const canvas = document.getElementById('game-canvas')!;
    canvas.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      this.swipeStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      if (!this.swipeStart) return;
      const t = e.touches[0];
      const dx = t.clientX - this.swipeStart.x;
      const dy = t.clientY - this.swipeStart.y;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;

      if (Math.abs(dx) > Math.abs(dy)) {
        setDirection(this.player, dx > 0 ? Direction.RIGHT : Direction.LEFT);
      } else {
        setDirection(this.player, dy > 0 ? Direction.DOWN : Direction.UP);
      }
      this.swipeStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    canvas.addEventListener('touchend', () => { this.swipeStart = null; }, { passive: true });
  }

  private setupDpad(): void {
    document.querySelectorAll('.dpad-btn').forEach((btn) => {
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const dir = (btn as HTMLElement).dataset.dir as Direction;
        setDirection(this.player, dir);
      });
    });
  }

  updatePlayer(p: PlayerState): void {
    this.player = p;
  }
}
