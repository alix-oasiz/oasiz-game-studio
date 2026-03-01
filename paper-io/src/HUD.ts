import { MAP_SIZE } from './constants.ts';
import { type PlayerState } from './Player.ts';

export class HUD {
  private hudEl: HTMLElement;
  private playerPct: HTMLElement;
  private playerDot: HTMLElement;
  private timerEl: HTMLElement;
  private lbEntries: HTMLElement;
  private startTime = 0;

  constructor() {
    this.hudEl = document.getElementById('hud')!;
    this.playerPct = document.getElementById('player-pct')!;
    this.playerDot = document.getElementById('player-dot')!;
    this.timerEl = document.getElementById('hud-timer')!;
    this.lbEntries = document.getElementById('lb-entries')!;
  }

  show(): void {
    this.hudEl.classList.add('visible');
    this.startTime = performance.now();
  }

  hide(): void {
    this.hudEl.classList.remove('visible');
  }

  update(players: PlayerState[]): void {
    const totalArea = MAP_SIZE * MAP_SIZE;

    // Player percentage
    const human = players.find(p => p.isHuman);
    if (human) {
      const pct = Math.round((human.territory.computeArea() / totalArea) * 100);
      this.playerPct.textContent = `${pct}%`;
      this.playerDot.style.background = human.colorStr;
    }

    // Timer
    const elapsed = (performance.now() - this.startTime) / 1000;
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    this.timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    // Leaderboard
    const entries = players
      .map(p => ({
        name: p.name,
        color: p.colorStr,
        pct: Math.round((p.territory.computeArea() / totalArea) * 100),
        alive: p.alive,
      }))
      .sort((a, b) => b.pct - a.pct);

    this.lbEntries.innerHTML = entries.map(e => `
      <div class="lb-entry${e.alive ? '' : ' dead'}">
        <span class="color-dot" style="background:${e.color}"></span>
        <span class="lb-name">${e.alive ? '' : '💀 '}${e.name}</span>
        <span class="lb-pct">${e.pct}%</span>
      </div>
    `).join('');
  }

  getElapsedTime(): string {
    const elapsed = (performance.now() - this.startTime) / 1000;
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  getHumanScore(players: PlayerState[]): { pct: number; rank: number } {
    const totalArea = MAP_SIZE * MAP_SIZE;
    const sorted = players
      .map(p => ({ id: p.id, area: p.territory.computeArea(), isHuman: p.isHuman }))
      .sort((a, b) => b.area - a.area);

    const humanIdx = sorted.findIndex(e => e.isHuman);
    const humanArea = sorted[humanIdx]?.area ?? 0;
    return {
      pct: Math.round((humanArea / totalArea) * 100),
      rank: humanIdx + 1,
    };
  }
}
