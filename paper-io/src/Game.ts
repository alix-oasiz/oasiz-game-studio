import { SPAWN_POINTS, PLAYER_COLORS, PLAYER_COLOR_STRINGS, PLAYER_NAMES, type Difficulty, type Vec2 } from './constants.ts';
import { type PlayerState, createPlayer, computeMovement, clampToArena, sampleTrailPoint, InputHandler } from './Player.ts';
import { segmentsIntersect } from './Collision.ts';
import { BotController } from './Bot.ts';
import { Renderer } from './Renderer.ts';
import { ParticleSystem } from './ParticleSystem.ts';
import { Audio } from './Audio.ts';
import { HUD } from './HUD.ts';
import { Menu, type MenuConfig } from './Menu.ts';
import { SpatialHash } from './SpatialHash.ts';

export class Game {
  private renderer: Renderer;
  private particleSystem: ParticleSystem;
  private audio: Audio;
  private hud: HUD;
  private menu: Menu;

  private players: PlayerState[] = [];
  private human: PlayerState | null = null;
  private botController!: BotController;
  private inputHandler!: InputHandler;

  private trailHash = new SpatialHash(4);
  private running = false;
  private paused = false;
  private gameOver = false;
  private started = false;
  private gameTime = 0;
  private lastFrameTime = 0;
  private hudUpdateTimer = 0;
  private currentLeaderId = -1;

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.particleSystem = new ParticleSystem(this.renderer.scene);
    this.audio = new Audio();
    this.hud = new HUD();
    this.menu = new Menu();

    this.menu.setCallbacks(
      (config) => this.startGame(config),
      () => this.startGame(this.menu.currentConfig),
      () => this.showMainMenu(),
    );

    this.initSettingsModal();

    window.addEventListener('keydown', (e) => {
      if (e.key === 'p' || e.key === 'P') this.togglePause();
      if ((e.key === 'r' || e.key === 'R') && this.gameOver) this.startGame(this.menu.currentConfig);
      if (e.key === 'Escape' && this.running) this.showMainMenu();
    });

