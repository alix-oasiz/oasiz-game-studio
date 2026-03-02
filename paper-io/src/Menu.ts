import { PLAYER_COLOR_STRINGS, type Difficulty } from './constants.ts';

export interface MenuConfig {
  botCount: number;
  difficulty: Difficulty;
  playerColorIndex: number;
}

export class Menu {
  private menuScreen: HTMLElement;
  private gameOverScreen: HTMLElement;
  private pauseOverlay: HTMLElement;
  private shopModal: HTMLElement;
  private onPlay: ((config: MenuConfig) => void) | null = null;
  private onPlayAgain: (() => void) | null = null;
  private onMainMenu: (() => void) | null = null;
  private config: MenuConfig = { botCount: 5, difficulty: 'medium', playerColorIndex: 0 };

  constructor() {
    this.menuScreen = document.getElementById('menu-screen')!;
    this.gameOverScreen = document.getElementById('game-over')!;
    this.pauseOverlay = document.getElementById('pause-overlay')!;
    this.shopModal = document.getElementById('shop-modal')!;

    this.setupMenu();
  }

  private setupMenu(): void {
    this.setupShop();

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

  private setupShop(): void {
    const openBtn = document.getElementById('shop-open-btn');
    const closeBtn = document.getElementById('shop-close-btn');
    const preview = document.getElementById('shop-preview') as HTMLElement | null;
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('#shop-colors .shop-color-btn'));
    if (buttons.length === 0) return;

    openBtn?.addEventListener('click', () => {
      this.shopModal.classList.add('visible');
    });

    closeBtn?.addEventListener('click', () => {
      this.shopModal.classList.remove('visible');
    });

    this.shopModal.addEventListener('click', (e) => {
      if (e.target === this.shopModal) {
        this.shopModal.classList.remove('visible');
      }
    });

    const setSelectedColor = (index: number): void => {
      this.config.playerColorIndex = index;
      for (const btn of buttons) {
        const btnIndex = Number(btn.dataset.colorIndex ?? '-1');
        btn.classList.toggle('selected', btnIndex === index);
      }
      if (preview) {
        preview.style.background = PLAYER_COLOR_STRINGS[index] ?? PLAYER_COLOR_STRINGS[0];
      }
    };

    for (const btn of buttons) {
      btn.addEventListener('click', () => {
        const index = Number(btn.dataset.colorIndex ?? '0');
        setSelectedColor(index);
      });
    }

    setSelectedColor(this.config.playerColorIndex);
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
