import { MAP_SIZE } from "./constants.ts";
import { type PlayerState } from "./Player.ts";

interface CachedEntry {
  name: string;
  color: string;
  pct: number;
  alive: boolean;
  el: HTMLElement;
  pctEl: HTMLElement;
  nameEl: HTMLElement;
}

export class HUD {
  private hudEl: HTMLElement;
  private playerPct: HTMLElement;
  private playerDot: HTMLElement;
  private timerEl: HTMLElement;
  private lbEntries: HTMLElement;
  private startTime = 0;
  private cachedEntries: CachedEntry[] = [];
  private lastPlayerPct = -1;

  constructor() {
    this.hudEl = document.getElementById("hud")!;
    this.playerPct = document.getElementById("player-pct")!;
    this.playerDot = document.getElementById("player-dot")!;
    this.timerEl = document.getElementById("hud-timer")!;
    this.lbEntries = document.getElementById("lb-entries")!;
  }

  show(): void {
    this.hudEl.classList.add("visible");
    this.startTime = performance.now();
    this.cachedEntries = [];
    this.lastPlayerPct = -1;
  }

  hide(): void {
    this.hudEl.classList.remove("visible");
  }

  update(players: PlayerState[]): void {
    const totalArea = MAP_SIZE * MAP_SIZE;

    // Player percentage — only update DOM if changed
    const human = players.find((p) => p.isHuman);
    if (human) {
      const pct = Math.round((human.territory.computeArea() / totalArea) * 100);
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

    // Leaderboard — diff update
    const entries = players
      .map((p) => ({
        name: p.name,
        color: p.colorStr,
        pct: Math.round((p.territory.computeArea() / totalArea) * 100),
        alive: p.alive,
      }))
      .sort((a, b) => b.pct - a.pct);

    // Rebuild DOM only if player count changed
    if (this.cachedEntries.length !== entries.length) {
      this.lbEntries.innerHTML = "";
      this.cachedEntries = [];
      for (const e of entries) {
        const el = document.createElement("div");
        el.className = `lb-entry${e.alive ? "" : " dead"}`;

        const dot = document.createElement("span");
        dot.className = "color-dot";
        dot.style.background = e.color;

        const nameEl = document.createElement("span");
        nameEl.className = "lb-name";
        nameEl.textContent = `${e.alive ? "" : "\u{1F480} "}${e.name}`;

        const pctEl = document.createElement("span");
        pctEl.className = "lb-pct";
        pctEl.textContent = `${e.pct}%`;

        el.appendChild(dot);
        el.appendChild(nameEl);
        el.appendChild(pctEl);
        this.lbEntries.appendChild(el);

        this.cachedEntries.push({
          name: e.name,
          color: e.color,
          pct: e.pct,
          alive: e.alive,
          el,
          pctEl,
          nameEl,
        });
      }
    } else {
      // Update only changed values
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const c = this.cachedEntries[i];
        if (c.pct !== e.pct) {
          c.pct = e.pct;
          c.pctEl.textContent = `${e.pct}%`;
        }
        if (c.alive !== e.alive) {
          c.alive = e.alive;
          c.el.className = `lb-entry${e.alive ? "" : " dead"}`;
          c.nameEl.textContent = `${e.alive ? "" : "\u{1F480} "}${e.name}`;
        }
        if (c.name !== e.name) {
          c.name = e.name;
          c.nameEl.textContent = `${e.alive ? "" : "\u{1F480} "}${e.name}`;
        }
      }
    }
  }

  getElapsedTime(): string {
    const elapsed = (performance.now() - this.startTime) / 1000;
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  getHumanScore(players: PlayerState[]): { pct: number; rank: number } {
    const totalArea = MAP_SIZE * MAP_SIZE;
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
      pct: Math.round((humanArea / totalArea) * 100),
      rank: humanIdx + 1,
    };
  }
}
