import {
  SPAWN_POINTS,
  PLAYER_NAMES,
  BOT_NAMES,
  MAP_SIZE,
  START_RADIUS,
  type Vec2,
  dist2,
} from "./constants.ts";
import {
  type PlayerState,
  createPlayer,
  computeMovement,
  clampToArena,
  sampleTrailPoint,
  InputHandler,
} from "./Player.ts";
import { segmentsIntersect } from "./Collision.ts";
import { BotController, type BotFrameContext } from "./Bot.ts";
import { Renderer } from "./Renderer.ts";
import { ParticleSystem } from "./ParticleSystem.ts";
import { Audio } from "./Audio.ts";
import { HUD } from "./HUD.ts";
import { Menu, type MenuConfig } from "./Menu.ts";
import { SpatialHash } from "./SpatialHash.ts";
import { TerritoryGrid } from "./Territory.ts";
import { SkinSystem } from "./SkinSystem.ts";
import { debugLog } from "./debug-log.ts";

export class Game {
  private renderer: Renderer;
  private particleSystem: ParticleSystem;
  private audio: Audio;
  private hud: HUD;
  private menu: Menu;
  private skinSystem: SkinSystem;

  private players: PlayerState[] = [];
  private human: PlayerState | null = null;
  private botController!: BotController;
  private inputHandler!: InputHandler;

  private trailHash = new SpatialHash(4);
  private indexedTrailLengths: Map<number, number> = new Map();
  private territoryGrid!: TerritoryGrid;
  private running = false;
  private paused = false;
  private gameOver = false;
  private started = false;
  private gameTime = 0;
  private lastFrameTime = 0;
  private hudUpdateTimer = 0;
  private currentLeaderId = -1;
  private peakPct = 0;
  private usedBotNames: Set<string> = new Set();
  private respawnTimers: Map<number, number> = new Map(); // playerId -> time remaining
  private rafId = 0;
  private idleFrameSkip = 0;
  private territoryBusy = new Set<number>();
  private debugTrailGrowthLogged = false;
  private debugHumanTrailStateLogged = false;

  constructor() {
    const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.particleSystem = new ParticleSystem(this.renderer.scene);
    this.audio = new Audio();
    this.hud = new HUD();
    this.skinSystem = new SkinSystem();
    this.menu = new Menu(this.skinSystem);

    this.menu.setCallbacks(
      (config) => this.startGame(config),
      () => this.startGame(this.menu.currentConfig),
      () => this.showMainMenu(),
    );

    this.initSettingsModal();

    window.addEventListener("keydown", (e) => {
      if (e.key === "p" || e.key === "P") this.togglePause();
      if ((e.key === "r" || e.key === "R") && this.gameOver)
        this.startGame(this.menu.currentConfig);
      if (e.key === "Escape" && this.running) this.showMainMenu();
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && this.rafId === 0) {
        this.startRenderLoop();
      }
    });

