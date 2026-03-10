import { ParticleSystem } from "./ParticleSystem.ts";
import {
  createPlayer,
  type PlayerState,
  computeMovement,
  clampToArena,
  sampleTrailPoint,
  InputHandler,
} from "./Player.ts";
import { TerritoryGrid, type Territory } from "./Territory.ts";
import { Renderer } from "./Renderer.ts";
import { PLAYER_COLORS, PLAYER_COLOR_STRINGS, type Vec2 } from "./constants.ts";
import { createCircleTerritory, unionTerritories } from "./polygon-ops.ts";
import {
  getTrailInsideTerritorySegment,
  insetBoundaryIntoTerritory,
} from "./trail-geometry.ts";

type PlaygroundActor = PlayerState & {
  spawn: Vec2;
  trailVisualLeadInPoints: Vec2[];
};

const PLAYGROUND_TRAIL_TAIL_INSET = 0.5;

function withLiveTrailHead(trail: Vec2[], head: Vec2): Vec2[] {
  if (trail.length === 0) return [{ x: head.x, z: head.z }];
  const last = trail[trail.length - 1];
  if (last.x === head.x && last.z === head.z) return trail;
  return [...trail, { x: head.x, z: head.z }];
}

class CarvePlayground {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: Renderer;
  private readonly particleSystem: ParticleSystem;
  private readonly territoryGrid = new TerritoryGrid();
  private readonly statusEl: HTMLElement;
  private readonly openOfficialBtn: HTMLButtonElement;
  private readonly splashPlayerBtn: HTMLButtonElement;
  private readonly splashEnemyBtn: HTMLButtonElement;
  private readonly spawnEnemyTrailBtn: HTMLButtonElement;
  private readonly resetTrailBtn: HTMLButtonElement;
  private readonly resetSceneBtn: HTMLButtonElement;
  private readonly toggleMovementBtn: HTMLButtonElement;
  private readonly toggleKillBtn: HTMLButtonElement;
  private readonly players: PlaygroundActor[];
  private readonly human: PlaygroundActor;
  private readonly enemyTargets: PlaygroundActor[];
  private readonly inputHandler: InputHandler;

  private lastTime = performance.now();
  private rafId = 0;
  private captureInFlight = false;
  private splashTargetIndex = 0;
  private elapsedTime = 0;
  private movementEnabled = true;
  private killAndDieEnabled = true;
  private lastExitPoint: Vec2 | null = null;

  constructor() {
    this.canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    this.statusEl = document.getElementById("status") as HTMLElement;
    this.openOfficialBtn = document.getElementById(
      "open-official-btn",
    ) as HTMLButtonElement;
    this.splashPlayerBtn = document.getElementById(
      "splash-player-btn",
    ) as HTMLButtonElement;
    this.splashEnemyBtn = document.getElementById(
      "splash-enemy-btn",
    ) as HTMLButtonElement;
    this.spawnEnemyTrailBtn = document.getElementById(
      "spawn-enemy-trail-btn",
    ) as HTMLButtonElement;
    this.resetTrailBtn = document.getElementById(
      "reset-trail-btn",
    ) as HTMLButtonElement;
    this.resetSceneBtn = document.getElementById(
      "reset-scene-btn",
    ) as HTMLButtonElement;
    this.toggleMovementBtn = document.getElementById(
      "toggle-movement-btn",
    ) as HTMLButtonElement;
    this.toggleKillBtn = document.getElementById(
      "toggle-kill-btn",
    ) as HTMLButtonElement;

    this.renderer = new Renderer(this.canvas);
    this.particleSystem = new ParticleSystem(this.renderer.scene);
    this.human = this.makeActor(0, "You", -24, 14, "cyan");
    const enemyA = this.makeActor(1, "Iris", 8, -6, "giraffe");
    const enemyB = this.makeActor(2, "Nova", 22, 12, "tiger");
    const enemyC = this.makeActor(3, "Volt", -2, -22, "frog");
    this.players = [this.human, enemyA, enemyB, enemyC];
    this.enemyTargets = [enemyA, enemyB, enemyC];

    this.inputHandler = new InputHandler(this.human);
    this.human.hasInput = true;

    this.setupUi();
    this.seedScene();
    this.bindLifecycle();
    this.renderer.prewarmRender();
    this.loop();
  }

