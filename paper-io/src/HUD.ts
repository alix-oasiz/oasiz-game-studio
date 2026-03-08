import { MAP_SIZE } from "./constants.ts";
import { type PlayerState } from "./Player.ts";

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
  avatarEl: HTMLElement;
}

export class HUD {
  private hudEl: HTMLElement;
  private playerPct: HTMLElement;
  private playerDot: HTMLElement;
  private timerEl: HTMLElement;
  private lbEntries: HTMLElement;
  private startTime = 0;
  private cachedEntries = new Map<number, CachedEntry>();
  private displayedEntryIds: number[] = [];
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
    this.cachedEntries.clear();
    this.displayedEntryIds = [];
    this.lbEntries.replaceChildren();
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

    const entries = players
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.colorStr,
        pct: Math.round((p.territory.computeArea() / totalArea) * 100),
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
        c.el.className = `lb-entry${e.alive ? "" : " dead"}${i === 0 ? " top" : ""}`;
      } else {
        c.el.className = `lb-entry${e.alive ? "" : " dead"}${i === 0 ? " top" : ""}`;
      }
      if (c.name !== e.name) {
        c.name = e.name;
        c.nameEl.textContent = e.name;
        c.avatarEl.textContent = e.name.slice(0, 1).toUpperCase();
      }
      if (c.color !== e.color) {
        c.color = e.color;
        c.pctEl.style.color = e.color;
        c.avatarEl.style.background = `linear-gradient(135deg, ${e.color}, rgba(255,255,255,0.92))`;
      }
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

    const pctEl = document.createElement("span");
    pctEl.className = "lb-pct";
    pctEl.style.color = entry.color;

    const rowCard = document.createElement("div");
    rowCard.className = "lb-card";

    const avatarEl = document.createElement("span");
    avatarEl.className = "lb-avatar";
    avatarEl.style.background = `linear-gradient(135deg, ${entry.color}, rgba(255,255,255,0.92))`;

    const nameEl = document.createElement("span");
    nameEl.className = "lb-name";

    rowCard.appendChild(avatarEl);
    rowCard.appendChild(nameEl);
    rowCard.appendChild(rankEl);
    el.appendChild(pctEl);
    el.appendChild(rowCard);

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
      avatarEl,
    };
    this.cachedEntries.set(entry.id, created);
    return created;
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