    this.showMainMenu();
    this.startRenderLoop();
  }

  private settingsOpen = false;

  private initSettingsModal(): void {
    const settingsBtn = document.getElementById("settings-btn");
    const settingsModal = document.getElementById("settings-modal");

    settingsBtn?.addEventListener("click", () => {
      this.settingsOpen = !this.settingsOpen;
      settingsModal?.classList.toggle("visible", this.settingsOpen);
      if (this.settingsOpen && this.running && !this.gameOver) {
        this.paused = true;
      }
    });

    settingsModal?.addEventListener("click", (e) => {
      if (e.target === settingsModal) {
        this.settingsOpen = false;
        settingsModal.classList.remove("visible");
        if (this.running && !this.gameOver) {
          this.paused = false;
        }
      }
    });
  }

  private showMainMenu(): void {
    this.stopGame();
    this.menu.showMenu();
    this.hud.hide();
    document.getElementById("settings-btn")?.classList.add("hidden");
    const joystick = document.getElementById("joystick-zone");
    if (joystick) {
      joystick.classList.add("hidden");
      joystick.classList.remove("visible");
    }
    this.settingsOpen = false;
    document.getElementById("settings-modal")?.classList.remove("visible");
  }

  private startGame(config: MenuConfig): void {
    this.stopGame();
    this.menu.hideMenu();
    this.menu.hideGameOver();

    this.players = [];
    this.gameOver = false;
    this.paused = false;
    this.started = false;
    this.gameTime = 0;
    this.peakPct = 0;
    this.territoryGrid = new TerritoryGrid();
    this.usedBotNames = new Set();
    this.respawnTimers = new Map();
    this.indexedTrailLengths.clear();
    this.trailHash.clear();
    this.territoryBusy.clear();
    this.debugTrailGrowthLogged = false;
    this.debugHumanTrailStateLogged = false;

    // Create players with skins
    const total = 1 + config.botCount;
    const playerSkin =
      this.skinSystem.getSkin(config.playerSkinId) ??
      this.skinSystem.getDefaultSkin();
    const botSkins = this.skinSystem.getShuffledBotSkins(
      playerSkin.id,
      config.botCount,
    );

    for (let i = 0; i < total; i++) {
      const sp = i === 0 ? SPAWN_POINTS[i] : this.pickSpawnPoint(i);
      const skin = i === 0 ? playerSkin : botSkins[i - 1];
      const name = i === 0 ? PLAYER_NAMES[0] : this.pickBotName();
      const player = createPlayer(
        i,
        skin.color,
        skin.colorStr,
        name,
        sp.x,
        sp.z,
        i === 0,
        this.territoryGrid,
        skin.id,
      );
      this.players.push(player);

      const texture = this.skinSystem.getTexture(skin.id);
      const model = this.skinSystem.getModel(skin.id);
      this.renderer.createAvatar(i, skin.color, name, texture, model);

      if (skin.type === "model" && !model) {
        const modelPromise = this.skinSystem.getModelAsync(skin.id);
        if (modelPromise) {
          const playerId = i;
          modelPromise.then((loadedModel) => {
            if (
              this.running &&
              this.players[playerId]?.alive &&
              loadedModel.children.length > 0
            ) {
              this.renderer.replaceAvatarBody(playerId, loadedModel);
            }
          });
        }
      }
    }

    // Bot AI
    this.botController = new BotController(config.difficulty);
    for (const p of this.players) {
      if (!p.isHuman) this.botController.initBot(p);
    }

    this.inputHandler = new InputHandler(this.players[0]);

    // HUD, Settings button, joystick
    this.hud.show();
    document.getElementById("settings-btn")?.classList.remove("hidden");
    const joystick = document.getElementById("joystick-zone");
    if (joystick) {
      joystick.classList.remove("hidden");
      joystick.classList.add("visible");
    }

    // Initial territory + avatar positioning
    for (const p of this.players) {
      this.renderer.updateTerritory(
        p.id,
        this.territoryGrid,
        p.color,
        p.skinId,
      );
      this.renderer.updateAvatar(p.id, p.position, 0);
    }

    this.human = this.players[0];
    this.renderer.setCameraTarget(this.human.position);

    this.running = true;
  }

  private stopGame(): void {
    this.inputHandler?.dispose();
    this.running = false;
    this.human = null;
    this.trailHash.clear();
    this.indexedTrailLengths.clear();
    for (const p of this.players) {
      this.renderer.cleanupPlayer(p.id);
    }
    this.particleSystem.dispose();
  }

  private togglePause(): void {
    if (!this.running || this.gameOver) return;
    this.paused = !this.paused;
    if (this.paused) this.menu.showPause();
    else this.menu.hidePause();
  }

  private readonly _oldPos: Vec2 = { x: 0, z: 0 };

  private updateGame(dt: number): void {
    if (this.paused || this.gameOver) return;

    this.inputHandler.update(dt);

    const players = this.players;
    const playerCount = players.length;
    const botFrameContext = this.buildBotFrameContext(players);

    for (let pi = 1; pi < playerCount; pi++) {
      const p = players[pi];
      if (p.alive) this.botController.update(p, players, botFrameContext, dt);
    }

    const oldPos = this._oldPos;

    for (let pi = 0; pi < playerCount; pi++) {
      const p = players[pi];
      if (!p.alive) continue;
      if (this.territoryBusy.has(p.id)) continue;

      if (p.isHuman && !this.started) {
        if (p.hasInput) this.started = true;
        else continue;
      }

      const rawPos = computeMovement(p, dt);
      const newPos = clampToArena(rawPos);

      oldPos.x = p.position.x;
      oldPos.z = p.position.z;
      const wasInTerritory = p.territory.containsPoint(oldPos);
      const nowInTerritory = p.territory.containsPoint(newPos);

      let hitTrail = false;
      const candidates = this.trailHash.query(oldPos, newPos);
      for (let ci = 0, cLen = candidates.length; ci < cLen; ci++) {
        const cand = candidates[ci];
        const other = players[cand.playerId];
        if (!other || !other.alive) continue;
        const trail = other.trail;
        const si = cand.segIdx;
        if (other.id === p.id && si >= trail.length - 3) continue;
        if (segmentsIntersect(oldPos, newPos, trail[si], trail[si + 1])) {
          if (other.id === p.id) {
            this.killPlayer(p);
            hitTrail = true;
            break;
          } else {
            this.killPlayer(other, p);
          }
        }
      }
      if (hitTrail) continue;

      p.position = newPos;

      // Regenerate territory if it was completely consumed by an enemy capture
      if (p.alive && !p.territory.hasTerritory() && !p.isTrailing) {
        p.territory.initAtSpawn(p.position.x, p.position.z);
        this.renderer.updateTerritory(
          p.id,
          this.territoryGrid,
          p.color,
          p.skinId,
        );
      }

      if (wasInTerritory && !nowInTerritory) {
        this.beginTrailFromBoundary(p, oldPos, newPos);
      }

      // If player is outside territory and not trailing, restart trailing
      if (
        !p.isTrailing &&
        !nowInTerritory &&
        p.hasInput &&
        p.territory.hasTerritory()
      ) {
        if (!wasInTerritory) {
          p.isTrailing = true;
          p.trail = [{ x: p.position.x, z: p.position.z }];
          p.trailStartTangent = null;
        }
      }

      if (p.isTrailing) {
        if (nowInTerritory && p.trail.length >= 3) {
          const reentryPoint = p.territory.projectExitPoint(newPos, oldPos);
          const captureTrail = [...p.trail];
          const lastTrailPoint = captureTrail[captureTrail.length - 1];
          if (
            !lastTrailPoint ||
            Math.abs(lastTrailPoint.x - reentryPoint.x) > 0.001 ||
            Math.abs(lastTrailPoint.z - reentryPoint.z) > 0.001
          ) {
            captureTrail.push(reentryPoint);
          }

          p.trail = [];
          p.trailStartTangent = null;
          p.isTrailing = false;
          this.clearIndexedTrail(p.id);

          this.beginTerritoryOperation([p.id], async () => {
            const affected = await p.territory.captureFromTrail(captureTrail);
            if (!this.running) return;

            for (const otherId of affected) {
              const other = players[otherId];
              if (other && other.alive) {
                other.territory.invalidateCache();
                this.renderer.updateTerritory(
                  other.id,
                  this.territoryGrid,
                  other.color,
                  other.skinId,
                );
              }
            }

            this.renderer.updateTerritory(
              p.id,
              this.territoryGrid,
              p.color,
              p.skinId,
            );
            this.audio.territoryCaptured();
          });
        } else {
          const prevTrailLen = p.trail.length;
          sampleTrailPoint(p);
          if (p.trail.length > prevTrailLen) {
            this.trailHash.insertLatestSegment(p.id, p.trail);
            this.indexedTrailLengths.set(p.id, p.trail.length);
            if (
              p.isHuman &&
              !this.debugTrailGrowthLogged &&
              p.trail.length >= 520
            ) {
              this.debugTrailGrowthLogged = true;
              // #region agent log
              debugLog(
                "H1",
                "Game.ts:387",
                "human trail length exceeded render cap",
                {
                  trailLength: p.trail.length,
                  indexedLength: this.indexedTrailLengths.get(p.id) ?? -1,
                  isTrailing: p.isTrailing,
                  x: Number(p.position.x.toFixed(3)),
                  z: Number(p.position.z.toFixed(3)),
                },
              );
              // #endregion
            }
          }
        }
      }

      if (
        p.isHuman &&
        !nowInTerritory &&
        p.isTrailing &&
        !this.debugHumanTrailStateLogged &&
        p.trail.length >= 520
      ) {
        this.debugHumanTrailStateLogged = true;
        // #region agent log
        debugLog(
          "H3",
          "Game.ts:399",
          "human still trailing outside territory",
          {
            trailLength: p.trail.length,
            hasInput: p.hasInput,
            isTrailing: p.isTrailing,
            x: Number(p.position.x.toFixed(3)),
            z: Number(p.position.z.toFixed(3)),
          },
        );
        // #endregion
      }
    }

    for (let pi = 0; pi < playerCount; pi++) {
      const p = players[pi];
      if (p.alive) {
        this.renderer.updateAvatar(p.id, p.position, this.gameTime, p.moveDir);
        this.renderer.updateTrail(p.id, p.trail, p.color, p.trailStartTangent);
      }
    }

    if (this.human) {
      this.renderer.updateCamera(this.human.position, dt);
    }

    this.hudUpdateTimer += dt;
    if (this.hudUpdateTimer >= 0.15) {
      this.hudUpdateTimer = 0;
      this.hud.update(players);

      const human = this.human;
      if (human && human.alive) {
        const totalArea = MAP_SIZE * MAP_SIZE;
        const currentPct = Math.round(
          (human.territory.computeArea() / totalArea) * 100,
        );
        if (currentPct > this.peakPct) this.peakPct = currentPct;
      }

      let leaderId = -1;
      let bestArea = -1;
      for (let pi = 0; pi < playerCount; pi++) {
        const p = players[pi];
        if (!p.alive) continue;
        const area = p.territory.computeArea();
        if (area > bestArea) {
          bestArea = area;
          leaderId = p.id;
        }
      }
      if (leaderId !== this.currentLeaderId) {
        if (this.currentLeaderId >= 0) {
          const previousLeader = this.players[this.currentLeaderId];
          if (previousLeader) {
            this.renderer.setRingColor(
              this.currentLeaderId,
              previousLeader.color,
            );
          }
        }
        if (leaderId >= 0) {
          this.renderer.setRingColor(leaderId, 0xffd700);
        }
        this.currentLeaderId = leaderId;
      }
    }

    // Process bot respawn timers
    for (const [id, remaining] of this.respawnTimers) {
      const newTime = remaining - dt;
      if (newTime <= 0) {
        this.respawnTimers.delete(id);
        const bot = this.players[id];
        if (bot && !bot.isHuman && !bot.alive) {
          this.respawnBot(bot);
        }
      } else {
        this.respawnTimers.set(id, newTime);
      }
    }

    this.checkGameOver();
  }

  private killPlayer(player: PlayerState, killer?: PlayerState): void {
    const deathPosition = { x: player.position.x, z: player.position.z };
    const takeoverKiller =
      killer && killer.alive && killer.id !== player.id ? killer : null;
    const victimTrail =
      player.trail.length > 0
        ? player.trail.map((point) => ({ ...point }))
        : [];
    const lastTrailPoint = victimTrail[victimTrail.length - 1];
    if (
      lastTrailPoint &&
      (Math.abs(lastTrailPoint.x - deathPosition.x) > 0.001 ||
        Math.abs(lastTrailPoint.z - deathPosition.z) > 0.001)
    ) {
      victimTrail.push(deathPosition);
    }

    player.alive = false;
    player.trail = [];
    player.trailStartTangent = null;
    player.isTrailing = false;
    this.clearIndexedTrail(player.id);

    this.particleSystem.spawnDeathBurst(
      deathPosition.x,
      deathPosition.z,
      player.color,
    );

    if (takeoverKiller) {
      this.beginTerritoryOperation([takeoverKiller.id], async () => {
        const takeover = await player.territory.transferTo(takeoverKiller.id);
        const claimedTrail =
          await takeoverKiller.territory.claimTrailLine(victimTrail);
        if (!this.running) return;

        player.territory.invalidateCache();
        takeoverKiller.territory.invalidateCache();
        for (const otherId of claimedTrail) {
          if (otherId === takeoverKiller.id || otherId === player.id) continue;
          const other = this.players[otherId];
          if (other && other.alive) {
            other.territory.invalidateCache();
            this.renderer.updateTerritory(
              other.id,
              this.territoryGrid,
              other.color,
              other.skinId,
            );
          }
        }
        if (takeover) {
          this.renderer.startTerritoryTakeover(
            player.id,
            takeoverKiller.id,
            deathPosition,
            takeoverKiller.color,
            takeoverKiller.skinId,
          );
        }
        if (takeover || claimedTrail.size > 0) {
          this.renderer.updateTerritory(
            takeoverKiller.id,
            this.territoryGrid,
            takeoverKiller.color,
            takeoverKiller.skinId,
          );
        }
        this.renderer.removeTerritory(player.id);
      });
    } else {
      this.renderer.cleanupPlayer(player.id);
      player.territory.clear();
    }

    this.renderer.hideAvatar(player.id);
    this.renderer.updateTrail(player.id, [], player.color, null);

    if (player.isHuman) this.audio.playerDeath();
    else {
      this.audio.enemyDeath();
      // Schedule bot respawn after 3 seconds
      this.respawnTimers.set(player.id, 3.0);
    }
  }

  private pickBotName(): string {
    const available = BOT_NAMES.filter((n) => !this.usedBotNames.has(n));
    const name =
      available.length > 0
        ? available[Math.floor(Math.random() * available.length)]
        : `Bot ${Math.floor(Math.random() * 999)}`;
    this.usedBotNames.add(name);
    return name;
  }

  private releaseBotName(name: string): void {
    this.usedBotNames.delete(name);
  }

  private beginTrailFromBoundary(
    player: PlayerState,
    insidePos: Vec2,
    outsidePos: Vec2,
  ): void {
    const exitPoint = player.territory.projectExitPoint(insidePos, outsidePos);
    const dirX = outsidePos.x - insidePos.x;
    const dirZ = outsidePos.z - insidePos.z;
    const dirLen = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
    const moveDir = { x: dirX / dirLen, z: dirZ / dirLen };

    player.isTrailing = true;
    player.trail = [exitPoint];
    player.trailStartTangent = player.territory.getBoundaryTangent(
      exitPoint,
      moveDir,
    );
  }

  private isSpawnSafe(spawn: Vec2, excludedPlayerId: number): boolean {
    const sampleRadius = START_RADIUS + 0.75;
    const offsets: Vec2[] = [
      { x: 0, z: 0 },
      { x: sampleRadius, z: 0 },
      { x: -sampleRadius, z: 0 },
      { x: 0, z: sampleRadius },
      { x: 0, z: -sampleRadius },
      { x: sampleRadius * 0.7, z: sampleRadius * 0.7 },
      { x: sampleRadius * 0.7, z: -sampleRadius * 0.7 },
      { x: -sampleRadius * 0.7, z: sampleRadius * 0.7 },
      { x: -sampleRadius * 0.7, z: -sampleRadius * 0.7 },
    ];

    for (const player of this.players) {
      if (!player.alive || player.id === excludedPlayerId) continue;
      for (const offset of offsets) {
        if (
          player.territory.containsPoint({
            x: spawn.x + offset.x,
            z: spawn.z + offset.z,
          })
        ) {
          return false;
        }
      }
    }

    return true;
  }

  private pickSpawnPoint(playerId: number): Vec2 {
    // Prefer the farthest safe spawn; if every fixed spawn is blocked,
    // fall back to the farthest spawn so the game never deadlocks.
    let bestSafeSpawn: Vec2 | null = null;
    let bestSafeMinDist = -1;
    let fallbackSpawn = SPAWN_POINTS[playerId % SPAWN_POINTS.length];
    let fallbackMinDist = -1;

    for (const sp of SPAWN_POINTS) {
      let minDist = Infinity;
      for (const p of this.players) {
        if (!p.alive || p.id === playerId) continue;
        const d = dist2(sp, p.position);
        if (d < minDist) minDist = d;
      }

      if (minDist > fallbackMinDist) {
        fallbackMinDist = minDist;
        fallbackSpawn = sp;
      }

      if (!this.isSpawnSafe(sp, playerId)) continue;

      if (minDist > bestSafeMinDist) {
        bestSafeMinDist = minDist;
        bestSafeSpawn = sp;
      }
    }

    return bestSafeSpawn ?? fallbackSpawn;
  }

  private respawnBot(player: PlayerState): void {
    // Release old name, pick new one
    this.releaseBotName(player.name);
    const newName = this.pickBotName();

    // Pick a safe spawn point
    const sp = this.pickSpawnPoint(player.id);

    // Reset player state
    player.alive = true;
    player.name = newName;
    player.position = { x: sp.x, z: sp.z };
    player.moveDir = { x: 1, z: 0 };
    player.trail = [];
    player.trailStartTangent = null;
    player.isTrailing = false;
    player.hasInput = false;
    this.clearIndexedTrail(player.id);
    this.territoryBusy.delete(player.id);

    // Reinit territory
    player.territory.clear();
    player.territory.initAtSpawn(sp.x, sp.z);

    // Update renderer
    this.renderer.showAvatar(player.id);
    this.renderer.updateAvatarLabel(player.id, newName);
    this.renderer.updateTerritory(
      player.id,
      this.territoryGrid,
      player.color,
      player.skinId,
    );
    this.renderer.updateAvatar(player.id, player.position, 0);

    // Reinit bot AI
    this.botController.initBot(player);
  }

  private checkGameOver(): void {
    const human = this.human;
    if (!human) return;

    const alive = this.players.filter((p) => p.alive);

    if (!human.alive) {
      this.gameOver = true;

      // Crown the winner (last alive, or top territory holder)
      const winner = alive.length === 1 ? alive[0] : null;
      if (winner) this.renderer.showCrown(winner.id);

      const { pct, rank } = this.hud.getHumanScore(this.players);
      const displayPct = Math.max(pct, this.peakPct);
      const newlyUnlocked = this.skinSystem.tryUnlock(this.peakPct);
      document.getElementById("settings-btn")?.classList.add("hidden");
      const joystick = document.getElementById("joystick-zone");
      if (joystick) {
        joystick.classList.add("hidden");
        joystick.classList.remove("visible");
      }
      this.settingsOpen = false;
      document.getElementById("settings-modal")?.classList.remove("visible");
      this.menu.showGameOver(
        `${displayPct}%`,
        `#${rank} of ${this.players.length}`,
        this.hud.getElapsedTime(),
        newlyUnlocked.length > 0 ? newlyUnlocked : undefined,
      );
    }
  }

  private startRenderLoop(): void {
    if (this.rafId) return;
    this.lastFrameTime = performance.now() / 1000;

    const loop = () => {
      if (document.hidden) {
        this.rafId = 0;
        return;
      }
      this.rafId = requestAnimationFrame(loop);
      const now = performance.now() / 1000;
      const dt = Math.min(now - this.lastFrameTime, 0.05); // cap at 50ms
      this.lastFrameTime = now;
      this.gameTime += dt;

      const hasActivity =
        this.running ||
        this.particleSystem.hasActiveParticles() ||
        this.renderer.hasActiveEffects();
      if (!hasActivity) {
        this.idleFrameSkip = (this.idleFrameSkip + 1) % 6;
        if (this.idleFrameSkip !== 0) return;
      } else {
        this.idleFrameSkip = 0;
      }

      if (this.running) {
        this.updateGame(dt);
      }

      this.particleSystem.update(dt);
      this.renderer.render();
    };

    this.rafId = requestAnimationFrame(loop);
  }

  private clearIndexedTrail(playerId: number): void {
    this.trailHash.clearPlayer(playerId);
    this.indexedTrailLengths.delete(playerId);
  }

  private beginTerritoryOperation(
    playerIds: number[],
    operation: () => Promise<void>,
  ): void {
    const lockedPlayers = new Set<number>(playerIds);
    for (const player of this.players) {
      if (player.alive) lockedPlayers.add(player.id);
    }

    for (const playerId of lockedPlayers) {
      this.territoryBusy.add(playerId);
    }

    void operation()
      .catch((error) => {
        console.error("[Game] Territory operation failed", error);
      })
      .finally(() => {
        for (const playerId of lockedPlayers) {
          this.territoryBusy.delete(playerId);
        }
      });
  }

  private buildBotFrameContext(players: PlayerState[]): BotFrameContext {
    let leaderId = -1;
    let bestArea = -1;
    for (const player of players) {
      if (!player.alive) continue;
      const area = player.territory.computeArea();
      if (area > bestArea) {
        bestArea = area;
        leaderId = player.id;
      }
    }
    return { leaderId };
  }
}
