import Phaser from "phaser";
import { oasiz } from "@oasiz/sdk";

type HapticType = "light" | "medium" | "heavy" | "success" | "error";

let lifecycleBound = false;
let gameplayActive = false;

export function initOasiz(game: Phaser.Game): void {
    if (lifecycleBound) return;
    lifecycleBound = true;

    console.log("[Platform] Initializing Oasiz SDK");

    if (typeof (oasiz as any).emitScoreConfig === "function") {
        (oasiz as any).emitScoreConfig({
            anchors: [
                { raw: 200, normalized: 100 },
                { raw: 800, normalized: 300 },
                { raw: 1800, normalized: 600 },
                { raw: 3200, normalized: 950 }
            ]
        });
    }

    const stopLoop = () => {
        console.log("[Platform] Blurring Phaser loop");
        game.loop.blur();
    };

    const resetInput = () => {
        const inputManager = game.input as Phaser.Input.InputManager | undefined;
        if (inputManager && typeof inputManager.resetPointers === "function") {
            console.log("[Platform] Resetting Phaser pointers");
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
        console.log("[Platform] Focusing Phaser loop");
        game.loop.focus();
    };

    oasiz.onPause(() => {
        console.log("[Platform] Pause event");
        stopLoop();
    });

    oasiz.onResume(() => {
        console.log("[Platform] Resume event");
        startLoop();
    });

    document.addEventListener("visibilitychange", () => {
        console.log("[Platform] Visibility changed");
        if (document.hidden) {
            stopLoop();
        } else {
            startLoop();
        }
    });
}

export function gameplayStart(): void {
    if (gameplayActive) return;
    gameplayActive = true;
    console.log("[Platform] Gameplay started");
    if (typeof (oasiz as any).gameplayStart === "function") {
        (oasiz as any).gameplayStart();
    }
}

export function gameplayStop(): void {
    if (!gameplayActive) return;
    gameplayActive = false;
    console.log("[Platform] Gameplay stopped");
    if (typeof (oasiz as any).gameplayStop === "function") {
        (oasiz as any).gameplayStop();
    }
}

export function triggerPlatformHaptic(enabled: boolean, type: HapticType): void {
    if (!enabled) return;
    console.log("[Platform] Trigger haptic");
    oasiz.triggerHaptic(type);
}

export function submitPlatformScore(score: number): void {
    console.log("[Platform] Submit score");
    oasiz.submitScore(score);
}
