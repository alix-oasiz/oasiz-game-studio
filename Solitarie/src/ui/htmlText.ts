const COLOR_SEQUENCE = ["#FFFFFF", "#111111", "#B3131B"];

type HtmlTextId = string;

interface HtmlTextOptions {
    text: string;
    x: number;
    y: number;
    fontSize: number;
    letterSpacing?: number;
    maxWidth?: number;
    variant?: "menu" | "modal";
    multicolor?: boolean;
    color?: string;
    strokeColor?: string;
    strokeWidth?: number;
    opacity?: number;
}

function getLayer(): HTMLElement | null {
    return document.getElementById("solitaire-html-layer");
}

function getTextElement(id: HtmlTextId): HTMLElement | null {
    const existing = document.getElementById(`solitaire-${id}`);
    if (existing) return existing;

    const layer = getLayer();
    if (!layer) return null;

    const element = document.createElement("div");
    element.id = `solitaire-${id}`;
    element.className = "solitaire-html-text hidden";
    layer.appendChild(element);
    return element;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderLetters(text: string, multicolor: boolean, color: string): string {
    return [...text]
        .map((char, index) => {
            const safeChar = char === " " ? "&nbsp;" : escapeHtml(char);
            const letterColor = multicolor ? COLOR_SEQUENCE[index % COLOR_SEQUENCE.length] : color;
            return `<span class="solitaire-html-letter" style="color:${letterColor}">${safeChar}</span>`;
        })
        .join("");
}

export function showHtmlText(id: HtmlTextId, options: HtmlTextOptions): void {
    const layer = getLayer();
    const element = getTextElement(id);
    if (!layer || !element) return;

    const color = options.color ?? "#FFFFFF";
    const multicolor = options.multicolor ?? true;

    layer.classList.remove("hidden");
    element.classList.remove("hidden");
    element.classList.toggle("solitaire-html-text--menu", options.variant === "menu");
    element.classList.toggle("solitaire-html-text--modal", options.variant === "modal");
    element.style.left = `${Math.round(options.x)}px`;
    element.style.top = `${Math.round(options.y)}px`;
    element.style.fontSize = `${Math.round(options.fontSize)}px`;
    element.style.letterSpacing = `${options.letterSpacing ?? 3}px`;
    element.style.maxWidth = options.maxWidth ? `${Math.round(options.maxWidth)}px` : "none";
    element.style.setProperty("--solitaire-html-stroke-color", options.strokeColor ?? "#FFFFFF");
    element.style.setProperty("--solitaire-html-stroke-width", `${options.strokeWidth ?? 1.5}px`);
    element.style.opacity = `${options.opacity ?? 1}`;
    element.innerHTML = renderLetters(options.text, multicolor, color);
}

export function hideHtmlText(id: HtmlTextId): void {
    const layer = getLayer();
    const element = getTextElement(id);
    if (!element) return;

    element.classList.add("hidden");
    element.innerHTML = "";

    if (layer) {
        const anyVisible = [...layer.children].some((child) => !child.classList.contains("hidden"));
        layer.classList.toggle("hidden", !anyVisible);
    }
}

export function hideAllHtmlText(): void {
    const layer = getLayer();
    if (!layer) return;

    [...layer.children].forEach((child) => {
        if (!(child instanceof HTMLElement)) return;
        child.classList.add("hidden");
        child.innerHTML = "";
    });
    layer.classList.add("hidden");
}
