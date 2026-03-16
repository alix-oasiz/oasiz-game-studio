import { ARENA_AREA, MAP_RADIUS } from "./constants.ts";
import { type PlayerState } from "./Player.ts";
import { type TerritoryMultiPolygon } from "./polygon-ops.ts";

interface CachedEntry {
  id: number;
  name: string;
  color: string;
  pct: number;
  alive: boolean;
  el: HTMLElement;
  pctEl: HTMLElement;
  nameEl: HTMLElement;
  rankEl: HTMLElement;
}

export class HUD {
  private static readonly maxRespawns = 2;
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
  private scoreFxLayer: HTMLElement;
  private startTime = 0;
  private cachedEntries = new Map<number, CachedEntry>();
  private displayedEntryIds: number[] = [];
  private lastPlayerPct = "";
  private lastDisplayedScore = -1;

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
    this.scoreFxLayer = document.getElementById("score-fx-layer")!;
  }

  show(): void {
    this.hudEl.classList.add("visible");
    this.mappPanel.classList.add("visible");
    this.startTime = performance.now();
    this.cachedEntries.clear();
    this.displayedEntryIds = [];
    this.lbEntries.replaceChildren();
    this.lastPlayerPct = "";
    this.lastDisplayedScore = -1;
    this.scoreFxLayer.replaceChildren();
  }

  hide(): void {
    this.hudEl.classList.remove("visible");
    this.mappPanel.classList.remove("visible");
    this.scoreFxLayer.replaceChildren();
  }

  setPlayerName(name: string): void {
    this.playerNameEl.textContent = name;
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
    this.timerEl.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    this.drawMapp(players);

    const entries = players
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.colorStr,
        pct: Number(
          this.formatPct((p.territory.computeArea() / totalArea) * 100),
        ),
        alive: p.alive,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3);

    const prevRects = new Map<number, DOMRect>();
    for (const id of this.displayedEntryIds) {
      const cached = this.cachedEntries.get(id);
      if (!cached?.el.isConnected) continue;
      prevRects.set(id, cached.el.getBoundingClientRect());
    }

    const fragment = document.createDocumentFragment();
    const nextIds: number[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const c = this.getOrCreateLeaderboardEntry(e);
      if (c.pct !== e.pct) {
        c.pct = e.pct;
        c.pctEl.textContent = `${e.pct}%`;
      }
      if (c.alive !== e.alive) {
        c.alive = e.alive;
        c.el.className = `lb-entry rank-${i + 1}${e.alive ? "" : " dead"}${i === 0 ? " top" : ""}`;
      } else {
        c.el.className = `lb-entry rank-${i + 1}${e.alive ? "" : " dead"}${i === 0 ? " top" : ""}`;
      }
      if (c.name !== e.name) {
        c.name = e.name;
        c.nameEl.textContent = e.name;
      }
      c.color = e.color;
      c.rankEl.textContent = `${i + 1}`;
      nextIds.push(e.id);
      fragment.appendChild(c.el);
    }
    this.lbEntries.replaceChildren(fragment);
    this.displayedEntryIds = nextIds;

    for (const id of Array.from(this.cachedEntries.keys())) {
      if (!nextIds.includes(id)) this.cachedEntries.delete(id);
    }

    requestAnimationFrame(() => {
      for (const id of nextIds) {
        const cached = this.cachedEntries.get(id);
        if (!cached) continue;
        const prev = prevRects.get(id);
        const next = cached.el.getBoundingClientRect();
        if (!prev) {
          cached.el.animate(
            [
              { opacity: 0, transform: "translateY(8px) scale(0.96)" },
              { opacity: 1, transform: "translateY(0) scale(1)" },
            ],
            {
              duration: 220,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            },
          );
          continue;
        }

        const dy = prev.top - next.top;
        if (Math.abs(dy) > 1) {
          cached.el.animate(
            [
              { transform: `translateY(${dy}px)` },
              { transform: "translateY(0)" },
            ],
            {
              duration: 260,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            },
          );
        }
      }
    });
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
    const el = document.createElement("div");
    el.className = "score-compliment";
    el.textContent = message;
    el.style.color = color;
    this.scoreFxLayer.appendChild(el);
    window.setTimeout(() => {
      el.remove();
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

  private getFloatingScoreColor(points: number): string {
    if (points >= 3000) return "#FF4D6D";
    if (points >= 2000) return "#A855F7";
    if (points >= 1000) return "#F6C445";
    if (points >= 500) return "#00A1E4";
    return "#FFFFFF";
  }

  private getOrCreateLeaderboardEntry(entry: {
    id: number;
    name: string;
    color: string;
    pct: number;
    alive: boolean;
  }): CachedEntry {
    const existing = this.cachedEntries.get(entry.id);
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
      id: entry.id,
      name: "",
      color: "",
      pct: -1,
      alive: true,
      el,
      pctEl,
      nameEl,
      rankEl,
    };
    this.cachedEntries.set(entry.id, created);
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
    const rect = this.mappCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.mappCanvas.width !== width || this.mappCanvas.height !== height) {
      this.mappCanvas.width = width;
      this.mappCanvas.height = height;
    }

    const ctx = this.mappCtx;
    ctx.clearRect(0, 0, width, height);

    const cx = width * 0.5;
    const cy = height * 0.5;
    const radius = Math.min(width, height) * 0.44;
    const scale = radius / MAP_RADIUS;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = "#dff4ff";
    ctx.fillRect(0, 0, width, height);

    for (const player of players) {
      if (!player.alive) continue;
      const polygons = player.territory.getPolygons();
      if (polygons.length === 0) continue;
      this.fillTerritoryOnMapp(
        polygons,
        player.colorStr,
        player.isHuman ? 0.42 : 0.26,
        cx,
        cy,
        scale,
      );
    }

    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(2, 2.5 * dpr);
    ctx.strokeStyle = "rgba(0, 161, 228, 0.95)";
    ctx.stroke();

    for (const player of players) {
      if (!player.alive) continue;
      const px = cx + player.position.x * scale;
      const py = cy + player.position.z * scale;
      const dotRadius = player.isHuman ? 4.8 * dpr : 3.8 * dpr;
      ctx.beginPath();
      ctx.arc(px, py, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = player.colorStr;
      ctx.fill();
      ctx.lineWidth = player.isHuman ? 2.4 * dpr : 1.4 * dpr;
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
  ): void {
    const ctx = this.mappCtx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (const polygon of polygons) {
      ctx.beginPath();
      this.traceLoopOnMapp(polygon.outer, cx, cy, scale);
      for (const hole of polygon.holes) {
        this.traceLoopOnMapp(hole, cx, cy, scale);
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
  ): void {
    if (loop.length === 0) return;
    const ctx = this.mappCtx;
    ctx.moveTo(cx + loop[0].x * scale, cy + loop[0].z * scale);
    for (let i = 1; i < loop.length; i++) {
      ctx.lineTo(cx + loop[i].x * scale, cy + loop[i].z * scale);
    }
    ctx.closePath();
  }
}