  private makeActor(
    id: number,
    name: string,
    x: number,
    z: number,
    skinId: string,
  ): PlaygroundActor {
    return Object.assign(
      createPlayer(
        id,
        PLAYER_COLORS[id % PLAYER_COLORS.length],
        PLAYER_COLOR_STRINGS[id % PLAYER_COLOR_STRINGS.length],
        name,
        x,
        z,
        id === 0,
        this.territoryGrid,
        skinId,
      ),
      {
        spawn: { x, z },
        trailVisualLeadInPoints: [],
      },
    );
  }

  private setupUi(): void {
    this.openOfficialBtn.addEventListener("click", () => {
      this.openOfficialGame();
    });

    this.splashPlayerBtn.addEventListener("click", () => {
      if (!this.killAndDieEnabled) return;
      this.spawnSplash(this.human.position, this.human.color, this.human.id);
    });

    this.splashEnemyBtn.addEventListener("click", () => {
      if (!this.killAndDieEnabled) return;
      const target = this.enemyTargets[this.splashTargetIndex];
      this.spawnSplash(target.position, target.color, target.id);
      this.splashTargetIndex =
        (this.splashTargetIndex + 1) % this.enemyTargets.length;
      this.updateStatus();
    });

    this.spawnEnemyTrailBtn.addEventListener("click", () => {
      this.spawnHumanInsideEnemyTerritory();
      this.updateUiState();
      this.updateStatus();
    });

    this.resetTrailBtn.addEventListener("click", () => {
      this.clearTrail();
      this.updateStatus();
    });

    this.resetSceneBtn.addEventListener("click", () => {
      this.resetScene();
    });

    this.toggleMovementBtn.addEventListener("click", () => {
      this.movementEnabled = !this.movementEnabled;
      this.updateUiState();
      this.updateStatus();
    });

    this.toggleKillBtn.addEventListener("click", () => {
      this.killAndDieEnabled = !this.killAndDieEnabled;
      this.updateUiState();
      this.updateStatus();
    });

    window.addEventListener("keydown", (event) => {
      if (event.code === "Space") {
        event.preventDefault();
        if (!this.killAndDieEnabled) return;
        this.spawnSplash(this.human.position, this.human.color, this.human.id);
      }
      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        this.resetScene();
      }
      if (event.key === "c" || event.key === "C") {
        event.preventDefault();
        this.clearTrail();
      }
      if (event.key === "e" || event.key === "E") {
        event.preventDefault();
        this.spawnHumanInsideEnemyTerritory();
        this.updateUiState();
        this.updateStatus();
      }
      if (event.key === "m" || event.key === "M") {
        event.preventDefault();
        this.movementEnabled = !this.movementEnabled;
        this.updateUiState();
        this.updateStatus();
      }
      if (event.key === "k" || event.key === "K") {
        event.preventDefault();
        this.killAndDieEnabled = !this.killAndDieEnabled;
        this.updateUiState();
        this.updateStatus();
      }
      if (event.key === "o" || event.key === "O") {
        event.preventDefault();
        this.openOfficialGame();
      }
    });

