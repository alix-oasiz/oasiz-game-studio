import type { Phase, Settings } from "../types";

interface UIHandlers {
  onStartPressed: () => void;
  onRestartPressed: () => void;
  onSettingsOpened: () => void;
  onSettingsClosed: () => void;
  onMusicToggle: (enabled: boolean) => void;
  onFxToggle: (enabled: boolean) => void;
  onHapticsToggle: (enabled: boolean) => void;
  onUiTap: () => void;
}

export class UISystem {
  private startScreen: HTMLDivElement;
  private startButton: HTMLButtonElement;
  private hud: HTMLDivElement;
  private scorePill: HTMLDivElement;
  private statusLine: HTMLDivElement;
  private gameOverScreen: HTMLDivElement;
  private finalScoreValue: HTMLDivElement;
  private restartButton: HTMLButtonElement;

  private settingsButton: HTMLButtonElement;
  private settingsOverlay: HTMLDivElement;
  private settingsClose: HTMLButtonElement;
  private toggleMusic: HTMLButtonElement;
  private toggleFx: HTMLButtonElement;
  private toggleHaptics: HTMLButtonElement;

  private settings: Settings;
  private settingsOpen = false;

  public constructor(initialSettings: Settings) {
    this.startScreen = this.getElement<HTMLDivElement>("start-screen");
    this.startButton = this.getElement<HTMLButtonElement>("start-btn");
    this.hud = this.getElement<HTMLDivElement>("hud");
    this.scorePill = this.getElement<HTMLDivElement>("score-pill");
    this.statusLine = this.getElement<HTMLDivElement>("status-line");
    this.gameOverScreen = this.getElement<HTMLDivElement>("game-over");
    this.finalScoreValue = this.getElement<HTMLDivElement>("final-score");
    this.restartButton = this.getElement<HTMLButtonElement>("restart-btn");

    this.settingsButton = this.getElement<HTMLButtonElement>("settings-btn");
    this.settingsOverlay = this.getElement<HTMLDivElement>("settings-overlay");
    this.settingsClose = this.getElement<HTMLButtonElement>("settings-close");
    this.toggleMusic = this.getElement<HTMLButtonElement>("toggle-music");
    this.toggleFx = this.getElement<HTMLButtonElement>("toggle-fx");
    this.toggleHaptics = this.getElement<HTMLButtonElement>("toggle-haptics");

    this.settings = { ...initialSettings };
    this.syncSettingsButtons();
  }

  public bindHandlers(handlers: UIHandlers): void {
    this.startButton.addEventListener("click", () => {
      handlers.onUiTap();
      handlers.onStartPressed();
    });

    this.restartButton.addEventListener("click", () => {
      handlers.onUiTap();
      handlers.onRestartPressed();
    });

    this.settingsButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openSettings();
      handlers.onUiTap();
      handlers.onSettingsOpened();
    });

    this.settingsClose.addEventListener("click", () => {
      this.closeSettings();
      handlers.onUiTap();
      handlers.onSettingsClosed();
    });

    this.settingsOverlay.addEventListener("click", (e) => {
      if (e.target === this.settingsOverlay) {
        this.closeSettings();
        handlers.onSettingsClosed();
      }
    });

    this.toggleMusic.addEventListener("click", () => {
      const next = !this.settings.music;
      this.settings.music = next;
      this.syncSettingsButtons();
      handlers.onMusicToggle(next);
      handlers.onUiTap();
    });

    this.toggleFx.addEventListener("click", () => {
      const next = !this.settings.fx;
      this.settings.fx = next;
      this.syncSettingsButtons();
      handlers.onFxToggle(next);
      handlers.onUiTap();
    });

    this.toggleHaptics.addEventListener("click", () => {
      const next = !this.settings.haptics;
      this.settings.haptics = next;
      this.syncSettingsButtons();
      handlers.onHapticsToggle(next);
      handlers.onUiTap();
    });
  }

  public setSettings(settings: Settings): void {
    this.settings = { ...settings };
    this.syncSettingsButtons();
  }

  public setPhase(phase: Phase): void {
    const isStart = phase === "start";
    const isPlaying = phase === "playing";
    const isOver = phase === "over";

    this.startScreen.classList.toggle("hidden", !isStart);
    this.hud.classList.toggle("hidden", !isPlaying);
    this.gameOverScreen.classList.toggle("hidden", !isOver);
    this.settingsButton.classList.toggle("hidden", !isPlaying);

    if (!isPlaying) {
      this.closeSettings();
    }
  }

  public setScore(value: string): void {
    this.scorePill.textContent = value;
  }

  public setStatus(value: string): void {
    this.statusLine.textContent = value;
  }

  public setFinalScore(value: string): void {
    this.finalScoreValue.textContent = value;
  }

  public isSettingsOpen(): boolean {
    return this.settingsOpen;
  }

  public closeSettings(): void {
    this.settingsOpen = false;
    this.settingsOverlay.classList.add("hidden");
  }

  private openSettings(): void {
    this.settingsOpen = true;
    this.settingsOverlay.classList.remove("hidden");
  }

  private syncSettingsButtons(): void {
    this.toggleMusic.classList.toggle("active", this.settings.music);
    this.toggleFx.classList.toggle("active", this.settings.fx);
    this.toggleHaptics.classList.toggle("active", this.settings.haptics);
    this.toggleMusic.setAttribute("aria-pressed", String(this.settings.music));
    this.toggleFx.setAttribute("aria-pressed", String(this.settings.fx));
    this.toggleHaptics.setAttribute("aria-pressed", String(this.settings.haptics));
  }

  private getElement<T extends HTMLElement>(id: string): T {
    const el = document.getElementById(id);
    if (!el) {
      throw new Error("Missing required element #" + id);
    }
    return el as T;
  }
}
