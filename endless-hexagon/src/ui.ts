import { oasiz } from "@oasiz/sdk";

export function initUI() {
    const platform = {
        musicEnabled: localStorage.getItem('musicEnabled') !== 'false',
        fxEnabled: localStorage.getItem('fxEnabled') !== 'false',
        hapticsEnabled: localStorage.getItem('hapticsEnabled') !== 'false',
    };
    (window as any).platform = platform; // Still needed by Scene.ts to check settings, or we should export it.

    const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;
    const settingsModal = document.getElementById('settings-modal') as HTMLElement;
    const closeSettingsBtn = document.getElementById('close-settings') as HTMLButtonElement;
    const gameOverModal = document.getElementById('game-over-modal') as HTMLElement;
    const finalScoreEl = document.getElementById('final-score') as HTMLElement;
    const restartBtn = document.getElementById('restart-btn') as HTMLButtonElement;
    const goSettingsBtn = document.getElementById('go-settings-btn') as HTMLButtonElement;
    const mainMenu = document.getElementById('main-menu') as HTMLElement;
    const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
    const musicToggle = document.getElementById('music-toggle') as HTMLElement;
    const fxToggle = document.getElementById('fx-toggle') as HTMLElement;
    const hapticsToggle = document.getElementById('haptics-toggle') as HTMLElement;

    function setToggleState(el: HTMLElement, active: boolean) {
        if (active) {
            el.classList.add('active');
            el.querySelector('.toggle-label')!.textContent = 'ON';
        } else {
            el.classList.remove('active');
            el.querySelector('.toggle-label')!.textContent = 'OFF';
        }
    }

    setToggleState(musicToggle, platform.musicEnabled);
    setToggleState(fxToggle, platform.fxEnabled);
    setToggleState(hapticsToggle, platform.hapticsEnabled);

    function triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'error') {
        if (platform.hapticsEnabled) {
            oasiz.triggerHaptic(type);
        }
    }

    musicToggle.onclick = function() {
        const enabled = !platform.musicEnabled;
        platform.musicEnabled = enabled;
        localStorage.setItem('musicEnabled', enabled.toString());
        setToggleState(musicToggle, enabled);
        if ((window as any).toggleMusic) (window as any).toggleMusic(enabled);
        triggerHaptic('light');
    };

    fxToggle.onclick = function() {
        const enabled = !platform.fxEnabled;
        platform.fxEnabled = enabled;
        localStorage.setItem('fxEnabled', enabled.toString());
        setToggleState(fxToggle, enabled);
        triggerHaptic('light');
    };

    hapticsToggle.onclick = function() {
        const enabled = !platform.hapticsEnabled;
        platform.hapticsEnabled = enabled;
        localStorage.setItem('hapticsEnabled', enabled.toString());
        setToggleState(hapticsToggle, enabled);
        triggerHaptic('light');
    };

    function openSettings() {
        settingsModal.classList.remove('hidden');
        triggerHaptic('light');
        if ((window as any).pauseGame) (window as any).pauseGame();
    }

    function closeSettingsFn() {
        settingsModal.classList.add('hidden');
        triggerHaptic('light');
        if ((window as any).resumeGame) (window as any).resumeGame();
    }

    settingsBtn.onclick = openSettings;
    closeSettingsBtn.onclick = closeSettingsFn;
    goSettingsBtn.onclick = openSettings;

    restartBtn.onclick = function() {
        triggerHaptic('medium');
        gameOverModal.classList.add('hidden');
        if ((window as any).restartGame) (window as any).restartGame();
    };

    playBtn.disabled = true;
    playBtn.classList.add('loading');
    playBtn.textContent = "LOADING...";

    (window as any).onGameReady = function() {
        playBtn.disabled = false;
        playBtn.classList.remove('loading');
        playBtn.textContent = "PLAY";
    };

    playBtn.onclick = function() {
        if (playBtn.disabled) return;
        triggerHaptic('medium');
        if ((window as any).startGame) (window as any).startGame();
        mainMenu.classList.add('menu-hidden');
    };

    (window as any).showMainMenu = function() {
        mainMenu.classList.remove('menu-hidden');
        gameOverModal.classList.add('hidden');
    };

    (window as any).showGameOver = function(score: number) {
        finalScoreEl.textContent = score.toString();
        gameOverModal.classList.remove('hidden');
    };

    const clickSound = new Audio('./audio/ButtonClick.mp3');
    function playClick() {
        if (platform.fxEnabled) {
            clickSound.currentTime = 0;
            clickSound.play().catch(function() {});
        }
    }

    document.querySelectorAll('button').forEach(function(btn) { btn.addEventListener('click', playClick); });
    document.querySelectorAll('.pixel-toggle').forEach(function(t) { t.addEventListener('click', playClick); });
}