    this.updateUiState();
  }

  private bindLifecycle(): void {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.stopLoop();
      } else {
        this.startLoop();
      }
    });
    window.addEventListener("beforeunload", () => {
      this.stopLoop();
      this.inputHandler.dispose();
      this.particleSystem.dispose();
    });
  }

  private seedScene(): void {
    const [human, enemyA, enemyB, enemyC] = this.players;

    this.setBlobTerritory(human, [
      { x: -21.5, z: 12 },
      { x: -26, z: 16 },
    ]);
    this.setBlobTerritory(enemyA, [
      { x: 8, z: -6 },
      { x: 12.5, z: -3.5 },
      { x: 5.8, z: -10.8 },
      { x: 10.4, z: -10.5 },
    ]);
    this.setBlobTerritory(enemyB, [
      { x: 22, z: 12 },
      { x: 26, z: 15.2 },
      { x: 18.4, z: 15.8 },
      { x: 24.8, z: 8.6 },
    ]);
    this.setBlobTerritory(enemyC, [
      { x: -2, z: -22 },
      { x: 2.6, z: -19.2 },
      { x: -5.6, z: -18.8 },
      { x: 0.8, z: -26.6 },
    ]);

    for (const player of this.players) {
      player.position = { x: player.spawn.x, z: player.spawn.z };
      player.moveDir = player.id === 0 ? { x: 1, z: 0 } : { x: 0, z: 1 };
      player.trail = [];
      player.trailStartTangent = null;
      player.trailVisualLeadInPoints = [];
      player.isTrailing = false;
      this.renderer.createAvatar(player.id, player.color, player.skinId);
      this.renderer.updateTerritory(
        player.id,
        this.territoryGrid,
        player.color,
        player.skinId,
      );
      this.renderer.updateAvatar(
        player.id,
        player.position,
        this.elapsedTime,
        player.moveDir,
      );
      this.renderer.updateTrail(
        player.id,
        player.trail,
        player.color,
        player.trailStartTangent,
        null,
      );
    }

    this.renderer.setCameraTarget(this.human.position);
    this.renderer.render();
    this.updateStatus();
  }

  private updateUiState(): void {
    this.toggleMovementBtn.textContent = this.movementEnabled
      ? "Movement: On"
      : "Movement: Off";
    this.toggleMovementBtn.classList.toggle("primary", this.movementEnabled);
    this.toggleKillBtn.textContent = this.killAndDieEnabled
      ? "Kill / Die: On"
      : "Kill / Die: Off";
    this.toggleKillBtn.classList.toggle("primary", this.killAndDieEnabled);
    this.splashPlayerBtn.disabled = !this.killAndDieEnabled;
    this.splashEnemyBtn.disabled = !this.killAndDieEnabled;
  }

  private spawnHumanInsideEnemyTerritory(): void {
    const enemy = this.enemyTargets[this.splashTargetIndex];
    const fromSpawn = {
      x: enemy.spawn.x - this.human.spawn.x,
      z: enemy.spawn.z - this.human.spawn.z,
    };
    const fromSpawnLen =
      Math.sqrt(fromSpawn.x * fromSpawn.x + fromSpawn.z * fromSpawn.z) || 1;
    const outwardDir = {
      x: fromSpawn.x / fromSpawnLen,
      z: fromSpawn.z / fromSpawnLen,
    };
    const outsidePoint = {
      x: enemy.spawn.x + outwardDir.x * 10,
      z: enemy.spawn.z + outwardDir.z * 10,
    };
    const boundaryPoint = enemy.territory.projectExitPoint(
      enemy.spawn,
      outsidePoint,
    );
    const entryPoint = insetBoundaryIntoTerritory(
      boundaryPoint,
      enemy.spawn,
      enemy.territory,
      0.22,
    );
    const deepPoint = {
      x: enemy.spawn.x - outwardDir.x * 1.4,
      z: enemy.spawn.z - outwardDir.z * 1.4,
    };
    const settledPoint = enemy.territory.containsPoint(deepPoint)
      ? deepPoint
      : enemy.spawn;

    this.human.position = { x: settledPoint.x, z: settledPoint.z };
    this.human.moveDir = { x: -outwardDir.x, z: -outwardDir.z };
    this.human.trail = [
      { x: entryPoint.x, z: entryPoint.z },
      { x: settledPoint.x, z: settledPoint.z },
    ];
    this.lastExitPoint = { x: entryPoint.x, z: entryPoint.z };
    this.human.trailVisualLeadInPoints = [];
    this.human.trailStartTangent = null;
    this.human.isTrailing = true;
    this.movementEnabled = false;
    this.renderer.setCameraTarget(this.human.position);
  }

  private setBlobTerritory(player: PlaygroundActor, centers: Vec2[]): void {
    let polygons = createCircleTerritory(centers[0].x, centers[0].z, 4.8);
    for (let i = 1; i < centers.length; i++) {
      polygons = unionTerritories(
        polygons,
        createCircleTerritory(centers[i].x, centers[i].z, 4.4),
      );
    }
    (player.territory as any).setPolygons(polygons, "playground-seed");
  }

  private startLoop(): void {
    if (this.rafId) return;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private stopLoop(): void {
    if (!this.rafId) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private dispose(): void {
    this.stopLoop();
    this.inputHandler.dispose();
    this.particleSystem.dispose();
    this.renderer.dispose();
  }

  private openOfficialGame(): void {
    this.dispose();
    window.location.assign("/");
  }

  private loop = async (timestamp = performance.now()): Promise<void> => {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 1 / 20);
    this.lastTime = timestamp;
    this.rafId = 0;
    this.elapsedTime += dt;

    this.inputHandler.update(dt);
    this.particleSystem.update(dt);
    await this.updateHuman(dt);
    this.syncRenderState();
    this.renderer.render();
    this.updateStatus();

    this.rafId = requestAnimationFrame(this.loop);
  };

  private async updateHuman(dt: number): Promise<void> {
    if (this.captureInFlight) return;
    if (!this.movementEnabled) return;

    const previousPos = {
      x: this.human.position.x,
      z: this.human.position.z,
    };
    const nextPos = clampToArena(computeMovement(this.human, dt));
    const wasInTerritory = this.human.territory.containsPoint(previousPos);
    const nowInTerritory = this.human.territory.containsPoint(nextPos);

    this.human.position = nextPos;

    if (wasInTerritory && !nowInTerritory) {
      this.beginTrailFromBoundary(this.human, previousPos, nextPos);
    }

    if (
      !this.human.isTrailing &&
      !nowInTerritory &&
      this.human.hasInput &&
      this.human.territory.hasTerritory()
    ) {
      if (!wasInTerritory) {
        this.human.isTrailing = true;
        this.human.trail = [{ x: nextPos.x, z: nextPos.z }];
        this.human.trailStartTangent = null;
      }
    }

    if (this.human.isTrailing) {
      if (nowInTerritory && this.human.trail.length >= 2) {
        const reentryPoint = this.human.territory.projectExitPoint(
          nextPos,
          previousPos,
        );
        const captureTrail = [...this.human.trail, reentryPoint];
        this.captureInFlight = true;
        try {
          const affected =
            await this.human.territory.captureFromTrail(captureTrail);
          this.refreshTerritory(this.human);
          for (const id of affected) {
            const player = this.players.find((entry) => entry.id === id);
            if (player) this.refreshTerritory(player);
          }
        } finally {
          this.captureInFlight = false;
          this.clearTrail();
        }
      } else {
        sampleTrailPoint(this.human);
      }
    }
  }

  private beginTrailFromBoundary(
    player: PlaygroundActor,
    insidePos: Vec2,
    outsidePos: Vec2,
  ): void {
    const exitPoint = player.territory.projectExitPoint(insidePos, outsidePos);
    const dirX = outsidePos.x - insidePos.x;
    const dirZ = outsidePos.z - insidePos.z;
    const dirLen = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
    const moveDir = { x: dirX / dirLen, z: dirZ / dirLen };
    const insetStart = {
      x: exitPoint.x + moveDir.x * PLAYGROUND_TRAIL_TAIL_INSET,
      z: exitPoint.z + moveDir.z * PLAYGROUND_TRAIL_TAIL_INSET,
    };

    player.isTrailing = true;
    player.trail = [insetStart];
    this.lastExitPoint = { x: exitPoint.x, z: exitPoint.z };
    player.trailVisualLeadInPoints = [];
    for (const distance of [1.8, 1.25, 0.8, 0.4]) {
      const candidate = {
        x: exitPoint.x - moveDir.x * distance,
        z: exitPoint.z - moveDir.z * distance,
      };
      if (player.territory.containsPoint(candidate)) {
        player.trailVisualLeadInPoints.push(candidate);
      }
    }
    player.trailStartTangent = player.territory.getBoundaryTangent(
      exitPoint,
      moveDir,
    );
  }

  private clearTrail(): void {
    this.human.trail = [];
    this.human.trailStartTangent = null;
    this.human.trailVisualLeadInPoints = [];
    this.human.isTrailing = false;
    this.lastExitPoint = null;
    this.renderer.updateTrail(this.human.id, [], this.human.color, null, null);
  }

  private resetScene(): void {
    this.clearTrail();
    this.movementEnabled = true;
    for (const player of this.players) {
      player.position = { x: player.spawn.x, z: player.spawn.z };
    }
    this.seedScene();
    this.updateUiState();
  }

  private refreshTerritory(player: PlaygroundActor): void {
    this.renderer.updateTerritory(
      player.id,
      this.territoryGrid,
      player.color,
      player.skinId,
    );
  }

  private syncRenderState(): void {
    for (const player of this.players) {
      const renderTrail = player.trail;
      const activeEnemy =
        player.id === this.human.id && player.isTrailing
          ? (this.enemyTargets.find((enemy) =>
              enemy.territory.containsPoint(player.position),
            ) ?? null)
          : null;
      const carveSegment = activeEnemy
        ? getTrailInsideTerritorySegment(
            withLiveTrailHead(renderTrail, player.position),
            activeEnemy.territory,
          )
        : null;
      const carveTrail = carveSegment?.path ?? null;

      this.renderer.updateAvatar(
        player.id,
        player.position,
        this.elapsedTime,
        player.moveDir,
      );
      this.renderer.updateTrail(
        player.id,
        renderTrail,
        player.color,
        player.trailStartTangent,
        carveTrail,
        activeEnemy?.color,
        carveSegment?.startTangent ?? null,
        activeEnemy?.id,
      );
    }

    this.renderer.setCameraTarget(this.human.position);
  }

  private spawnSplash(position: Vec2, color: number, ownerId: number): void {
    this.particleSystem.spawnDeathBurst(position.x, position.z, color, ownerId);
  }

  private updateStatus(): void {
    const insideOwn = this.human.territory.containsPoint(this.human.position);
    const activeEnemy = this.enemyTargets.find((enemy) =>
      enemy.territory.containsPoint(this.human.position),
    );
    this.statusEl.textContent =
      "Position: " +
      this.human.position.x.toFixed(1) +
      ", " +
      this.human.position.z.toFixed(1) +
      "\n" +
      "Trail: " +
      (this.human.isTrailing ? this.human.trail.length + " points" : "idle") +
      "\n" +
      "Inside own territory: " +
      (insideOwn ? "yes" : "no") +
      "\n" +
      "Carving enemy territory: " +
      (activeEnemy ? activeEnemy.name : "no") +
      "\n" +
      "Movement: " +
      (this.movementEnabled ? "enabled" : "paused") +
      "\n" +
      "Kill / die: " +
      (this.killAndDieEnabled ? "enabled" : "disabled") +
      "\n" +
      "Enemy splash target: " +
      this.enemyTargets[this.splashTargetIndex].name;
  }
}

new CarvePlayground();
