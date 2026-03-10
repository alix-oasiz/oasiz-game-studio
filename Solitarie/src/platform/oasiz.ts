import Phaser from "phaser";
import { leaveGame, onBackButton, onPause, onResume, oasiz, submitScore, triggerHaptic } from "@oasiz/sdk";

type HapticType = "light" | "medium" | "heavy" | "success" | "error";
type BackButtonHandler = () => void;

let lifecycleBound = false;
let gameplayActive = false;
let backButtonBound = false;
let backButtonHandler: BackButtonHandler | null = null;
let backButtonBindRaf = 0;
let backButtonOff: (() => void) | null = null;

export function initOasiz(game: Phaser.Game): void {
    if (lifecycleBound) return;
    lifecycleBound = true;

    const stopLoop = () => {
        game.loop.blur();
    };

    const resetInput = () => {
        const inputManager = game.input as (Phaser.Input.InputManager & { resetPointers?: () => void }) | undefined;
        if (inputManager && typeof inputManager.resetPointers === "function") {
            inputManager.resetPointers();
        }

        const sceneManager = game.scene as Phaser.Scenes.SceneManager | undefined;
        const activeScenes = sceneManager ? sceneManager.getScenes(true) : [];

        activeScenes.forEach((scene) => {
            if (scene.input) {
                scene.input.enabled = true;
                if (typeof scene.input.resetPointers === "function") {
                    scene.input.resetPointers();
                }
            }

            if (scene.input?.keyboard) {
                scene.input.keyboard.enabled = true;
                if (typeof scene.input.keyboard.resetKeys === "function") {
                    scene.input.keyboard.resetKeys();
                }
            }
        });
    };

    const startLoop = () => {
        resetInput();
        game.loop.focus();
    };

    onPause(() => {
        stopLoop();
    });

    onResume(() => {
        startLoop();
    });

    const scheduleBackButtonRebind = () => {
        if (backButtonBindRaf) return;
        backButtonBindRaf = requestAnimationFrame(() => {
            backButtonBindRaf = 0;
            backButtonBound = false;
            tryBindBackButton();
        });
    };

    const tryBindBackButton = () => {
        if (backButtonBound) return;

        const hasBackOverrideBridge = typeof (window as any).__oasizSetBackOverride === "function";
        if (!hasBackOverrideBridge) {
            if (!backButtonBindRaf) {
                backButtonBindRaf = requestAnimationFrame(() => {
                    backButtonBindRaf = 0;
                    tryBindBackButton();
                });
            }
            return;
        }

        backButtonBound = true;
        backButtonOff = onBackButton(() => {
            const handler = backButtonHandler;
            backButtonOff?.();
            backButtonOff = null;
            scheduleBackButtonRebind();

            if (handler) {
                handler();
                return;
            }
            leaveGame();
        });
    };

    tryBindBackButton();

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            stopLoop();
        } else {
            startLoop();
            tryBindBackButton();
        }
    });
}

export function gameplayStart(): void {
    if (gameplayActive) return;
    gameplayActive = true;
    if (typeof (oasiz as any).gameplayStart === "function") {
        (oasiz as any).gameplayStart();
    }
}

export function gameplayStop(): void {
    if (!gameplayActive) return;
    gameplayActive = false;
    if (typeof (oasiz as any).gameplayStop === "function") {
        (oasiz as any).gameplayStop();
    }
}

export function triggerPlatformHaptic(enabled: boolean, type: HapticType): void {
    if (!enabled) return;
    triggerHaptic(type);
}

export function submitPlatformScore(score: number): void {
    submitScore(score);
}

export function setBackButtonHandler(handler: BackButtonHandler): void {
    backButtonHandler = handler;
}

export function clearBackButtonHandler(handler: BackButtonHandler): void {
    if (backButtonHandler === handler) {
        backButtonHandler = null;
    }
}

export function leavePlatformGame(): void {
    leaveGame();
}
