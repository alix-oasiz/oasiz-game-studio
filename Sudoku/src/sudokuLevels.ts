export interface SudokuLevelDefinition {
    number: number;
    title: string;
    clueCount: number;
    completionBonus: number;
}

export interface LevelSceneData {
    level?: number;
}

export const SUDOKU_LEVELS: readonly SudokuLevelDefinition[] = [
    { number: 1, title: "Starter", clueCount: 44, completionBonus: 380 },
    { number: 2, title: "Easy", clueCount: 42, completionBonus: 420 },
    { number: 3, title: "Casual", clueCount: 40, completionBonus: 460 },
    { number: 4, title: "Classic", clueCount: 38, completionBonus: 500 },
    { number: 5, title: "Focused", clueCount: 36, completionBonus: 540 },
    { number: 6, title: "Tough", clueCount: 34, completionBonus: 590 },
    { number: 7, title: "Sharp", clueCount: 32, completionBonus: 640 },
    { number: 8, title: "Expert", clueCount: 30, completionBonus: 700 },
    { number: 9, title: "Elite", clueCount: 28, completionBonus: 760 },
    { number: 10, title: "Master", clueCount: 26, completionBonus: 840 },
    { number: 11, title: "Storm", clueCount: 25, completionBonus: 900 },
    { number: 12, title: "Blaze", clueCount: 25, completionBonus: 960 },
    { number: 13, title: "Phantom", clueCount: 24, completionBonus: 1020 },
    { number: 14, title: "Shadow", clueCount: 24, completionBonus: 1080 },
    { number: 15, title: "Titan", clueCount: 24, completionBonus: 1140 },
    { number: 16, title: "Nova", clueCount: 23, completionBonus: 1210 },
    { number: 17, title: "Vortex", clueCount: 23, completionBonus: 1280 },
    { number: 18, title: "Crown", clueCount: 23, completionBonus: 1350 },
    { number: 19, title: "Legend", clueCount: 22, completionBonus: 1430 },
    { number: 20, title: "Finale", clueCount: 22, completionBonus: 1520 }
] as const;

export const TOTAL_LEVELS = SUDOKU_LEVELS.length;

export function clampLevelNumber(levelNumber: number): number {

    return Math.min(TOTAL_LEVELS, Math.max(1, Math.trunc(levelNumber)));
}

export function getSudokuLevel(levelNumber: number): SudokuLevelDefinition {

    const normalizedLevel = clampLevelNumber(levelNumber);
    return SUDOKU_LEVELS[normalizedLevel - 1];
}

export function getNextLevelNumber(levelNumber: number): number | null {

    const normalizedLevel = clampLevelNumber(levelNumber);
    return normalizedLevel >= TOTAL_LEVELS ? null : normalizedLevel + 1;
}
