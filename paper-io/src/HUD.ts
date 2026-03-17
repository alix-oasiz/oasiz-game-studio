import { ARENA_AREA, MAP_RADIUS } from "./constants.ts";
import { type PlayerState } from "./Player.ts";
import { type TerritoryMultiPolygon } from "./polygon-ops.ts";

interface CachedEntry {
  id: number;
  name: string;
  pct: number;
  alive: boolean;
  el: HTMLElement;
  pctEl: HTMLElement;
  nameEl: HTMLElement;
  rankEl: HTMLElement;
}

export class HUD {
  private static readonly maxRespawns = 1;
  private static readonly mappTerritoryRefreshMs = 400;
  private hudEl: HTMLElement;
  private playerNameEl: HTMLElement;
  private playerPct: HTMLElement;
  private playerDot: HTMLElement;
  private scoreEl: HTMLElement;
  private timerEl: HTMLElement;
  private respawnsEl: HTMLElement;
  private lbEntries: HTMLElement;
  private mappPanel: HTMLElement;
  private mappCanvas: HTMLCanvasElement;
  private mappCtx: CanvasRenderingContext2D;
  private mappLayerCanvas: HTMLCanvasElement;
  private mappLayerCtx: CanvasRenderingContext2D;
  private scoreFxLayer: HTMLElement;
  private startTime = 0;
  private cachedEntries = new Map<number, CachedEntry>();
  private complimentQueue: Array<{ message: string; color: string }> = [];
  private complimentTimer: number | null = null;
  private lastPlayerPct = "";
  private lastDisplayedScore = -1;
  private lastLeaderboardRefreshAt = 0;
  private lastLeaderboardSignature = "";
  private lastMappLayerDrawAt = 0;
  private readonly isMobile: boolean;
  private mappWidth = 0;
  private mappHeight = 0;
  private mappCx = 0;
  private mappCy = 0;
  private mappRadius = 0;
  private mappScale = 0;

  constructor() {
    this.hudEl = document.getElementById("hud")!;
    this.playerNameEl = document.getElementById("player-name")!;
    this.playerPct = document.getElementById("player-pct")!;
    this.playerDot = document.getElementById("player-dot")!;
    this.scoreEl = document.getElementById("hud-score")!;
    this.timerEl = document.getElementById("hud-timer")!;
    this.respawnsEl = document.getElementById("hud-respawns")!;
    this.lbEntries = document.getElementById("lb-entries")!;
    this.mappPanel = document.getElementById("mapp-panel")!;
    this.mappCanvas = document.getElementById(
      "mapp-canvas",
    ) as HTMLCanvasElement;
    this.mappCtx = this.mappCanvas.getContext("2d")!;
    this.mappLayerCanvas = document.createElement("canvas");
    this.mappLayerCtx = this.mappLayerCanvas.getContext("2d")!;
    this.scoreFxLayer = document.getElementById("score-fx-layer")!;
    this.isMobile = window.matchMedia("(pointer: coarse)").matches;
    window.addEventListener("resize", () => this.refreshMappMetrics());
  }

  show(): void {
    this.hudEl.classList.add("visible");
    this.mappPanel.classList.add("visible");
    this.startTime = performance.now();
    this.cachedEntries.clear();
    this.lbEntries.replaceChildren();
    this.lastPlayerPct = "";
    this.lastDisplayedScore = -1;
    this.lastLeaderboardRefreshAt = 0;
    this.lastLeaderboardSignature = "";
    this.lastMappLayerDrawAt = 0;
    this.clearComplimentQueue();
    this.scoreFxLayer.replaceChildren();
    this.refreshMappMetrics();
  }

  hide(): void {
    this.hudEl.classList.remove("visible");
    this.mappPanel.classList.remove("visible");
    this.clearComplimentQueue();
    this.scoreFxLayer.replaceChildren();
  }

  setPlayerName(name: string): void {
    this.playerNameEl.textContent = name;
  }

  setMappVisible(visible: boolean): void {
    this.mappPanel.classList.toggle("visible", visible);
  }

