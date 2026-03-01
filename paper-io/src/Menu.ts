import { type Difficulty } from './constants.ts';

export interface MenuConfig {
  botCount: number;
  difficulty: Difficulty;
}

export class Menu {
  private menuScreen: HTMLElement;
  private gameOverScreen: HTMLElement;
  private pauseOverlay: HTMLElement;
  private onPlay: ((config: MenuConfig) => void) | null = null;
  private onPlayAgain: (() => void) | null = null;
  private onMainMenu: (() => void) | null = null;
  private config: MenuConfig = { botCount: 5, difficulty: 'medium' };

  constructor() {
    this.menuScreen = document.getElementById('menu-screen')!;
    this.gameOverScreen = document.getElementById('game-over')!;
    this.pauseOverlay = document.getElementById('pause-overlay')!;

    this.setupMenu();
  }

  private setupMenu(): void {
    // Bot count buttons
    document.querySelectorAll('#bot-count-group button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#bot-count-group button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.config.botCount = parseInt((btn as HTMLElement).dataset.val!);
      });
    });

    // Difficulty buttons
    document.querySelectorAll('#difficulty-group button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#difficulty-group button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.config.difficulty = (btn as HTMLElement).dataset.val as Difficulty;
      });
    });

    // Play button
    document.getElementById('play-btn')!.addEventListener('click', () => {
      this.onPlay?.(this.config);
    });

    // How to play toggle
    document.getElementById('how-to-toggle')!.addEventListener('click', () => {
      document.getElementById('how-to-content')!.classList.toggle('show');
    });

    // Game over buttons
    document.getElementById('go-play-again')!.addEventListener('click', () => {
      this.hideGameOver();
      this.onPlayAgain?.();
    });
    document.getElementById('go-main-menu')!.addEventListener('click', () => {
      this.hideGameOver();
      this.onMainMenu?.();
    });
  }

  setCallbacks(
    onPlay: (config: MenuConfig) => void,
    onPlayAgain: () => void,
    onMainMenu: () => void,
  ): void {
    this.onPlay = onPlay;
    this.onPlayAgain = onPlayAgain;
    this.onMainMenu = onMainMenu;
  }

  showMenu(): void {
    this.menuScreen.style.display = 'flex';
  }

  hideMenu(): void {
    this.menuScreen.style.display = 'none';
  }

  showGameOver(score: string, rank: string, time: string): void {
    document.getElementById('go-score')!.textContent = score;
    document.getElementById('go-rank')!.textContent = rank;
    document.getElementById('go-time')!.textContent = time;
    this.gameOverScreen.classList.add('visible');
  }

  hideGameOver(): void {
    this.gameOverScreen.classList.remove('visible');
  }

  showPause(): void {
    this.pauseOverlay.classList.add('visible');
  }

  hidePause(): void {
    this.pauseOverlay.classList.remove('visible');
  }

  get currentConfig(): MenuConfig {
    return this.config;
  }
}
