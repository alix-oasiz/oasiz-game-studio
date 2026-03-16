import {
  ARENA_AREA,
  MAP_RADIUS,
  SPAWN_POINTS,
  PLAYER_NAMES,
  BOT_NAMES,
  START_RADIUS,
  TRAIL_HIT_RADIUS,
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
import { segmentDistanceSq, segmentsHitWithRadius } from "./Collision.ts";
import { BotController, type BotFrameContext } from "./Bot.ts";
import { Renderer } from "./Renderer.ts";
import { ParticleSystem } from "./ParticleSystem.ts";
import { Audio } from "./Audio.ts";
import { HUD } from "./HUD.ts";
import { Menu, type MenuConfig } from "./Menu.ts";
import { SpatialHash } from "./SpatialHash.ts";
import { TerritoryGrid, type Territory } from "./Territory.ts";
import { SkinSystem, type SkinDef } from "./SkinSystem.ts";
import { oasiz } from "@oasiz/sdk";
import {
  buildParallelTerritoryConnectorBridge,
  getTrailInsideTerritorySegment,
} from "./trail-geometry.ts";

function withLiveTrailHead(trail: Vec2[], head: Vec2): Vec2[] {
  if (trail.length === 0) return [{ x: head.x, z: head.z }];
  const last = trail[trail.length - 1];
  if (last.x === head.x && last.z === head.z) return trail;
  return [...trail, { x: head.x, z: head.z }];
}

const BOT_EFFECT_CULL_DIST_SQ = 50 * 50;
const CAPTURE_SCORE_SCALE = 8;
const SPAWN_SEARCH_ATTEMPTS = 140;
const SPAWN_EDGE_MARGIN = START_RADIUS + 1.2;
const MAX_SAME_MAP_RESPAWNS = 2;
const VICTORY_CAPTURE_THRESHOLD = 99.95;
const VICTORY_BONUS_MAX = 20000;
const VICTORY_BONUS_DECAY_PER_SECOND = 100;

const SCORE_MILESTONES = [
  { threshold: 1000, message: "Fantastic", color: "#F6C445" },
  { threshold: 5000, message: "Amazing", color: "#FF8A3D" },
  { threshold: 10000, message: "On Fire", color: "#FF4D6D" },
  { threshold: 20000, message: "Unstoppable", color: "#A855F7" },
  { threshold: 40000, message: "Dominating", color: "#00A1E4" },
  { threshold: 100000, message: "Legendary", color: "#7CFFB2" },
] as const;

function randomSpawnCandidate(): Vec2 {
  const radius = (MAP_RADIUS - SPAWN_EDGE_MARGIN) * Math.sqrt(Math.random());
  const angle = Math.random() * Math.PI * 2;
  return {
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
  };
}

function buildSpawnCircleSamples(sampleRadius: number): Vec2[] {
  const samples: Vec2[] = [{ x: 0, z: 0 }];
  for (const [ringRadius, ringCount] of [
    [sampleRadius, 24],
    [sampleRadius * 0.68, 16],
    [sampleRadius * 0.34, 10],
  ] as const) {
    for (let i = 0; i < ringCount; i++) {
      const angle = (Math.PI * 2 * i) / ringCount;
      samples.push({
        x: Math.cos(angle) * ringRadius,
        z: Math.sin(angle) * ringRadius,
      });
    }
  }
  return samples;
}

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
  private score = 0;
  private usedBotNames: Set<string> = new Set();
  private respawnTimers: Map<number, number> = new Map(); // playerId -> time remaining
  private rafId = 0;
  private idleFrameSkip = 0;
  private territoryBusy = new Set<number>();
  private territoryOpSeq = 0;
  private loggedDeadVisualAnomalies = new Set<number>();
  private deathTimes = new Map<number, number>();
  private loggedHumanTrailEnemyOverlay = false;
  private startCount = 0;
  private firstStartActive = false;
  private introCountdownRemaining = 0;
  private introCountdownActive = false;
  private readonly introCountdownEl: HTMLElement | null;
  private readonly introCountdownValueEl: HTMLElement | null;
  private readonly introCountdownInnerEl: HTMLElement | null;
  private unlockedScoreMilestones = new Set<number>();
  private lastDeathScore = 0;
  private pendingHumanRetryRespawn = false;
  private restartRequiredAfterNoSpawn = false;
  private sameMapRespawnsUsed = 0;

  constructor() {
    const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.particleSystem = new ParticleSystem(this.renderer.scene);
    this.audio = new Audio();
    this.hud = new HUD();
    this.skinSystem = new SkinSystem();
    this.menu = new Menu(this.skinSystem);
    this.introCountdownEl = document.getElementById("start-countdown");
    this.introCountdownInnerEl = document.querySelector(
      ".start-countdown-inner",
    );
    this.introCountdownValueEl = document.getElementById(
      "start-countdown-value",
    );

    this.menu.setCallbacks(
      (config) => this.startGame(config),
      () => this.handlePrimaryGameOverAction(),
      () => this.showMainMenu(),
    );

    this.initSettingsModal();

    window.addEventListener("keydown", (e) => {
      if (e.key === "p" || e.key === "P") this.togglePause();
      if ((e.key === "r" || e.key === "R") && this.gameOver) {
        this.handlePrimaryGameOverAction();
      }
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
    document.getElementById("settings-btn")?.classList.remove("hidden");
    const joystick = document.getElementById("joystick-zone");
    if (joystick) {
      joystick.classList.add("hidden");
      joystick.classList.remove("visible");
    }
    this.settingsOpen = false;
    document.getElementById("settings-modal")?.classList.remove("visible");
    this.hideIntroCountdown();
    this.pendingHumanRetryRespawn = false;
    this.restartRequiredAfterNoSpawn = false;
    this.sameMapRespawnsUsed = 0;
  }

  private startGame(config: MenuConfig): void {
    const setupStartMs = performance.now();
    this.stopGame();
    this.startCount++;
    this.firstStartActive = this.startCount === 1;
    this.introCountdownActive = false;
    this.introCountdownRemaining = 0;
    this.menu.hideMenu();
    this.menu.hideGameOver();

    this.players = [];
    this.gameOver = false;
    this.paused = false;
    this.started = false;
    this.gameTime = 0;
    this.peakPct = 0;
    this.score = 0;
    this.unlockedScoreMilestones.clear();
    this.lastDeathScore = 0;
    this.pendingHumanRetryRespawn = false;
    this.restartRequiredAfterNoSpawn = false;
    this.sameMapRespawnsUsed = 0;
    this.territoryGrid = new TerritoryGrid();
    this.usedBotNames = new Set();
    this.respawnTimers = new Map();
    this.indexedTrailLengths.clear();
    this.trailHash.clear();
    this.territoryBusy.clear();
    this.deathTimes.clear();
    this.loggedHumanTrailEnemyOverlay = false;

    // Create players with skins
    const playerCreateStartMs = performance.now();
    const playerSkin =
      this.skinSystem.getSkin(config.playerSkinId) ??
      this.skinSystem.getDefaultSkin();
    const botSkins = this.skinSystem.getShuffledBotSkins(
      playerSkin.id,
      config.botCount,
    );
    const humanName = oasiz.playerName?.trim() || PLAYER_NAMES[0];

    const createConfiguredPlayer = (
      skin: SkinDef,
      name: string,
      spawn: Vec2,
      isHuman: boolean,
    ): void => {
      const playerId = this.players.length;
      const player = createPlayer(
        playerId,
        skin.color,
        skin.colorStr,
        name,
        spawn.x,
        spawn.z,
        isHuman,
        this.territoryGrid,
        skin.id,
      );
      if (isHuman) {
        player.speed = 6.8;
      }
      this.players.push(player);

      const texture = this.skinSystem.getTexture(skin.id);
      const model = this.skinSystem.getModel(skin.id);
      this.renderer.createAvatar(playerId, skin.color, name, texture, model);

      if (skin.type === "model" && !model) {
        const modelPromise = this.skinSystem.getModelAsync(skin.id);
        if (modelPromise) {
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
    };

    createConfiguredPlayer(playerSkin, humanName, SPAWN_POINTS[0], true);

    for (let i = 0; i < config.botCount; i++) {
      const sp = this.pickSpawnPoint(this.players.length);
      if (!sp) continue;
      createConfiguredPlayer(botSkins[i], this.pickBotName(), sp, false);
    }
    const playerCreateMs = performance.now() - playerCreateStartMs;

    // Bot AI
    this.botController = new BotController(config.difficulty);
    for (const p of this.players) {
      if (!p.isHuman) this.botController.initBot(p);
    }

    this.inputHandler = new InputHandler(this.players[0]);

    // HUD, Settings button, joystick
    this.hud.show();
    this.hud.setPlayerName(humanName);
    this.hud.updateRespawns(this.getRemainingSameMapRespawns());
    document.getElementById("settings-btn")?.classList.remove("hidden");
    const joystick = document.getElementById("joystick-zone");
    if (joystick) {
      joystick.classList.remove("hidden");
      joystick.classList.add("visible");
    }

    // Initial territory + avatar positioning
    const initialVisualStartMs = performance.now();
    for (const p of this.players) {
      this.renderer.updateTerritory(
        p.id,
        this.territoryGrid,
        p.color,
        p.skinId,
      );
      this.renderer.updateAvatar(p.id, p.position, 0);
    }
    const initialVisualMs = performance.now() - initialVisualStartMs;

    this.human = this.players[0];
    this.human.hasInput = true;
    this.started = true;
    this.renderer.setCameraTarget(this.human.position);
    this.renderer.prewarmRender();
    if (this.firstStartActive) {
      this.introCountdownRemaining = 3.15;
      this.introCountdownActive = true;
      this.updateIntroCountdownLabel(3);
      this.introCountdownEl?.classList.add("visible");
    } else {
      this.hideIntroCountdown();
    }

    this.running = true;
    void setupStartMs;
    void playerCreateMs;
    void initialVisualMs;
  }

  private stopGame(): void {
    this.inputHandler?.dispose();
    this.running = false;
    this.human = null;
    this.gameOver = false;
    this.paused = false;
    this.pendingHumanRetryRespawn = false;
    this.restartRequiredAfterNoSpawn = false;
    this.sameMapRespawnsUsed = 0;
    this.introCountdownActive = false;
    this.introCountdownRemaining = 0;
    this.hideIntroCountdown();
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

  private computeCaptureScore(area: number): number {
    return Math.max(1, Math.round(area * CAPTURE_SCORE_SCALE));
  }

  private awardAreaScore(area: number): number {
    if (area < 0.01) return 0;
    const points = this.computeCaptureScore(area);
    this.score += points;
    this.hud.updateScore(this.score);
    this.hud.showFloatingPoints(points);
    this.checkScoreMilestones();
    return points;
  }

  private checkScoreMilestones(): void {
    for (const milestone of SCORE_MILESTONES) {
      if (
        this.score >= milestone.threshold &&
        !this.unlockedScoreMilestones.has(milestone.threshold)
      ) {
        this.unlockedScoreMilestones.add(milestone.threshold);
        this.hud.showScoreCompliment(milestone.message, milestone.color);
        this.audio.scoreMilestone();
      }
    }
  }

  private readonly _oldPos: Vec2 = { x: 0, z: 0 };

  private updateIntroCountdownLabel(value: number): void {
    if (this.introCountdownValueEl) {
      this.introCountdownValueEl.textContent = String(value);
    }
    if (this.introCountdownInnerEl) {
      this.introCountdownInnerEl.classList.remove("countdown-pop");
      void this.introCountdownInnerEl.offsetWidth;
      this.introCountdownInnerEl.classList.add("countdown-pop");
    }
  }

  private hideIntroCountdown(): void {
    this.introCountdownEl?.classList.remove("visible");
  }

  private isIntroCountdownRenderingPaused(): boolean {
    return this.running && this.introCountdownActive;
  }

  private updateGame(dt: number): void {
    if (this.paused) return;

    this.inputHandler.update(dt);
    if (this.introCountdownActive) {
      this.introCountdownRemaining = Math.max(
        0,
        this.introCountdownRemaining - dt,
      );
      if (this.introCountdownRemaining > 0) {
        this.updateIntroCountdownLabel(Math.ceil(this.introCountdownRemaining));
      } else {
        this.introCountdownActive = false;
        this.hideIntroCountdown();
      }
      return;
    }

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
        const appliedHitRadius = other.id === p.id ? 0 : TRAIL_HIT_RADIUS;
        if (
          segmentsHitWithRadius(
            oldPos,
            newPos,
            trail[si],
            trail[si + 1],
            appliedHitRadius,
          )
        ) {
          const hitDistance = Math.sqrt(
            segmentDistanceSq(oldPos, newPos, trail[si], trail[si + 1]),
          );
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
        if (this.isSpawnSafe(p.position, p.id)) {
          p.territory.initAtSpawn(p.position.x, p.position.z);
          this.renderer.updateTerritory(
            p.id,
            this.territoryGrid,
            p.color,
            p.skinId,
          );
        }
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
          p.trailVisualLeadInPoints = [];
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
          p.trailVisualLeadInPoints = [];
          p.trailStartTangent = null;
          p.isTrailing = false;
          this.clearIndexedTrail(p.id);
          const captureOpId = ++this.territoryOpSeq;
          const captureStartedAt = performance.now();
          this.beginTerritoryOperation([p.id], async () => {
            const captureResult =
              await p.territory.captureFromTrail(captureTrail);
            const captureElapsedMs = performance.now() - captureStartedAt;
            if (!this.running) return;

            for (const otherId of captureResult.affected) {
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
            if (captureResult.capturedRegion.length > 0 && p.isHuman) {
              this.awardAreaScore(captureResult.netAreaGained);
              this.audio.captureBubbleBurst();
              if (captureResult.netAreaGained >= 10) {
                this.renderer.startCaptureAssimilation(
                  captureResult.capturedRegion,
                  p.color,
                  p.position,
                );
              }
            }
          });
        } else {
          const prevTrailLen = p.trail.length;
          sampleTrailPoint(p);
          if (p.trail.length > prevTrailLen) {
            this.trailHash.insertLatestSegment(p.id, p.trail);
            this.indexedTrailLengths.set(p.id, p.trail.length);
          }
        }
      }
    }

    for (let pi = 0; pi < playerCount; pi++) {
      const p = players[pi];
      if (p.alive) {
        const renderTrail = p.trail;
        let enemyTerritoryOwner = -1;
        let carveTrail: Vec2[] | null = null;
        let carveStartTangent: Vec2 | null = null;
        if (p.isTrailing) {
          for (let oi = 0; oi < playerCount; oi++) {
            const other = players[oi];
            if (!other.alive || other.id === p.id) continue;
            if (other.territory.containsPoint(p.position)) {
              enemyTerritoryOwner = other.id;
              const carveTrailSource = withLiveTrailHead(
                renderTrail,
                p.position,
              );
              const carveSegment = getTrailInsideTerritorySegment(
                carveTrailSource,
                other.territory,
              );
              carveTrail = carveSegment.path;
              carveStartTangent = carveSegment.startTangent;
              break;
            }
          }
        }

        this.renderer.updateAvatar(p.id, p.position, this.gameTime, p.moveDir);
        this.renderer.updateTrail(
          p.id,
          renderTrail,
          p.color,
          p.trailStartTangent,
          carveTrail,
          enemyTerritoryOwner >= 0
            ? players[enemyTerritoryOwner]?.color
            : undefined,
          carveStartTangent,
          enemyTerritoryOwner >= 0 ? enemyTerritoryOwner : undefined,
        );
        this.loggedDeadVisualAnomalies.delete(p.id);
        this.loggedDeadVisualAnomalies.delete(1000 + p.id);
        if (p.isHuman) {
          if (
            p.isTrailing &&
            p.trail.length >= 2 &&
            enemyTerritoryOwner >= 0 &&
            !this.loggedHumanTrailEnemyOverlay
          ) {
            this.loggedHumanTrailEnemyOverlay = true;
          } else if (!p.isTrailing || enemyTerritoryOwner < 0) {
            this.loggedHumanTrailEnemyOverlay = false;
          }
        }
      } else {
        const visualState = this.renderer.getDebugVisualState(p.id);
        const burstState = this.particleSystem.getDebugBurstState(p.id);
        const deathAt = this.deathTimes.get(p.id) ?? 0;
        const msSinceDeath = deathAt > 0 ? performance.now() - deathAt : 0;
        if (
          visualState.takeoverCount === 0 &&
          (visualState.territoryTaggedCount > 0 || visualState.trailVisible) &&
          !this.loggedDeadVisualAnomalies.has(p.id)
        ) {
          this.loggedDeadVisualAnomalies.add(p.id);
        }
        if (
          msSinceDeath > 700 &&
          burstState.sceneCount > 0 &&
          !this.loggedDeadVisualAnomalies.has(1000 + p.id)
        ) {
          this.loggedDeadVisualAnomalies.add(1000 + p.id);
        }
      }
    }

    if (this.human) {
      this.renderer.updateCamera(this.human.position, dt);
    }

    this.hudUpdateTimer += dt;
    if (this.hudUpdateTimer >= 0.15) {
      this.hudUpdateTimer = 0;
      this.hud.update(players);
      this.hud.updateScore(this.score);

      const human = this.human;
      if (human && human.alive) {
        const currentPct = (human.territory.computeArea() / ARENA_AREA) * 100;
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

    const human = this.human;
    if (
      this.pendingHumanRetryRespawn &&
      human &&
      !human.alive &&
      !this.territoryBusy.has(human.id)
    ) {
      this.pendingHumanRetryRespawn = false;
      if (!this.respawnHuman(human)) {
        this.showNoSpawnAvailableGameOver();
      }
    }

    this.checkVictory();
    this.checkGameOver();
  }

  private killPlayer(player: PlayerState, killer?: PlayerState): void {
    const deathPosition = { x: player.position.x, z: player.position.z };
    const takeoverKiller =
      killer && killer.alive && killer.id !== player.id ? killer : null;
    const humanInvolved = player.isHuman || takeoverKiller?.isHuman === true;
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
    player.hasInput = false;
    player.trail = [];
    player.trailVisualLeadInPoints = [];
    player.trailStartTangent = null;
    player.isTrailing = false;
    this.clearIndexedTrail(player.id);

    if (humanInvolved) {
      this.renderer.startDeathSplat(
        player.id,
        deathPosition,
        player.color,
        player.skinId,
      );
    }
    this.deathTimes.set(player.id, performance.now());
    if (takeoverKiller) {
      this.beginTerritoryOperation([takeoverKiller.id, player.id], async () => {
        const extraClaimPaths: Vec2[][] = [];
        const extraClaimRegions = [];
        const connectorBridge = buildParallelTerritoryConnectorBridge(
          takeoverKiller.territory,
          player.territory,
        );
        if (connectorBridge) {
          extraClaimRegions.push(connectorBridge.region);
        }
        if (victimTrail.length >= 2) {
          extraClaimPaths.push(victimTrail);
        }

        const takeover = await player.territory.transferTo(
          takeoverKiller.id,
          extraClaimPaths,
          extraClaimRegions,
        );
        if (!this.running) return;

        player.territory.invalidateCache();
        takeoverKiller.territory.invalidateCache();
        for (const otherId of takeover?.affected ?? []) {
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
        if (takeover && humanInvolved) {
          this.renderer.startTerritoryTakeover(
            player.id,
            takeoverKiller.id,
            deathPosition,
            takeoverKiller.color,
            takeoverKiller.skinId,
          );
        }
        if (takeover?.changed) {
          this.renderer.updateTerritory(
            takeoverKiller.id,
            this.territoryGrid,
            takeoverKiller.color,
            takeoverKiller.skinId,
          );
        }
        this.hud.showKillBanner(takeoverKiller.name, player.name);
        if (takeoverKiller.isHuman && !player.isHuman) {
          this.awardAreaScore(takeover?.transferredArea ?? 0);
          this.audio.deathSplat();
          this.audio.killConfirm();
          this.renderer.addCapturedFollower(takeoverKiller.id, player.id);
          this.renderer.startAvatarAbsorbPulse(
            takeoverKiller.id,
            takeoverKiller.color,
          );
          this.rebaseActiveTrailToCurrentTerritory(takeoverKiller);
        }
        this.renderer.removeTerritory(player.id);
      });
    } else {
      this.renderer.cleanupPlayer(player.id);
      player.territory.clear();
    }

    this.renderer.hideAvatar(player.id);
    this.renderer.updateTrail(player.id, [], player.color, null, null);
    if (player.isHuman) {
      this.renderer.clearCapturedFollowers(player.id);
      this.audio.playerDeath();
    } else {
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

  private pickDifferentBotName(previousName: string): string {
    const available = BOT_NAMES.filter(
      (name) => name !== previousName && !this.usedBotNames.has(name),
    );
    if (available.length > 0) {
      const name = available[Math.floor(Math.random() * available.length)];
      this.usedBotNames.add(name);
      return name;
    }
    let fallback = previousName;
    while (fallback === previousName) {
      fallback = `Bot ${Math.floor(Math.random() * 999)}`;
    }
    return fallback;
  }

  private pickRespawnBotSkin(previousSkinId: string): SkinDef {
    const humanSkinId = this.human?.skinId ?? "";
    const candidates = this.skinSystem.getShuffledBotSkins(
      humanSkinId,
      this.players.length + 6,
    );
    return (
      candidates.find((skin) => skin.id !== previousSkinId) ??
      this.skinSystem.getSkin(previousSkinId) ??
      this.skinSystem.getDefaultSkin()
    );
  }

  private getSpawnOverlapDetail(
    spawn: Vec2,
    excludedPlayerId: number,
  ): { overlappingIds: number[]; sampleCount: number } {
    const samples = buildSpawnCircleSamples(START_RADIUS + 0.9);

    const overlappingIds = new Set<number>();
    for (const player of this.players) {
      if (!player.alive || player.id === excludedPlayerId) continue;
      for (const sample of samples) {
        if (
          player.territory.containsPoint({
            x: spawn.x + sample.x,
            z: spawn.z + sample.z,
          })
        ) {
          overlappingIds.add(player.id);
          break;
        }
      }
    }

    return { overlappingIds: [...overlappingIds], sampleCount: samples.length };
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

  private isSpawnSafe(spawn: Vec2, excludedPlayerId: number): boolean {
    const samples = buildSpawnCircleSamples(START_RADIUS + 0.9);
    const maxRadiusSq =
      (MAP_RADIUS - SPAWN_EDGE_MARGIN) * (MAP_RADIUS - SPAWN_EDGE_MARGIN);
    for (const sample of samples) {
      const sampleX = spawn.x + sample.x;
      const sampleZ = spawn.z + sample.z;
      if (sampleX * sampleX + sampleZ * sampleZ > maxRadiusSq) {
        return false;
      }
    }

    return (
      this.getSpawnOverlapDetail(spawn, excludedPlayerId).overlappingIds
        .length === 0
    );
  }

  private pickSpawnPoint(playerId: number): Vec2 | null {
    let bestSafeSpawn: Vec2 | null = null;
    let bestSafeMinDist = -1;

    for (let i = 0; i < SPAWN_SEARCH_ATTEMPTS; i++) {
      const sp = randomSpawnCandidate();
      let minDist = Infinity;
      for (const p of this.players) {
        if (!p.alive || p.id === playerId) continue;
        const d = dist2(sp, p.position);
        if (d < minDist) minDist = d;
      }

      if (!this.isSpawnSafe(sp, playerId)) continue;

      if (minDist > bestSafeMinDist) {
        bestSafeMinDist = minDist;
        bestSafeSpawn = sp;
      }
    }
    return bestSafeSpawn;
  }

  private resetPlayerForRespawn(
    player: PlayerState,
    spawn: Vec2,
    options: {
      name?: string;
      skin?: SkinDef;
      hasInput: boolean;
      speed?: number;
    },
  ): void {
    const nextSkin = options.skin;

    if (options.name) {
      player.name = options.name;
    }
    if (nextSkin) {
      player.skinId = nextSkin.id;
      player.color = nextSkin.color;
      player.colorStr = nextSkin.colorStr;
    }

    player.alive = true;
    player.position = { x: spawn.x, z: spawn.z };
    player.moveDir = { x: 1, z: 0 };
    player.trail = [];
    player.trailVisualLeadInPoints = [];
    player.trailStartTangent = null;
    player.isTrailing = false;
    player.hasInput = options.hasInput;
    if (options.speed !== undefined) {
      player.speed = options.speed;
    }
    this.clearIndexedTrail(player.id);
    this.territoryBusy.delete(player.id);
    this.deathTimes.delete(player.id);

    player.territory.clear();
    player.territory.initAtSpawn(spawn.x, spawn.z);

    const skin = this.skinSystem.getSkin(player.skinId);
    const texture = this.skinSystem.getTexture(player.skinId);
    const model = this.skinSystem.getModel(player.skinId);

    this.renderer.showAvatar(player.id);
    this.renderer.updateAvatarLabel(player.id, player.name);
    this.renderer.updateAvatarAppearance(
      player.id,
      player.color,
      texture,
      model,
    );
    this.renderer.updateTerritory(
      player.id,
      this.territoryGrid,
      player.color,
      player.skinId,
    );
    this.renderer.updateAvatar(player.id, player.position, 0);

    if (skin?.type === "model" && !model) {
      const modelPromise = this.skinSystem.getModelAsync(skin.id);
      modelPromise?.then((loadedModel) => {
        if (
          this.running &&
          this.players[player.id]?.alive &&
          this.players[player.id]?.skinId === skin.id &&
          loadedModel.children.length > 0
        ) {
          this.renderer.replaceAvatarBody(player.id, loadedModel);
        }
      });
    }
  }

  private respawnBot(player: PlayerState): void {
    this.releaseBotName(player.name);
    const newName = this.pickDifferentBotName(player.name);
    const newSkin = this.pickRespawnBotSkin(player.skinId);

    const sp = this.pickSpawnPoint(player.id);
    if (!sp) return;
    this.resetPlayerForRespawn(player, sp, {
      name: newName,
      skin: newSkin,
      hasInput: false,
    });
    this.botController.initBot(player);
  }

  private respawnHuman(player: PlayerState): boolean {
    const sp = this.pickSpawnPoint(player.id);
    if (!sp) return false;
    this.resetPlayerForRespawn(player, sp, {
      hasInput: true,
      speed: 6.8,
    });
    this.score = 0;
    this.lastDeathScore = 0;
    this.unlockedScoreMilestones.clear();
    this.hud.updateScore(0);
    this.inputHandler.updatePlayer(player);
    this.renderer.setCameraTarget(player.position);
    document.getElementById("settings-btn")?.classList.remove("hidden");
    const joystick = document.getElementById("joystick-zone");
    if (joystick) {
      joystick.classList.remove("hidden");
      joystick.classList.add("visible");
    }
    return true;
  }

  private showNoSpawnAvailableGameOver(): void {
    const { rank } = this.hud.getHumanScore(this.players);
    this.gameOver = true;
    this.pendingHumanRetryRespawn = false;
    this.restartRequiredAfterNoSpawn = true;
    this.menu.showGameOver(
      this.lastDeathScore.toLocaleString(),
      `#${rank} of ${this.players.length}`,
      this.hud.getElapsedTime(),
      undefined,
      {
        message: "No space left to spawn.",
        primaryLabel: "Restart Game",
        respawnsLeftText: `${this.getRemainingSameMapRespawns()}/${MAX_SAME_MAP_RESPAWNS}`,
      },
    );
  }

  private hideGameplayUiForModal(): void {
    this.paused = false;
    this.menu.hidePause();
    document.getElementById("settings-btn")?.classList.add("hidden");
    const joystick = document.getElementById("joystick-zone");
    if (joystick) {
      joystick.classList.add("hidden");
      joystick.classList.remove("visible");
    }
    this.settingsOpen = false;
    document.getElementById("settings-modal")?.classList.remove("visible");
  }

  private computeVictoryBonus(elapsedSeconds: number): number {
    return Math.max(
      0,
      Math.round(
        VICTORY_BONUS_MAX - elapsedSeconds * VICTORY_BONUS_DECAY_PER_SECOND,
      ),
    );
  }

  private showVictoryGameOver(): void {
    const human = this.human;
    if (!human) return;

    const elapsedSeconds = this.hud.getElapsedSeconds();
    const bonus = this.computeVictoryBonus(elapsedSeconds);
    if (bonus > 0) {
      this.hud.showFloatingPoints(bonus);
    }
    this.score += bonus;
    this.lastDeathScore = this.score;
    this.hud.updateScore(this.score);
    this.hud.updateRespawns(this.getRemainingSameMapRespawns());
    oasiz.submitScore(this.lastDeathScore);

    this.gameOver = true;
    this.pendingHumanRetryRespawn = false;
    this.restartRequiredAfterNoSpawn = true;
    this.renderer.showCrown(human.id);
    this.audio.scoreMilestone();

    const newlyUnlocked = this.skinSystem.tryUnlock(100);
    this.hideGameplayUiForModal();
    this.menu.showGameOver(
      this.lastDeathScore.toLocaleString(),
      `#1 of ${this.players.length}`,
      this.hud.getElapsedTime(),
      newlyUnlocked.length > 0 ? newlyUnlocked : undefined,
      {
        title: "Congratulations!",
        message:
          bonus > 0
            ? `You have captured the whole map! Time Bonus: +${bonus.toLocaleString()}`
            : "You have captured the whole map!",
        primaryLabel: "Restart Game",
        respawnsLeftText: `${this.getRemainingSameMapRespawns()}/${MAX_SAME_MAP_RESPAWNS}`,
      },
    );
  }

  private getRemainingSameMapRespawns(): number {
    return Math.max(0, MAX_SAME_MAP_RESPAWNS - this.sameMapRespawnsUsed);
  }

  private showNoRespawnsLeftGameOver(): void {
    const { rank } = this.hud.getHumanScore(this.players);
    this.gameOver = true;
    this.pendingHumanRetryRespawn = false;
    this.restartRequiredAfterNoSpawn = true;
    this.menu.showGameOver(
      this.lastDeathScore.toLocaleString(),
      `#${rank} of ${this.players.length}`,
      this.hud.getElapsedTime(),
      undefined,
      {
        message: "No same-map respawns left.",
        primaryLabel: "Restart Game",
        respawnsLeftText: `0/${MAX_SAME_MAP_RESPAWNS}`,
      },
    );
  }

  private handlePrimaryGameOverAction(): void {
    if (this.restartRequiredAfterNoSpawn) {
      this.startGame(this.menu.currentConfig);
      return;
    }
    this.retryCurrentMatch();
  }

  private retryCurrentMatch(): void {
    const human = this.human;
    if (!this.running || !human || human.alive) return;
    if (this.sameMapRespawnsUsed >= MAX_SAME_MAP_RESPAWNS) {
      this.showNoRespawnsLeftGameOver();
      return;
    }

    this.menu.hideGameOver();
    this.gameOver = false;
    this.paused = false;
    this.pendingHumanRetryRespawn = true;
    this.restartRequiredAfterNoSpawn = false;
    this.sameMapRespawnsUsed += 1;
    this.hud.updateRespawns(this.getRemainingSameMapRespawns());

    this.settingsOpen = false;
    document.getElementById("settings-modal")?.classList.remove("visible");

    if (!this.territoryBusy.has(human.id)) {
      this.pendingHumanRetryRespawn = false;
      if (!this.respawnHuman(human)) {
        this.showNoSpawnAvailableGameOver();
      }
    }
  }

  private checkVictory(): void {
    const human = this.human;
    if (
      !human ||
      !human.alive ||
      this.gameOver ||
      this.pendingHumanRetryRespawn
    ) {
      return;
    }

    const currentPct = (human.territory.computeArea() / ARENA_AREA) * 100;
    if (currentPct >= VICTORY_CAPTURE_THRESHOLD) {
      this.peakPct = Math.max(this.peakPct, 100);
      this.showVictoryGameOver();
    }
  }

  private checkGameOver(): void {
    const human = this.human;
    if (!human) return;

    const alive = this.players.filter((p) => p.alive);

    if (!human.alive && !this.gameOver && !this.pendingHumanRetryRespawn) {
      this.gameOver = true;
      this.restartRequiredAfterNoSpawn = false;
      this.lastDeathScore = this.score;
      oasiz.submitScore(this.lastDeathScore);

      // Crown the winner (last alive, or top territory holder)
      const winner = alive.length === 1 ? alive[0] : null;
      if (winner) this.renderer.showCrown(winner.id);

      const { rank } = this.hud.getHumanScore(this.players);
      const newlyUnlocked = this.skinSystem.tryUnlock(this.peakPct);
      this.hideGameplayUiForModal();
      this.audio.gameOverLose();
      this.menu.showGameOver(
        this.lastDeathScore.toLocaleString(),
        `#${rank} of ${this.players.length}`,
        this.hud.getElapsedTime(),
        newlyUnlocked.length > 0 ? newlyUnlocked : undefined,
        {
          respawnsLeftText: `${this.getRemainingSameMapRespawns()}/${MAX_SAME_MAP_RESPAWNS}`,
        },
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
      const frameStartMs = performance.now();
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

      let updateMs = 0;
      if (this.running) {
        const updateStartMs = performance.now();
        this.updateGame(dt);
        updateMs = performance.now() - updateStartMs;
      }

      if (this.isIntroCountdownRenderingPaused()) {
        return;
      }

      const particleStartMs = performance.now();
      this.particleSystem.update(dt);
      const particleMs = performance.now() - particleStartMs;
      const renderStartMs = performance.now();
      this.renderer.render();
      const renderMs = performance.now() - renderStartMs;
      this.renderer.reportFrameTime(updateMs + particleMs + renderMs);
      const frameMs = performance.now() - frameStartMs;
      void frameMs;
      void updateMs;
      void particleMs;
      void renderMs;
    };

    this.rafId = requestAnimationFrame(loop);
  }

  private clearIndexedTrail(playerId: number): void {
    this.trailHash.clearPlayer(playerId);
    this.indexedTrailLengths.delete(playerId);
  }

  private getDistanceSqToHuman(pos: Vec2): number {
    const humanPos = this.human?.position;
    if (!humanPos) return 0;
    return (pos.x - humanPos.x) ** 2 + (pos.z - humanPos.z) ** 2;
  }

  private isPlayerVisualRelevant(player: PlayerState): boolean {
    return (
      player.isHuman ||
      this.getDistanceSqToHuman(player.position) <= BOT_EFFECT_CULL_DIST_SQ
    );
  }

  private rebaseActiveTrailToCurrentTerritory(player: PlayerState): void {
    if (!player.isTrailing) return;

    if (player.territory.containsPoint(player.position)) {
      player.trail = [];
      player.trailVisualLeadInPoints = [];
      player.trailStartTangent = null;
      player.isTrailing = false;
      this.clearIndexedTrail(player.id);
      return;
    }

    const insidePoint = player.territory.getCentroid();
    const exitPoint = player.territory.projectExitPoint(
      insidePoint,
      player.position,
    );
    const dirX = player.position.x - exitPoint.x;
    const dirZ = player.position.z - exitPoint.z;
    const dirLen = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
    const moveDir = { x: dirX / dirLen, z: dirZ / dirLen };

    player.isTrailing = true;
    player.trail = [exitPoint, { x: player.position.x, z: player.position.z }];
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
    this.clearIndexedTrail(player.id);
    this.trailHash.insertLatestSegment(player.id, player.trail);
    this.indexedTrailLengths.set(player.id, player.trail.length);
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
