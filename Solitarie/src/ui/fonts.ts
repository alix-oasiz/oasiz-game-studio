import WebFont from "webfontloader";

export const TITLE_FONT_FAMILY = "'Open Sans', 'Arial', sans-serif";
export const UI_FONT_FAMILY = TITLE_FONT_FAMILY;
export const BUTTON_FONT_FAMILY = TITLE_FONT_FAMILY;

let fontsReadyPromise: Promise<void> | null = null;

export function getUiTextResolution(): number {
    if (typeof window === "undefined") return 2;
    return Math.max(2, Math.min(4, window.devicePixelRatio || 1));
}

export function normalizeUiFontWeight(weight: string): string {
    void weight;
    return "800";
}

export function ensureFontsReady(): Promise<void> {
    if (fontsReadyPromise) return fontsReadyPromise;

    fontsReadyPromise = new Promise<void>((resolve) => {
        let resolved = false;
        const finish = () => {
            if (resolved) return;
            resolved = true;
            resolve();
        };

        const timeoutId = window.setTimeout(finish, 2200);

        WebFont.load({
            custom: {
                families: ["Open Sans"]
            },
            active: () => {
                window.clearTimeout(timeoutId);
                finish();
            },
            inactive: () => {
                window.clearTimeout(timeoutId);
                finish();
            }
        });
    });

    return fontsReadyPromise;
}
