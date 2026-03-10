// Catch Up – Main entry point
// Only Box2D mode is used; launches directly from the start screen.

// ─── Game state ──────────────────────────────────────────────────────────────
type GameState = 'start' | 'playing';
let gameState: GameState = 'start';
let maxHeight = 0;
type Box2DModule = typeof import('./box2d-mode');
let box2dModule: Box2DModule | null = null;
let activeGame: any = null;

// ─── UI elements ─────────────────────────────────────────────────────────────
const startScreen      = document.getElementById('start-screen')!;
const playBtn          = document.getElementById('play-btn')!;
const hud              = document.getElementById('hud')!;
const settingsBtn      = document.getElementById('settings-btn')!;
const quitBtn          = document.getElementById('quit-btn')!;
const phaserContainer  = document.getElementById('phaser-container')!;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.name + ': ' + error.message;
  return String(error);
}

function showStartUi(): void {
  startScreen.classList.remove('hidden');
  hud.classList.add('hidden');
  settingsBtn.classList.add('hidden');
  quitBtn.classList.add('hidden');
  phaserContainer.classList.add('hidden');
}

function showGameplayUi(): void {
  startScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  settingsBtn.classList.remove('hidden');
  quitBtn.classList.remove('hidden');
  phaserContainer.classList.remove('hidden');
}

function triggerLightHaptic(): void {
  if (typeof (window as any).triggerHaptic === 'function') {
    (window as any).triggerHaptic('light');
  }
}

function bindPress(el: HTMLElement, onPress: () => void | Promise<void>): void {
  let gate = false;
  const run = (): void => {
    if (gate) return;
    gate = true;
    window.setTimeout(() => { gate = false; }, 240);
    triggerLightHaptic();
    try {
      const maybePromise = onPress();
      if (maybePromise && typeof (maybePromise as Promise<void>).catch === 'function') {
        (maybePromise as Promise<void>).catch((error) => {
          console.log('[bindPress]', 'Press handler failed: ' + toErrorMessage(error));
        });
      }
    } catch (error) {
      console.log('[bindPress]', 'Press handler failed: ' + toErrorMessage(error));
    }
  };

  el.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    run();
  }, { passive: false });

  el.addEventListener('touchstart', (ev) => {
    ev.preventDefault();
    run();
  }, { passive: false });

  el.addEventListener('click', (ev) => {
    ev.preventDefault();
    run();
  });

  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      run();
    }
  });
}

async function loadBox2DModule(): Promise<Box2DModule> {
  if (box2dModule) return box2dModule;
  box2dModule = await import('./box2d-mode');
  return box2dModule;
}

async function startGame(): Promise<void> {
  if (gameState === 'playing') return;
  gameState = 'playing';
  maxHeight = 0;
  showGameplayUi();

  try {
    const module = await loadBox2DModule();

    if (activeGame) {
      module.destroyBox2DGame(activeGame);
      activeGame = null;
    }

    module.setAltitudeCallback((meters) => {
      maxHeight = meters;
    });
    activeGame = module.launchBox2DGame(phaserContainer);
  } catch (error) {
    console.log('[startGame]', 'Box2D launch failed: ' + toErrorMessage(error));
    gameState = 'start';
    showStartUi();
  }
}

function stopGame(): void {
  if (!activeGame) {
    phaserContainer.classList.add('hidden');
    return;
  }

  if (box2dModule) {
    box2dModule.destroyBox2DGame(activeGame as any);
  } else {
    activeGame.destroy(true);
  }

  activeGame = null;
  phaserContainer.classList.add('hidden');
}

bindPress(playBtn, () => startGame());

// ─── Quit / return to menu ───────────────────────────────────────────────────
const quitScreen    = document.getElementById('quit-screen')!;
const finalHeight   = document.getElementById('final-height')!;
const playAgainBtn  = document.getElementById('play-again-btn')!;

bindPress(quitBtn, () => {
  gameState = 'start';
  finalHeight.textContent = String(maxHeight);
  hud.classList.add('hidden');
  settingsBtn.classList.add('hidden');
  quitBtn.classList.add('hidden');
  stopGame();
  quitScreen.classList.remove('hidden');
});

bindPress(playAgainBtn, () => {
  quitScreen.classList.add('hidden');
  startScreen.classList.remove('hidden');
});

// ─── Settings modal ──────────────────────────────────────────────────────────
const settingsModal = document.getElementById('settings-modal')!;
const settingsClose = document.getElementById('settings-close')!;

bindPress(settingsBtn, () => settingsModal.classList.remove('hidden'));
bindPress(settingsClose, () => settingsModal.classList.add('hidden'));

// ─── Custom cursor ───────────────────────────────────────────────────────────
const cursor = document.getElementById('cursor')!;
document.addEventListener('mousemove', (e) => {
  cursor.style.left = e.clientX + 'px';
  cursor.style.top  = e.clientY + 'px';
});
