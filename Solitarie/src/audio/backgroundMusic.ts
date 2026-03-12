import Phaser from "phaser";

const TRACK_KEYS = ["bg_track_1", "bg_track_2"];

let currentTrackIndex = 0;
let activeScene: Phaser.Scene | undefined;
let activeSound: Phaser.Sound.BaseSound | undefined;
let musicEnabled = true;
let pendingUnlockHandler: (() => void) | undefined;

function cleanupActiveSound(stopPlayback: boolean): void {
    if (!activeSound) return;
    activeSound.off(Phaser.Sound.Events.COMPLETE);
    if (stopPlayback && activeSound.isPlaying) {
        activeSound.stop();
    }
    activeSound.destroy();
    activeSound = undefined;
}

function clearPendingUnlock(): void {
    if (!activeScene || !pendingUnlockHandler) return;
    activeScene.sound.off(Phaser.Sound.Events.UNLOCKED, pendingUnlockHandler);
    pendingUnlockHandler = undefined;
}

function playNextTrack(): void {
    if (!musicEnabled || !activeScene) return;

    const key = TRACK_KEYS[currentTrackIndex % TRACK_KEYS.length];
    currentTrackIndex = (currentTrackIndex + 1) % TRACK_KEYS.length;

    if (!activeScene.cache.audio.exists(key)) return;

    cleanupActiveSound(false);
    activeSound = activeScene.sound.add(key, { volume: 0.3 });
    activeSound.once(Phaser.Sound.Events.COMPLETE, () => {
        activeSound?.destroy();
        activeSound = undefined;
        playNextTrack();
    });
    activeSound.play();
}

export function syncBackgroundMusic(scene: Phaser.Scene, enabled: boolean, refresh = false): void {
    const sceneChanged = activeScene !== scene;
    if (sceneChanged) {
        clearPendingUnlock();
    }
    activeScene = scene;
    musicEnabled = enabled;

    if (!enabled) {
        clearPendingUnlock();
        cleanupActiveSound(true);
        return;
    }

    if (scene.sound.locked) {
        clearPendingUnlock();
        pendingUnlockHandler = () => {
            pendingUnlockHandler = undefined;
            syncBackgroundMusic(scene, enabled, true);
        };
        scene.sound.once(Phaser.Sound.Events.UNLOCKED, pendingUnlockHandler);
        return;
    }

    const shouldRestart = refresh || sceneChanged || !activeSound || !activeSound.isPlaying;
    if (shouldRestart) {
        cleanupActiveSound(true);
        playNextTrack();
        return;
    }
}

export function stopBackgroundMusic(): void {
    clearPendingUnlock();
    cleanupActiveSound(true);
}
