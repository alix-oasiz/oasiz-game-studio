export type GameMode = "playing" | "won" | "lost";
export type SettingKey = "music" | "fx" | "haptics";

export interface SettingState {
    music: boolean;
    fx: boolean;
    haptics: boolean;
}

export interface StoredCellSnapshot {
    value: number | null;
    notes: number[];
    wrong: boolean;
    scored: boolean;
}

export interface StoredMoveRecord {
    row: number;
    col: number;
    before: StoredCellSnapshot;
    after: StoredCellSnapshot;
    beforeMistakes: number;
    afterMistakes: number;
    beforeGems: number;
    afterGems: number;
    beforeScore: number;
    afterScore: number;
    beforeHintsUsed: number;
    afterHintsUsed: number;
    beforeMode: GameMode;
    afterMode: GameMode;
    beforeSelectedNumber: number | null;
    afterSelectedNumber: number | null;
}

export interface StoredCell {
    row: number;
    col: number;
    solution: number;
    given: boolean;
    value: number | null;
    notes: number[];
    wrong: boolean;
    scored: boolean;
}

export interface StoredGameSession {
    version: 1;
    board: StoredCell[][];
    mistakes: number;
    elapsedMs: number;
    gems: number;
    pencilMode: boolean;
    selectedRow: number;
    selectedCol: number;
    selectedNumber: number | null;
    mode: GameMode;
    history: StoredMoveRecord[];
    hintsUsed: number;
    savedAt: number;
}

export interface SudokuProfile {
    gamesStarted: number;
    wins: number;
    bestTimeSeconds: number | null;
}

export interface LevelBestScores {
    [levelNumber: string]: number;
}

export const SETTINGS_STORAGE_KEY = "sudoku.settings.v1";
export const SESSION_STORAGE_KEY = "sudoku.session.v1";
export const PROFILE_STORAGE_KEY = "sudoku.profile.v1";
export const LEVEL_BEST_SCORES_STORAGE_KEY = "sudoku.level-best-scores.v1";
export const SETTINGS_CHANGED_EVENT = "sudoku:settings-changed";

const DEFAULT_SETTINGS: SettingState = {
    music: true,
    fx: true,
    haptics: true
};

const DEFAULT_PROFILE: SudokuProfile = {
    gamesStarted: 0,
    wins: 0,
    bestTimeSeconds: null
};

function safeParse<T>(raw: string | null): T | null {

    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function normalizeLevelStorageKey(levelNumber: number): string {

    return String(Math.max(1, Math.trunc(levelNumber)));
}

export function loadSettings(): SettingState {

    const parsed = safeParse<Partial<SettingState>>(localStorage.getItem(SETTINGS_STORAGE_KEY));

    return {
        music: parsed?.music ?? DEFAULT_SETTINGS.music,
        fx: parsed?.fx ?? DEFAULT_SETTINGS.fx,
        haptics: parsed?.haptics ?? DEFAULT_SETTINGS.haptics
    };
}

export function saveSettings(settings: SettingState): void {

    try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // Ignore storage failures and keep runtime state only.
    }

    window.dispatchEvent(new CustomEvent<SettingState>(SETTINGS_CHANGED_EVENT, {
        detail: { ...settings }
    }));
}

export function subscribeToSettingsChange(callback: (settings: SettingState) => void): () => void {

    const handleCustomEvent = (event: Event) => {
        const customEvent = event as CustomEvent<SettingState>;
        const nextSettings = customEvent.detail ?? loadSettings();
        callback({
            music: nextSettings.music,
            fx: nextSettings.fx,
            haptics: nextSettings.haptics
        });
    };

    const handleStorage = (event: StorageEvent) => {
        if (event.key !== SETTINGS_STORAGE_KEY) {
            return;
        }

        callback(loadSettings());
    };

    window.addEventListener(SETTINGS_CHANGED_EVENT, handleCustomEvent as EventListener);
    window.addEventListener("storage", handleStorage);

    return () => {
        window.removeEventListener(SETTINGS_CHANGED_EVENT, handleCustomEvent as EventListener);
        window.removeEventListener("storage", handleStorage);
    };
}

export function loadGameSession(): StoredGameSession | null {

    const parsed = safeParse<StoredGameSession>(localStorage.getItem(SESSION_STORAGE_KEY));

    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.board) || parsed.board.length !== 9) {
        return null;
    }

    return parsed;
}

export function saveGameSession(session: StoredGameSession): void {

    try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
        // Ignore storage failures and keep runtime state only.
    }
}

export function clearGameSession(): void {

    try {
        localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
        // Ignore storage failures.
    }
}

export function loadProfile(): SudokuProfile {

    const parsed = safeParse<Partial<SudokuProfile>>(localStorage.getItem(PROFILE_STORAGE_KEY));

    return {
        gamesStarted: parsed?.gamesStarted ?? DEFAULT_PROFILE.gamesStarted,
        wins: parsed?.wins ?? DEFAULT_PROFILE.wins,
        bestTimeSeconds: parsed?.bestTimeSeconds ?? DEFAULT_PROFILE.bestTimeSeconds
    };
}

function saveProfile(profile: SudokuProfile): void {

    try {
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch {
        // Ignore storage failures and keep runtime state only.
    }
}

export function recordGameStarted(): SudokuProfile {

    const profile = loadProfile();
    const nextProfile: SudokuProfile = {
        ...profile,
        gamesStarted: profile.gamesStarted + 1
    };

    saveProfile(nextProfile);
    return nextProfile;
}

export function loadLevelBestScores(): LevelBestScores {

    const parsed = safeParse<unknown>(localStorage.getItem(LEVEL_BEST_SCORES_STORAGE_KEY));

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
    }

    const nextScores: LevelBestScores = {};

    for (const [key, value] of Object.entries(parsed)) {
        if (typeof value !== "number" || !Number.isFinite(value)) {
            continue;
        }

        nextScores[key] = Math.max(0, Math.round(value));
    }

    return nextScores;
}

export function loadLevelBestScore(levelNumber: number): number | null {

    const key = normalizeLevelStorageKey(levelNumber);
    const score = loadLevelBestScores()[key];
    return typeof score === "number" ? score : null;
}

export function saveLevelBestScore(levelNumber: number, score: number): number {

    const key = normalizeLevelStorageKey(levelNumber);
    const currentScores = loadLevelBestScores();
    const normalizedScore = Math.max(0, Math.round(score));
    const currentBest = currentScores[key];
    const nextBest = typeof currentBest === "number"
        ? Math.max(currentBest, normalizedScore)
        : normalizedScore;

    try {
        localStorage.setItem(LEVEL_BEST_SCORES_STORAGE_KEY, JSON.stringify({
            ...currentScores,
            [key]: nextBest
        }));
    } catch {
        // Ignore storage failures and keep runtime state only.
    }

    return nextBest;
}

export function recordGameWon(totalSeconds: number): SudokuProfile {

    const profile = loadProfile();
    const bestTimeSeconds = profile.bestTimeSeconds === null
        ? totalSeconds
        : Math.min(profile.bestTimeSeconds, totalSeconds);

    const nextProfile: SudokuProfile = {
        ...profile,
        wins: profile.wins + 1,
        bestTimeSeconds
    };

    saveProfile(nextProfile);
    return nextProfile;
}
