const STORAGE_KEY = "oasiz_moto_settings";
export const SETTINGS_CHANGED_EVENT = "oasiz_moto_settings_changed";
export const UI_SOUND_EVENT = "oasiz_moto_ui_sound";
export const CHUNK_KEYS = ["flat", "downhill", "uphill", "steps", "gapRamp", "doubleJump", "triangles"] as const;

export type ChunkKey = typeof CHUNK_KEYS[number];

export interface DebugChunkSettings {
    flat: boolean;
    downhill: boolean;
    uphill: boolean;
    steps: boolean;
    gapRamp: boolean;
    doubleJump: boolean;
    triangles: boolean;
}

const DEFAULT_DEBUG_CHUNKS: DebugChunkSettings = {
    flat: true,
    downhill: true,
    uphill: true,
    steps: true,
    gapRamp: true,
    doubleJump: true,
    triangles: true
};

export interface Settings {
    music: boolean;
    fx: boolean;
    haptics: boolean;
    debugChunks: DebugChunkSettings;
}

function loadSettings(): Settings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return {
                music: true,
                fx: true,
                haptics: true,
                ...parsed,
                debugChunks: { ...DEFAULT_DEBUG_CHUNKS, ...(parsed.debugChunks || {}) }
            };
        }
    } catch {}
    return {
        music: true,
        fx: true,
        haptics: true,
        debugChunks: { ...DEFAULT_DEBUG_CHUNKS }
    };
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
    const tabButtons = Array.from(document.querySelectorAll<HTMLElement>("[data-settings-tab]"));
    const tabPanels = Array.from(document.querySelectorAll<HTMLElement>("[data-settings-panel]"));

    function selectTab(tabId: string) {
        tabButtons.forEach((button) => {
            button.classList.toggle("active", button.dataset.settingsTab === tabId);
        });
        tabPanels.forEach((panel) => {
            panel.classList.toggle("active", panel.dataset.settingsPanel === tabId);
        });
    }

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
    tabButtons.forEach((button) => {
        button.addEventListener("click", () => {
            emitUiSound();
            selectTab(button.dataset.settingsTab || "audio");
        });
    });

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

    for (const key of CHUNK_KEYS) {
        const toggle = document.getElementById(`toggle-chunk-${key}`) as HTMLInputElement | null;
        if (!toggle) continue;
        toggle.checked = settings.debugChunks[key];
        toggle.addEventListener("change", () => {
            const enabledCount = CHUNK_KEYS.filter((chunkKey) => settings.debugChunks[chunkKey]).length;
            if (!toggle.checked && settings.debugChunks[key] && enabledCount === 1) {
                toggle.checked = true;
                return;
            }
            settings.debugChunks[key] = toggle.checked;
            saveSettings(settings);
            emitUiSound();
            emitSettingsChanged(settings);
            if (typeof (window as any).triggerHaptic === "function") {
                (window as any).triggerHaptic("light");
            }
        });
    }

    selectTab("audio");
    emitSettingsChanged(settings);
}