  update(players: PlayerState[]): void {
    const totalArea = ARENA_AREA;

    // Player percentage — only update DOM if changed
    const human = players.find((p) => p.isHuman);
    if (human) {
      this.applyHudTheme(human.colorStr);
      const pct = this.formatPct(
        (human.territory.computeArea() / totalArea) * 100,
      );
      if (pct !== this.lastPlayerPct) {
        this.lastPlayerPct = pct;
        this.playerPct.textContent = `${pct}%`;
        this.playerDot.style.background = human.colorStr;
      }
    }

    // Timer
    const elapsed = (performance.now() - this.startTime) / 1000;
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    const timerText = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    if (this.timerEl.textContent !== timerText) {
      this.timerEl.textContent = timerText;
    }
    this.updateLeaderboard(players, totalArea);
    this.drawMapp(players);
  }

  updateScore(score: number): void {
    if (score === this.lastDisplayedScore) return;
    this.lastDisplayedScore = score;
    this.scoreEl.textContent = score.toLocaleString();
  }

  updateRespawns(remaining: number): void {
    this.respawnsEl.textContent = `Respawns: ${remaining}/${HUD.maxRespawns}`;
  }

  showFloatingPoints(points: number): void {
    if (points <= 0) return;
    const el = document.createElement("div");
    el.className = "floating-score";
    el.textContent = `+${points.toLocaleString()}`;
    el.style.color = this.getFloatingScoreColor(points);
    this.scoreFxLayer.appendChild(el);
    window.setTimeout(() => {
      el.remove();
    }, 1100);
  }

  showScoreCompliment(message: string, color: string): void {
    this.complimentQueue.push({ message, color });
    if (this.complimentTimer !== null) return;
    this.showNextCompliment();
  }

  private showNextCompliment(): void {
    const next = this.complimentQueue.shift();
    if (!next) {
      this.complimentTimer = null;
      return;
    }

    const el = document.createElement("div");
    el.className = "score-compliment";
    el.textContent = next.message;
    el.style.color = next.color;
    this.scoreFxLayer.appendChild(el);

    this.complimentTimer = window.setTimeout(() => {
      el.remove();
      this.complimentTimer = window.setTimeout(() => {
        this.complimentTimer = null;
        this.showNextCompliment();
      }, 140);
    }, 1600);
  }

  showKillBanner(killerName: string, victimName: string): void {
    const el = document.createElement("div");
    el.className = "kill-banner";
    el.textContent = `${killerName} eliminated ${victimName}`;
    this.scoreFxLayer.appendChild(el);
    window.setTimeout(() => {
      el.remove();
    }, 1400);
  }

  private clearComplimentQueue(): void {
    this.complimentQueue = [];
    if (this.complimentTimer !== null) {
      window.clearTimeout(this.complimentTimer);
      this.complimentTimer = null;
    }
  }

  private getFloatingScoreColor(points: number): string {
    if (points >= 3000) return "#FF4D6D";
    if (points >= 2000) return "#A855F7";
    if (points >= 1000) return "#F6C445";
    if (points >= 500) return "#00A1E4";
    return "#FFFFFF";
  }