    this.showMainMenu();
    this.startRenderLoop();
  }

  private settingsOpen = false;

  private initSettingsModal(): void {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');

    settingsBtn?.addEventListener('click', () => {
      this.settingsOpen = !this.settingsOpen;
      settingsModal?.classList.toggle('visible', this.settingsOpen);
      if (this.settingsOpen && this.running && !this.gameOver) {
        this.paused = true;
      }
      this.audio.triggerHaptic('light');
    });

    settingsModal?.addEventListener('click', (e) => {
      if (e.target === settingsModal) {
        this.settingsOpen = false;
        settingsModal.classList.remove('visible');
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
    document.getElementById('settings-btn')?.classList.add('hidden');
    this.settingsOpen = false;
    document.getElementById('settings-modal')?.classList.remove('visible');
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

    // Create players
    const total = 1 + config.botCount;
    const maxColorIndex = PLAYER_COLORS.length - 1;
    const selectedColorIndex = Math.max(0, Math.min(config.playerColorIndex, maxColorIndex));
    const botColorIndices = PLAYER_COLORS
      .map((_, idx) => idx)
      .filter((idx) => idx !== selectedColorIndex);
    for (let i = 0; i < total; i++) {
      const sp = SPAWN_POINTS[i];
      const colorIndex = i === 0
        ? selectedColorIndex
        : botColorIndices[(i - 1) % botColorIndices.length];
      const player = createPlayer(
        i, PLAYER_COLORS[colorIndex], PLAYER_COLOR_STRINGS[colorIndex],
        PLAYER_NAMES[i], sp.x, sp.z, i === 0,
      );
      this.players.push(player);
      this.renderer.createAvatar(i, PLAYER_COLORS[colorIndex], PLAYER_NAMES[i]);
    }

    // Bot AI
    this.botController = new BotController(config.difficulty);
    for (const p of this.players) {
      if (!p.isHuman) this.botController.initBot(p);
    }

    // Input — pass camera and canvas for mouse/touch raycasting
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.inputHandler = new InputHandler(this.players[0], this.renderer.camera, canvas);

    // HUD & Settings button
    this.hud.show();
    document.getElementById('settings-btn')?.classList.remove('hidden');

    // Initial territory + avatar positioning
    for (const p of this.players) {
      this.renderer.updateTerritory(p.id, p.territory.polygons, p.color);
      this.renderer.updateAvatar(p.id, p.position, 0);
    }

    this.human = this.players[0];
    this.renderer.setCameraTarget(this.human.position);

    this.running = true;
  }

  private stopGame(): void {
    this.running = false;
    this.human = null;
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

    this.inputHandler.update();

    const players = this.players;
    const playerCount = players.length;

    for (let pi = 1; pi < playerCount; pi++) {
      const p = players[pi];
      if (p.alive) this.botController.update(p, players, dt);
    }

    this.trailHash.clear();
    for (let pi = 0; pi < playerCount; pi++) {
      const p = players[pi];
      if (p.alive && p.trail.length >= 2) {
        this.trailHash.insertTrail(p.id, p.trail);
      }
    }

    const oldPos = this._oldPos;

    for (let pi = 0; pi < playerCount; pi++) {
      const p = players[pi];
      if (!p.alive) continue;

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
            this.killPlayer(other);
          }
        }
      }
      if (hitTrail) continue;

      p.position = newPos;

      // Regenerate territory if it was completely consumed by an enemy capture
      if (p.alive && p.territory.polygons.length === 0 && !p.isTrailing) {
        p.territory.initAtSpawn(p.position.x, p.position.z);
        this.renderer.updateTerritory(p.id, p.territory.polygons, p.color);
        p.territory.dirty = false;
      }

      if (wasInTerritory && !nowInTerritory) {
        p.isTrailing = true;
        p.trail = [{ x: oldPos.x, z: oldPos.z }];
      }

      // If player is outside territory and not trailing (e.g. territory was consumed
      // mid-trail and they re-entered the regenerated zone then left again), ensure
      // trailing restarts so they are never stuck unable to capture.
      if (!p.isTrailing && !nowInTerritory && p.hasInput && p.territory.polygons.length > 0) {
        const wasInLastFrame = p.territory.containsPoint(oldPos);
        if (!wasInLastFrame) {
          p.isTrailing = true;
          p.trail = [{ x: p.position.x, z: p.position.z }];
        }
      }

      if (p.isTrailing) {
        sampleTrailPoint(p);

        if (nowInTerritory && p.trail.length >= 3) {
          p.trail.push({ x: newPos.x, z: newPos.z });
          p.territory.captureFromTrail(p.trail);

          for (let oi = 0; oi < playerCount; oi++) {
            const other = players[oi];
            if (other.id !== p.id && other.alive) {
              other.territory.removeOverlap(p.trail);
              if (other.territory.dirty) {
                this.renderer.updateTerritory(other.id, other.territory.polygons, other.color);
                other.territory.dirty = false;
              }
            }
          }

          p.trail = [];
          p.isTrailing = false;
          this.renderer.updateTerritory(p.id, p.territory.polygons, p.color);
          p.territory.dirty = false;
          this.audio.territoryCaptured();
        }
      }
    }

    for (let pi = 0; pi < playerCount; pi++) {
      const p = players[pi];
      if (p.alive) {
        this.renderer.updateAvatar(p.id, p.position, this.gameTime, p.moveDir);
        this.renderer.updateTrail(p.id, p.trail, p.color);
      }
    }

    if (this.human) {
      this.renderer.updateCamera(this.human.position, dt);
    }

    this.hudUpdateTimer += dt;
    if (this.hudUpdateTimer >= 0.15) {
      this.hudUpdateTimer = 0;
      this.hud.update(players);

      let leaderId = -1;
      let bestArea = -1;
      for (let pi = 0; pi < playerCount; pi++) {
        const p = players[pi];
        if (!p.alive) continue;
        const area = p.territory.computeArea();
        if (area > bestArea) { bestArea = area; leaderId = p.id; }
      }
      if (leaderId !== this.currentLeaderId) {
        if (this.currentLeaderId >= 0) {
          const previousLeader = this.players[this.currentLeaderId];
          if (previousLeader) {
            this.renderer.setRingColor(this.currentLeaderId, previousLeader.color);
          }
        }
        if (leaderId >= 0) {
          this.renderer.setRingColor(leaderId, 0xFFD700);
        }
        this.currentLeaderId = leaderId;
      }
    }

    this.checkGameOver();
  }

  private killPlayer(player: PlayerState): void {
    player.alive = false;
    player.trail = [];
    player.isTrailing = false;

    this.particleSystem.spawnDeathBurst(player.position.x, player.position.z, player.color);
    this.renderer.cleanupPlayer(player.id);
    player.territory.clear();

    if (player.isHuman) this.audio.playerDeath();
    else this.audio.enemyDeath();
  }

  private checkGameOver(): void {
    const human = this.human;
    if (!human) return;

    const alive = this.players.filter(p => p.alive);

    if (!human.alive || alive.length <= 1) {
      this.gameOver = true;

      // Crown the winner (last alive, or top territory holder)
      const winner = alive.length === 1 ? alive[0] : null;
      if (winner) this.renderer.showCrown(winner.id);

      const { pct, rank } = this.hud.getHumanScore(this.players);
      document.getElementById('settings-btn')?.classList.add('hidden');
      this.settingsOpen = false;
      document.getElementById('settings-modal')?.classList.remove('visible');
      this.menu.showGameOver(
        `${pct}%`,
        `#${rank} of ${this.players.length}`,
        this.hud.getElapsedTime(),
      );
    }
  }

  private startRenderLoop(): void {
    this.lastFrameTime = performance.now() / 1000;

    const loop = () => {
      requestAnimationFrame(loop);
      const now = performance.now() / 1000;
      const dt = Math.min(now - this.lastFrameTime, 0.05); // cap at 50ms
      this.lastFrameTime = now;
      this.gameTime += dt;

      if (this.running) {
        this.updateGame(dt);
      }

      this.particleSystem.update(dt);
      this.renderer.render();
    };

    loop();
  }
}
