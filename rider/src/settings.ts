const STORAGE_KEY = "oasiz_moto_settings";
export const SETTINGS_CHANGED_EVENT = "oasiz_moto_settings_changed";
export const UI_SOUND_EVENT = "oasiz_moto_ui_sound";

export interface Settings {
    music: boolean;
    fx: boolean;
    haptics: boolean;
}

function loadSettings(): Settings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return { music: true, fx: true, haptics: true, ...JSON.parse(raw) };
    } catch {}
    return { music: true, fx: true, haptics: true };
}

function saveSettings(s: Settings): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function emitSettingsChanged(settings: Settings): void {
    window.dispatchEvent(new CustomEvent<Settings>(SETTINGS_CHANGED_EVENT, {
        detail: { ...settings }
    }));
}

function emitUiSound(): void {
    window.dispatchEvent(new CustomEvent(UI_SOUND_EVENT));
}

export function getSettings(): Settings {
    return loadSettings();
}

export function initSettings(): void {
    const settings = loadSettings();

    const btn = document.getElementById("settings-btn");
    const modal = document.getElementById("settings-modal");
    const overlay = document.getElementById("settings-overlay");
    const closeBtn = document.getElementById("settings-close");

    function pauseGame() {
        const game = (window as any).__phaserGame;
        if (game?.scene?.isActive("Game")) {
            game.scene.pause("Game");
        }
    }

    function resumeGame() {
        const game = (window as any).__phaserGame;
        if (game?.scene?.isPaused("Game")) {
            game.scene.resume("Game");
        }
    }

    function openModal() {
        emitUiSound();
        if (modal) modal.classList.add("visible");
        if (overlay) overlay.classList.add("visible");
        pauseGame();
        if (typeof (window as any).triggerHaptic === "function") {
            (window as any).triggerHaptic("light");
        }
    }

    function closeModal() {
        emitUiSound();
        if (modal) modal.classList.remove("visible");
        if (overlay) overlay.classList.remove("visible");
        resumeGame();
        if (typeof (window as any).triggerHaptic === "function") {
            (window as any).triggerHaptic("light");
        }
    }

    btn?.addEventListener("click", openModal);
    overlay?.addEventListener("click", closeModal);
    closeBtn?.addEventListener("click", closeModal);

    // Wire toggles
    const toggleIds: (keyof Settings)[] = ["music", "fx", "haptics"];
    for (const key of toggleIds) {
        const toggle = document.getElementById(`toggle-${key}`) as HTMLInputElement | null;
        if (!toggle) continue;
        toggle.checked = settings[key];
        toggle.addEventListener("change", () => {
            settings[key] = toggle.checked;
            saveSettings(settings);
            emitUiSound();
            emitSettingsChanged(settings);
            if (typeof (window as any).triggerHaptic === "function") {
                (window as any).triggerHaptic("light");
            }
        });
    }

    emitSettingsChanged(settings);
}
