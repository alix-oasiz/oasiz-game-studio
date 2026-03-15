let backgroundMusic: HTMLAudioElement | undefined;
let shouldPlay = false;
let unlockListenersInstalled = false;
let lastPlayError: string | null = null;

type DebugWindow = Window & {
    __SUDOKU_BG_MUSIC_DEBUG__?: () => {
        shouldPlay: boolean;
        paused: boolean;
        currentTime: number;
        readyState: number;
        networkState: number;
        src: string;
        lastPlayError: string | null;
    };
};

function resolveBackgroundMusicPath(): string {

    return new URL("assets/bgMusic.mp3", document.baseURI).toString();
}

function updateDebugHook(): void {

    const debugWindow = window as DebugWindow;
    debugWindow.__SUDOKU_BG_MUSIC_DEBUG__ = () => {
        const music = getBackgroundMusic();
        return {
            shouldPlay,
            paused: music.paused,
            currentTime: Number(music.currentTime.toFixed(2)),
            readyState: music.readyState,
            networkState: music.networkState,
            src: music.currentSrc || music.src,
            lastPlayError
        };
    };
}

async function attemptBackgroundMusicPlay(): Promise<void> {

    if (!shouldPlay) {
        return;
    }

    const music = getBackgroundMusic();
    music.volume = 0.56;
    music.muted = false;

    if (music.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        music.load();
    }

    try {
        await music.play();
        lastPlayError = null;
    } catch (error) {
        lastPlayError = error instanceof Error ? error.message : String(error);
        // Autoplay may remain blocked until the browser accepts playback.
    }

    updateDebugHook();
}

function installUnlockListeners(): void {

    if (unlockListenersInstalled) {
        return;
    }

    unlockListenersInstalled = true;
    const unlock = () => {
        void attemptBackgroundMusicPlay();
    };

    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    window.addEventListener("focus", unlock);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            void attemptBackgroundMusicPlay();
        }
    });
}

function getBackgroundMusic(): HTMLAudioElement {

    if (backgroundMusic) {
        return backgroundMusic;
    }

    backgroundMusic = document.createElement("audio");
    backgroundMusic.src = resolveBackgroundMusicPath();
    backgroundMusic.loop = true;
    backgroundMusic.preload = "auto";
    backgroundMusic.volume = 0.56;
    backgroundMusic.setAttribute("playsinline", "");
    backgroundMusic.setAttribute("webkit-playsinline", "true");
    backgroundMusic.style.display = "none";
    document.body.appendChild(backgroundMusic);
    backgroundMusic.load();
    backgroundMusic.addEventListener("canplaythrough", () => {
        if (shouldPlay) {
            void attemptBackgroundMusicPlay();
        }
    });
    updateDebugHook();
    return backgroundMusic;
}

export function syncBackgroundMusic(enabled: boolean): void {

    installUnlockListeners();
    shouldPlay = enabled;
    const music = getBackgroundMusic();
    music.volume = 0.56;
    updateDebugHook();

    if (!enabled) {
        music.pause();
        return;
    }

    void attemptBackgroundMusicPlay();
}

export function unlockBackgroundMusic(): void {

    installUnlockListeners();
    void attemptBackgroundMusicPlay();
}
