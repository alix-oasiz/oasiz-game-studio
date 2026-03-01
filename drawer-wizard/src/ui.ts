export function initUI() {
    const settings = {
        music: localStorage.getItem('setting_music') !== 'false',
        fx: localStorage.getItem('setting_fx') !== 'false',
        haptics: localStorage.getItem('setting_haptics') !== 'false'
    };

    const toggleMusic = document.getElementById('toggle-music') as HTMLInputElement;
    const toggleFx = document.getElementById('toggle-fx') as HTMLInputElement;
    const toggleHaptics = document.getElementById('toggle-haptics') as HTMLInputElement;

    if (toggleMusic) toggleMusic.checked = settings.music;
    if (toggleFx) toggleFx.checked = settings.fx;
    if (toggleHaptics) toggleHaptics.checked = settings.haptics;

    const saveSettings = () => {
        if (toggleMusic) localStorage.setItem('setting_music', toggleMusic.checked.toString());
        if (toggleFx) localStorage.setItem('setting_fx', toggleFx.checked.toString());
        if (toggleHaptics) localStorage.setItem('setting_haptics', toggleHaptics.checked.toString());

        if (toggleHaptics && toggleHaptics.checked) {
            triggerHaptic('light');
        }
        window.dispatchEvent(new Event('btn-click'));

        window.dispatchEvent(new Event('settings-changed'));
    };

    if (toggleMusic) toggleMusic.onchange = saveSettings;
    if (toggleFx) toggleFx.onchange = saveSettings;
    if (toggleHaptics) toggleHaptics.onchange = saveSettings;

    const settingsBtn = document.getElementById('settings-btn');
    const closeSettings = document.getElementById('close-settings');
    const settingsModal = document.getElementById('settings-modal');

    // Using onclick for instant fast response
    if (settingsBtn) {
        settingsBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (settingsModal) settingsModal.classList.remove('hidden');
            triggerHaptic('light');
            window.dispatchEvent(new Event('btn-click'));
            window.dispatchEvent(new Event('scene-pause'));
        };
    }

    if (closeSettings) {
        closeSettings.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (settingsModal) settingsModal.classList.add('hidden');
            triggerHaptic('light');
            window.dispatchEvent(new Event('btn-click'));
            window.dispatchEvent(new Event('scene-resume'));
        };
    }

    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) {
        restartBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const goModal = document.getElementById('game-over-modal');
            if (goModal) goModal.classList.add('hidden');
            triggerHaptic('light');
            window.dispatchEvent(new Event('btn-click'));

            window.dispatchEvent(new Event('restart-game'));
        };
    }
}

export function showGameOver(score: number) {
    const modal = document.getElementById('game-over-modal');
    const scoreEl = document.getElementById('final-score');
    if (scoreEl) scoreEl.innerText = score.toString();
    if (modal) modal.classList.remove('hidden');

    if (typeof (window as any).submitScore === "function") {
        (window as any).submitScore(score);
    }
}

export function triggerHaptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'error') {
    const haptics = localStorage.getItem('setting_haptics') !== 'false';
    if (!haptics) return;

    if (typeof (window as any).triggerHaptic === "function") {
        (window as any).triggerHaptic(type);
    }
}

export function getSettings() {
    return {
        music: localStorage.getItem('setting_music') !== 'false',
        fx: localStorage.getItem('setting_fx') !== 'false',
        haptics: localStorage.getItem('setting_haptics') !== 'false'
    };
}
