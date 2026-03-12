type HtmlButtonId = string;

type HtmlButtonTheme = "orange" | "blue" | "red" | "green" | "purple";

interface HtmlButtonOptions {
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    radius: number;
    fontSize: number;
    theme: HtmlButtonTheme;
    enabled?: boolean;
    opacity?: number;
    debounceMs?: number;
    onClick?: () => void;
}

const BUTTON_THEMES: Record<HtmlButtonTheme, { main: string; rim: string }> = {
    orange: { main: "#F08C24", rim: "#8C4A08" },
    blue: { main: "#1F3D7A", rim: "#10254A" },
    red: { main: "#B3131B", rim: "#111111" },
    green: { main: "#1E8449", rim: "#0E4B28" },
    purple: { main: "#6C4BCF", rim: "#3A2872" }
};

function getLayer(): HTMLElement | null {
    return document.getElementById("solitaire-html-button-layer");
}

function getButtonElement(id: HtmlButtonId): HTMLButtonElement | null {
    const existing = document.getElementById(`solitaire-${id}`);
    if (existing instanceof HTMLButtonElement) return existing;

    const layer = getLayer();
    if (!layer) return null;

    const element = document.createElement("button");
    element.id = `solitaire-${id}`;
    element.type = "button";
    element.className = "solitaire-html-button hidden";
    layer.appendChild(element);
    return element;
}

function syncLayerVisibility(): void {
    const layer = getLayer();
    if (!layer) return;
    const anyVisible = [...layer.children].some((child) => !child.classList.contains("hidden"));
    layer.classList.toggle("hidden", !anyVisible);
}

export function showHtmlButton(id: HtmlButtonId, options: HtmlButtonOptions): void {
    const layer = getLayer();
    const element = getButtonElement(id);
    if (!layer || !element) return;

    const theme = BUTTON_THEMES[options.theme];
    const enabled = options.enabled ?? true;
    const debounceMs = options.debounceMs ?? 0;

    layer.classList.remove("hidden");
    element.classList.remove("hidden");
    element.classList.toggle("is-disabled", !enabled);
    element.disabled = !enabled;
    element.textContent = options.text;
    element.style.left = `${Math.round(options.x)}px`;
    element.style.top = `${Math.round(options.y)}px`;
    element.style.width = `${Math.round(options.width)}px`;
    element.style.height = `${Math.round(options.height)}px`;
    element.style.borderRadius = `${Math.round(options.radius)}px`;
    element.style.fontSize = `${Math.round(options.fontSize)}px`;
    element.style.opacity = `${options.opacity ?? 1}`;
    element.style.setProperty("--btn-main", theme.main);
    element.style.setProperty("--btn-rim", theme.rim);
    element.style.setProperty("--btn-press-offset", options.height >= 56 ? "6px" : "4px");
    element.classList.remove("is-pressed");

    element.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!enabled) return;
        if (debounceMs > 0) {
            const now = Date.now();
            const lastClickAt = Number(element.dataset.lastClickAt ?? "0");
            if (now - lastClickAt < debounceMs) {
                return;
            }
            element.dataset.lastClickAt = `${now}`;
        }
        options.onClick?.();
    };
    element.onpointerdown = (event) => {
        event.preventDefault();
        if (!enabled) return;
        element.classList.add("is-pressed");
    };
    element.onpointerup = () => {
        element.classList.remove("is-pressed");
    };
    element.onpointerleave = () => {
        element.classList.remove("is-pressed");
    };
    element.onpointercancel = () => {
        element.classList.remove("is-pressed");
    };
}

export function hideHtmlButton(id: HtmlButtonId): void {
    const element = getButtonElement(id);
    if (!element) return;
    element.classList.add("hidden");
    element.classList.remove("is-pressed");
    element.textContent = "";
    element.onclick = null;
    element.onpointerdown = null;
    element.onpointerup = null;
    element.onpointerleave = null;
    element.onpointercancel = null;
    syncLayerVisibility();
}

export function hideAllHtmlButtons(): void {
    const layer = getLayer();
    if (!layer) return;

    [...layer.children].forEach((child) => {
        if (!(child instanceof HTMLButtonElement)) return;
        child.classList.add("hidden");
        child.classList.remove("is-pressed");
        child.textContent = "";
        child.onclick = null;
        child.onpointerdown = null;
        child.onpointerup = null;
        child.onpointerleave = null;
        child.onpointercancel = null;
    });
    layer.classList.add("hidden");
}
