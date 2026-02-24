import Phaser from "phaser";

/**
 * SettingsModal - DOM-based settings panel for iOS webview compatibility.
 * Uses HTML elements instead of Phaser GameObjects to handle CSS rotation properly.
 * Uses AbortController for clean event listener lifecycle management.
 */
export default class SettingsModal {
    private scene: Phaser.Scene;
    private isOpen: boolean = false;
    private abortController: AbortController | null = null;

    // DOM Element references
    private settingsBtn: HTMLElement | null = null;
    private settingsPanel: HTMLElement | null = null;
    private settingsBackdrop: HTMLElement | null = null;
    private settingsBackBtn: HTMLElement | null = null;
    private toggleMusic: HTMLElement | null = null;
    private toggleFx: HTMLElement | null = null;
    private toggleHaptics: HTMLElement | null = null;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.initSettings();
    }

    private initSettings() {
        if (localStorage.getItem("golf_settings_music") === null) localStorage.setItem("golf_settings_music", "true");
        if (localStorage.getItem("golf_settings_fx") === null) localStorage.setItem("golf_settings_fx", "true");
        if (localStorage.getItem("golf_settings_haptics") === null) localStorage.setItem("golf_settings_haptics", "true");
    }

    public create() {
        // CRITICAL: Clean up old event listeners from previous scene lifecycle
        // This prevents duplicate handlers from accumulating on scene.restart()
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        // Get DOM elements
        this.settingsBtn = document.getElementById("settingsBtn");
        this.settingsPanel = document.getElementById("settingsPanel");
        this.settingsBackdrop = document.getElementById("settingsBackdrop");
        this.settingsBackBtn = document.getElementById("settingsBackBtn");
        this.toggleMusic = document.getElementById("toggleMusic");
        this.toggleFx = document.getElementById("toggleFx");
        this.toggleHaptics = document.getElementById("toggleHaptics");

        // CRITICAL: Reset panel state on create to prevent stale UI from previous lifecycle
        this.isOpen = false;
        this.settingsPanel?.classList.add("hidden");

        // Initialize toggle states from localStorage
        this.updateToggleVisual(this.toggleMusic, localStorage.getItem("golf_settings_music") === "true");
        this.updateToggleVisual(this.toggleFx, localStorage.getItem("golf_settings_fx") === "true");
        this.updateToggleVisual(this.toggleHaptics, localStorage.getItem("golf_settings_haptics") === "true");

        // Settings button click - open modal
        this.addButtonHandler(this.settingsBtn, signal, () => {
            console.log("[SettingsModal] Settings button clicked");
            this.toggle();
        });

        // Backdrop click - close modal
        this.addButtonHandler(this.settingsBackdrop, signal, () => {
            console.log("[SettingsModal] Backdrop clicked");
            this.close();
        });

        // Back button click - close modal
        this.addButtonHandler(this.settingsBackBtn, signal, () => {
            console.log("[SettingsModal] Back button clicked");
            this.close();
        });

        // Music toggle
        this.addButtonHandler(this.toggleMusic, signal, () => {
            const current = localStorage.getItem("golf_settings_music") === "true";
            const next = !current;
            localStorage.setItem("golf_settings_music", next.toString());
            this.updateToggleVisual(this.toggleMusic, next);
            console.log("[SettingsModal] Music toggled:", next);

            // Instant music feedback
            const bgMusic = this.scene.sound.get("GolfBgMusic") as Phaser.Sound.BaseSound;
            if (bgMusic) {
                if (next) {
                    if (!bgMusic.isPlaying) bgMusic.play();
                } else {
                    bgMusic.stop();
                }
            }
        });

        // FX toggle
        this.addButtonHandler(this.toggleFx, signal, () => {
            const current = localStorage.getItem("golf_settings_fx") === "true";
            const next = !current;
            localStorage.setItem("golf_settings_fx", next.toString());
            this.updateToggleVisual(this.toggleFx, next);
            console.log("[SettingsModal] FX toggled:", next);
        });

        // Haptics toggle
        this.addButtonHandler(this.toggleHaptics, signal, () => {
            const current = localStorage.getItem("golf_settings_haptics") === "true";
            const next = !current;
            localStorage.setItem("golf_settings_haptics", next.toString());
            this.updateToggleVisual(this.toggleHaptics, next);
            console.log("[SettingsModal] Haptics toggled:", next);
        });

        // Hide settings button by default (shown during gameplay)
        this.setVisible(false);
    }

    /**
     * Add click/touch handler to a DOM element with haptic feedback.
     * Uses AbortController signal for automatic cleanup on scene restart.
     */
    private addButtonHandler(element: HTMLElement | null, signal: AbortSignal, callback: () => void) {
        if (!element) return;

        let lastEventTime = 0;
        const DEBOUNCE_MS = 300;

        const handler = (e: Event) => {
            // Debounce to prevent double-firing from touch + synthetic click
            const now = Date.now();
            if (now - lastEventTime < DEBOUNCE_MS) return;
            lastEventTime = now;

            e.preventDefault();
            e.stopPropagation();

            // Play SFX
            this.playSFX("ButtonClick");

            // Trigger haptic (respect settings)
            if (localStorage.getItem('golf_settings_haptics') !== 'false') {
                if (typeof (window as any).triggerHaptic === "function") {
                    (window as any).triggerHaptic("light");
                }
            }

            callback();
        };

        // Use signal for automatic cleanup - all listeners are removed when AbortController.abort() is called
        element.addEventListener("pointerup", handler, { signal });
        element.addEventListener("click", handler, { signal });
    }

    /**
     * Update toggle visual state (ON/OFF text and background color)
     */
    private updateToggleVisual(element: HTMLElement | null, isOn: boolean) {
        if (!element) return;

        const textSpan = element.querySelector(".toggle-text");
        if (textSpan) {
            textSpan.textContent = isOn ? "ON" : "OFF";
        }

        if (isOn) {
            element.classList.add("active");
        } else {
            element.classList.remove("active");
        }
    }

    private playSFX(key: string) {
        if (localStorage.getItem("golf_settings_fx") === "true") {
            this.scene.sound.play(key);
        }
    }

    /**
     * Show/hide the settings button (gear icon)
     */
    public setVisible(visible: boolean) {
        if (this.settingsBtn) {
            if (visible) {
                this.settingsBtn.classList.remove("hidden");
            } else {
                this.settingsBtn.classList.add("hidden");
            }
        }
    }

    public getIsOpen() {
        return this.isOpen;
    }

    /**
     * Explicitly close the settings panel (always closes, never toggles)
     */
    public close() {
        if (!this.isOpen) return;
        this.isOpen = false;

        this.settingsPanel?.classList.add("hidden");
        (this.scene as any).physicsPaused = false;

        if (this.scene.scene.isActive("Menu")) {
            this.scene.scene.bringToTop("Menu");
        }
    }

    /**
     * Toggle settings modal open/close
     */
    public toggle() {
        this.isOpen = !this.isOpen;

        if (this.settingsPanel) {
            if (this.isOpen) {
                this.settingsPanel.classList.remove("hidden");
            } else {
                this.settingsPanel.classList.add("hidden");
            }
        }

        if (this.isOpen) {
            (this.scene as any).physicsPaused = true;
            this.scene.scene.bringToTop();
        } else {
            (this.scene as any).physicsPaused = false;
            if (this.scene.scene.isActive("Menu")) {
                this.scene.scene.bringToTop("Menu");
            }
        }
    }

    /**
     * Clean up all event listeners and reset UI state.
     * Called on scene shutdown/restart to prevent stale handlers.
     */
    public destroy() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.isOpen = false;
        this.settingsPanel?.classList.add("hidden");
        this.settingsBtn?.classList.add("hidden");
    }
}
