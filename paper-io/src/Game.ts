import { SPAWN_POINTS, PLAYER_NAMES, BOT_NAMES, MAP_SIZE, type Vec2, dist2 } from './constants.ts';
import { type PlayerState, createPlayer, computeMovement, clampToArena, sampleTrailPoint, InputHandler } from './Player.ts';
import { segmentsIntersect } from './Collision.ts';
import { BotController } from './Bot.ts';
import { Renderer } from './Renderer.ts';
import { ParticleSystem } from './ParticleSystem.ts';
import { Audio } from './Audio.ts';
import { HUD } from './HUD.ts';
import { Menu, type MenuConfig } from './Menu.ts';
import { SpatialHash } from './SpatialHash.ts';
import { TerritoryGrid } from './Territory.ts';
import { SkinSystem } from './SkinSystem.ts';

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

  constructor() {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
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
    const joystick = document.getElementById('joystick-zone');
    if (joystick) { joystick.classList.add('hidden'); joystick.classList.remove('visible'); }
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
    this.peakPct = 0;
    this.territoryGrid = new TerritoryGrid();
    this.usedBotNames = new Set();
    this.respawnTimers = new Map();

    // Create players with skins
    const total = 1 + config.botCount;
    const playerSkin = this.skinSystem.getSkin(config.playerSkinId) ?? this.skinSystem.getDefaultSkin();
    const botSkins = this.skinSystem.getShuffledBotSkins(playerSkin.id, config.botCount);

    for (let i = 0; i < total; i++) {
      const sp = SPAWN_POINTS[i];
      const skin = i === 0 ? playerSkin : botSkins[i - 1];
      const name = i === 0 ? PLAYER_NAMES[0] : this.pickBotName();
      const player = createPlayer(
        i, skin.color, skin.colorStr,
        name, sp.x, sp.z, i === 0, this.territoryGrid, skin.id,
      );
      this.players.push(player);

      const texture = this.skinSystem.getTexture(skin.id);
      const model = this.skinSystem.getModel(skin.id);
      this.renderer.createAvatar(i, skin.color, name, texture, model);

      if (skin.type === 'model' && !model) {
        const modelPromise = this.skinSystem.getModelAsync(skin.id);
        if (modelPromise) {
          const playerId = i;
          modelPromise.then((loadedModel) => {
            if (this.running && this.players[playerId]?.alive && loadedModel.children.length > 0) {
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
    document.getElementById('settings-btn')?.classList.remove('hidden');
    const joystick = document.getElementById('joystick-zone');
    if (joystick) {
      joystick.classList.remove('hidden');
      joystick.classList.add('visible');
    }

    // Initial territory + avatar positioning
    for (const p of this.players) {
      this.renderer.updateTerritory(p.id, this.territoryGrid, p.color);
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

    this.inputHandler.update(dt);

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
      if (p.alive && !p.territory.hasTerritory() && !p.isTrailing) {
        p.territory.initAtSpawn(p.position.x, p.position.z);
        this.renderer.updateTerritory(p.id, this.territoryGrid, p.color);
      }

      if (wasInTerritory && !nowInTerritory) {
        p.isTrailing = true;
        p.trail = [{ x: oldPos.x, z: oldPos.z }];
      }

      // If player is outside territory and not trailing, restart trailing
      if (!p.isTrailing && !nowInTerritory && p.hasInput && p.territory.hasTerritory()) {
        if (!wasInTerritory) {
          p.isTrailing = true;
          p.trail = [{ x: p.position.x, z: p.position.z }];
        }
      }

      if (p.isTrailing) {
        sampleTrailPoint(p);

        if (nowInTerritory && p.trail.length >= 3) {
          p.trail.push({ x: newPos.x, z: newPos.z });

          // Grid-based capture: automatically steals cells from other players
          const affected = p.territory.captureFromTrail(p.trail);

          // Update renderer for affected players whose territory was stolen
          for (const otherId of affected) {
            const other = players[otherId];
            if (other && other.alive) {
              other.territory.invalidateCache();
              this.renderer.updateTerritory(other.id, this.territoryGrid, other.color);
            }
          }

          p.trail = [];
          p.isTrailing = false;
          this.renderer.updateTerritory(p.id, this.territoryGrid, p.color);
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

      const human = this.human;
      if (human && human.alive) {
        const totalArea = MAP_SIZE * MAP_SIZE;
        const currentPct = Math.round((human.territory.computeArea() / totalArea) * 100);
        if (currentPct > this.peakPct) this.peakPct = currentPct;
      }

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

  private killPlayer(player: PlayerState): void {
    player.alive = false;
    player.trail = [];
    player.isTrailing = false;

    this.particleSystem.spawnDeathBurst(player.position.x, player.position.z, player.color);
    this.renderer.cleanupPlayer(player.id);
    player.territory.clear();

    if (player.isHuman) this.audio.playerDeath();
    else {
      this.audio.enemyDeath();
      // Schedule bot respawn after 3 seconds
      this.respawnTimers.set(player.id, 3.0);
    }
  }

  private pickBotName(): string {
    const available = BOT_NAMES.filter(n => !this.usedBotNames.has(n));
    const name = available.length > 0
      ? available[Math.floor(Math.random() * available.length)]
      : `Bot ${Math.floor(Math.random() * 999)}`;
    this.usedBotNames.add(name);
    return name;
  }

  private releaseBotName(name: string): void {
    this.usedBotNames.delete(name);
  }

  private pickSpawnPoint(playerId: number): Vec2 {
    // Pick spawn point farthest from all alive players
    let bestSpawn = SPAWN_POINTS[playerId % SPAWN_POINTS.length];
    let bestMinDist = -1;
    for (const sp of SPAWN_POINTS) {
      let minDist = Infinity;
      for (const p of this.players) {
        if (!p.alive) continue;
        const d = dist2(sp, p.position);
        if (d < minDist) minDist = d;
      }
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestSpawn = sp;
      }
    }
    return bestSpawn;
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
    player.isTrailing = false;
    player.hasInput = false;

    // Reinit territory
    player.territory.clear();
    player.territory.initAtSpawn(sp.x, sp.z);

    // Update renderer
    this.renderer.showAvatar(player.id);
    this.renderer.updateAvatarLabel(player.id, newName);
    this.renderer.updateTerritory(player.id, this.territoryGrid, player.color);
    this.renderer.updateAvatar(player.id, player.position, 0);

    // Reinit bot AI
    this.botController.initBot(player);
  }

  private checkGameOver(): void {
    const human = this.human;
    if (!human) return;

    const alive = this.players.filter(p => p.alive);

    if (!human.alive) {
      this.gameOver = true;

      // Crown the winner (last alive, or top territory holder)
      const winner = alive.length === 1 ? alive[0] : null;
      if (winner) this.renderer.showCrown(winner.id);

      const { pct, rank } = this.hud.getHumanScore(this.players);
      const displayPct = Math.max(pct, this.peakPct);
      const newlyUnlocked = this.skinSystem.tryUnlock(this.peakPct);
      document.getElementById('settings-btn')?.classList.add('hidden');
      const joystick = document.getElementById('joystick-zone');
      if (joystick) { joystick.classList.add('hidden'); joystick.classList.remove('visible'); }
      this.settingsOpen = false;
      document.getElementById('settings-modal')?.classList.remove('visible');
      this.menu.showGameOver(
        `${displayPct}%`,
        `#${rank} of ${this.players.length}`,
        this.hud.getElapsedTime(),
        newlyUnlocked.length > 0 ? newlyUnlocked : undefined,
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