  private updateLeaderboard(players: PlayerState[], totalArea: number): void {
    const now = performance.now();
    const refreshMs = this.isMobile ? 320 : 140;
    if (
      this.lastLeaderboardRefreshAt !== 0 &&
      now - this.lastLeaderboardRefreshAt < refreshMs
    ) {
      return;
    }

    const entries = players
      .map((p) => ({
        id: p.id,
        name: p.name,
        pct: Number(
          this.formatPct((p.territory.computeArea() / totalArea) * 100),
        ),
        alive: p.alive,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3);

    const signature = entries
      .map(
        (entry, index) =>
          `${index + 1}:${entry.id}:${entry.name}:${entry.pct}:${entry.alive ? 1 : 0}`,
      )
      .join("|");
    this.lastLeaderboardRefreshAt = now;
    if (signature === this.lastLeaderboardSignature) {
      return;
    }
    this.lastLeaderboardSignature = signature;

    const fragment = document.createDocumentFragment();
    const visibleIds = new Set<number>();
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const cached = this.getOrCreateLeaderboardEntry(entry.id);
      visibleIds.add(entry.id);

      const nextClass = `lb-entry rank-${i + 1}${entry.alive ? "" : " dead"}`;
      if (cached.el.className !== nextClass) {
        cached.el.className = nextClass;
      }
      if (cached.rankEl.textContent !== `${i + 1}`) {
        cached.rankEl.textContent = `${i + 1}`;
      }
      if (cached.name !== entry.name) {
        cached.name = entry.name;
        cached.nameEl.textContent = entry.name;
      }
      if (cached.pct !== entry.pct) {
        cached.pct = entry.pct;
        cached.pctEl.textContent = `${entry.pct}%`;
      }
      cached.alive = entry.alive;
      fragment.appendChild(cached.el);
    }

    this.lbEntries.replaceChildren(fragment);
    for (const id of Array.from(this.cachedEntries.keys())) {
      if (!visibleIds.has(id)) {
        this.cachedEntries.delete(id);
      }
    }
  }

  private getOrCreateLeaderboardEntry(id: number): CachedEntry {
    const existing = this.cachedEntries.get(id);
    if (existing) return existing;

    const el = document.createElement("div");
    el.className = "lb-entry";

    const rankEl = document.createElement("span");
    rankEl.className = "lb-rank";

    const nameEl = document.createElement("span");
    nameEl.className = "lb-name";

    const pctEl = document.createElement("span");
    pctEl.className = "lb-pct";

    el.appendChild(rankEl);
    el.appendChild(nameEl);
    el.appendChild(pctEl);

    const created: CachedEntry = {
      id,
      name: "",
      pct: -1,
      alive: true,
      el,
      pctEl,
      nameEl,
      rankEl,
    };
    this.cachedEntries.set(id, created);
    return created;
  }

  getElapsedTime(): string {
    const elapsed = this.getElapsedSeconds();
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  getElapsedSeconds(): number {
    return (performance.now() - this.startTime) / 1000;
  }

  getHumanScore(players: PlayerState[]): { pct: number; rank: number } {
    const totalArea = ARENA_AREA;
    const sorted = players
      .map((p) => ({
        id: p.id,
        area: p.territory.computeArea(),
        isHuman: p.isHuman,
      }))
      .sort((a, b) => b.area - a.area);

    const humanIdx = sorted.findIndex((e) => e.isHuman);
    const humanArea = sorted[humanIdx]?.area ?? 0;
    return {
      pct: Number(this.formatPct((humanArea / totalArea) * 100)),
      rank: humanIdx + 1,
    };
  }

  private formatPct(pct: number): string {
    return pct.toFixed(2);
  }

  private applyHudTheme(color: string): void {
    this.hudEl.style.setProperty("--hud-accent", color);
    this.hudEl.style.setProperty(
      "--hud-accent-strong",
      this.darkenHex(color, 0.18),
    );
    this.hudEl.style.setProperty("--hud-depth-1", this.darkenHex(color, 0.22));
    this.hudEl.style.setProperty("--hud-depth-2", this.darkenHex(color, 0.36));
    this.hudEl.style.setProperty("--hud-depth-3", this.darkenHex(color, 0.5));
    this.hudEl.style.setProperty("--hud-depth-4", this.darkenHex(color, 0.64));
  }

  private darkenHex(hex: string, amount: number): string {
    const rgb = this.hexToRgb(hex);
    if (!rgb) return hex;
    const scale = Math.max(0, 1 - amount);
    const r = Math.round(rgb.r * scale);
    const g = Math.round(rgb.g * scale);
    const b = Math.round(rgb.b * scale);
    return `rgb(${r}, ${g}, ${b})`;
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const normalized = hex.trim().replace("#", "");
    const value =
      normalized.length === 3
        ? normalized
            .split("")
            .map((char) => char + char)
            .join("")
        : normalized;
    if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
    return {
      r: Number.parseInt(value.slice(0, 2), 16),
      g: Number.parseInt(value.slice(2, 4), 16),
      b: Number.parseInt(value.slice(4, 6), 16),
    };
  }

  private drawMapp(players: PlayerState[]): void {
    if (this.mappWidth === 0 || this.mappHeight === 0) {
      this.refreshMappMetrics();
      if (this.mappWidth === 0 || this.mappHeight === 0) return;
    }

    const width = this.mappWidth;
    const height = this.mappHeight;
    const ctx = this.mappCtx;
    const now = performance.now();
    const territoryDirty =
      this.lastMappLayerDrawAt === 0 ||
      players.some((player) => player.alive && player.territory.dirty);
    const territoryRefreshMs = this.isMobile
      ? HUD.mappTerritoryRefreshMs + 260
      : HUD.mappTerritoryRefreshMs;
    const needsLayerRefresh =
      territoryDirty &&
      (this.lastMappLayerDrawAt === 0 ||
        now - this.lastMappLayerDrawAt >= territoryRefreshMs);

    if (needsLayerRefresh) {
      const layerCtx = this.mappLayerCtx;
      layerCtx.clearRect(0, 0, width, height);

      layerCtx.save();
      layerCtx.beginPath();
      layerCtx.arc(this.mappCx, this.mappCy, this.mappRadius, 0, Math.PI * 2);
      layerCtx.clip();

      layerCtx.fillStyle = "#dff4ff";
      layerCtx.fillRect(0, 0, width, height);

      for (const player of players) {
        if (!player.alive) continue;
        const polygons = player.territory.getPolygonsView();
        if (polygons.length === 0) continue;
        this.fillTerritoryOnMapp(
          polygons,
          player.colorStr,
          player.isHuman ? 0.42 : 0.26,
          this.mappCx,
          this.mappCy,
          this.mappScale,
          layerCtx,
        );
        player.territory.dirty = false;
      }

      layerCtx.restore();
      this.lastMappLayerDrawAt = now;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(this.mappLayerCanvas, 0, 0);

    for (const player of players) {
      if (!player.alive) continue;
      const px = this.mappCx + player.position.x * this.mappScale;
      const py = this.mappCy + player.position.z * this.mappScale;
      const dotRadius = player.isHuman ? 5.1 : 3.9;
      ctx.beginPath();
      ctx.arc(px, py, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = player.colorStr;
      ctx.fill();
      ctx.lineWidth = player.isHuman ? 2.2 : 1.3;
      ctx.strokeStyle = player.isHuman ? "#00A1E4" : "rgba(255,255,255,0.85)";
      ctx.stroke();
    }
  }

  private fillTerritoryOnMapp(
    polygons: TerritoryMultiPolygon,
    color: string,
    alpha: number,
    cx: number,
    cy: number,
    scale: number,
    ctx: CanvasRenderingContext2D,
  ): void {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (const polygon of polygons) {
      ctx.beginPath();
      this.traceLoopOnMapp(polygon.outer, cx, cy, scale, ctx);
      for (const hole of polygon.holes) {
        this.traceLoopOnMapp(hole, cx, cy, scale, ctx);
      }
      ctx.fill("evenodd");
    }
    ctx.restore();
  }

  private traceLoopOnMapp(
    loop: Array<{ x: number; z: number }>,
    cx: number,
    cy: number,
    scale: number,
    ctx: CanvasRenderingContext2D,
  ): void {
    if (loop.length === 0) return;
    ctx.moveTo(cx + loop[0].x * scale, cy + loop[0].z * scale);
    for (let i = 1; i < loop.length; i++) {
      ctx.lineTo(cx + loop[i].x * scale, cy + loop[i].z * scale);
    }
    ctx.closePath();
  }

  private refreshMappMetrics(): void {
    const rect = this.mappCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      this.mappWidth = 0;
      this.mappHeight = 0;
      return;
    }

    const dpr = Math.min(
      window.devicePixelRatio || 1,
      this.isMobile ? 1.1 : 1.6,
    );
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.mappCanvas.width !== width || this.mappCanvas.height !== height) {
      this.mappCanvas.width = width;
      this.mappCanvas.height = height;
      this.mappLayerCanvas.width = width;
      this.mappLayerCanvas.height = height;
      this.lastMappLayerDrawAt = 0;
    }

    this.mappWidth = width;
    this.mappHeight = height;
    this.mappCx = width * 0.5;
    this.mappCy = height * 0.5;
    this.mappRadius = Math.min(width, height) * 0.44;
    this.mappScale = this.mappRadius / MAP_RADIUS;
  }
}
