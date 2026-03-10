import Phaser from "phaser";

const TRACK_KEYS = ["bg_track_1", "bg_track_2"];

let currentTrackIndex = 0;
let activeScene: Phaser.Scene | undefined;
let activeSound: Phaser.Sound.BaseSound | undefined;
let musicEnabled = true;

function cleanupActiveSound(stopPlayback: boolean): void {
    if (!activeSound) return;
    activeSound.off(Phaser.Sound.Events.COMPLETE);
    if (stopPlayback && activeSound.isPlaying) {
        activeSound.stop();
    }
    activeSound.destroy();
    activeSound = undefined;
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

export function syncBackgroundMusic(scene: Phaser.Scene, enabled: boolean): void {
    activeScene = scene;
    musicEnabled = enabled;

    if (!enabled) {
        cleanupActiveSound(true);
        return;
    }

    if (scene.sound.locked) {
        scene.sound.once(Phaser.Sound.Events.UNLOCKED, () => {
            syncBackgroundMusic(scene, enabled);
        });
        return;
    }

    if (activeSound?.isPlaying) {
        return;
    }

    playNextTrack();
}

export function stopBackgroundMusic(): void {
    cleanupActiveSound(true);
}
