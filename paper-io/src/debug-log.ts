type DebugPayload = {
  sessionId: string;
  runId: string;
  hypothesisId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
  timestamp: number;
};

const SESSION_ID = "304a5f";
const RUN_ID = "trail-cutoff-debug-1";
const ENDPOINT =
  "http://127.0.0.1:7401/ingest/dc4ad8c8-bd58-49bd-b6f9-2a498299fa8e";

let panel: HTMLDivElement | null = null;

function ensurePanel(): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  if (panel?.isConnected) return panel;
  const el = document.createElement("div");
  el.id = "agent-debug-panel";
  el.style.position = "fixed";
  el.style.left = "8px";
  el.style.right = "8px";
  el.style.bottom = "8px";
  el.style.maxHeight = "30vh";
  el.style.overflow = "auto";
  el.style.zIndex = "99999";
  el.style.padding = "8px 10px";
  el.style.border = "1px solid rgba(255,255,255,0.35)";
  el.style.borderRadius = "12px";
  el.style.background = "rgba(12,18,22,0.82)";
  el.style.color = "#F6F9FB";
  el.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";
  el.style.fontSize = "11px";
  el.style.lineHeight = "1.35";
  el.style.whiteSpace = "pre-wrap";
  el.style.pointerEvents = "none";
  document.body.appendChild(el);
  panel = el;
  return panel;
}

export function debugLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>,
): void {
  const payload: DebugPayload = {
    sessionId: SESSION_ID,
    runId: RUN_ID,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };

  const el = ensurePanel();
  if (el) {
    const line = document.createElement("div");
    line.textContent =
      "[" + hypothesisId + "] " + message + " " + JSON.stringify(data);
    el.appendChild(line);
    while (el.childElementCount > 16) {
      el.removeChild(el.firstElementChild!);
    }
    el.scrollTop = el.scrollHeight;
  }

  fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": SESSION_ID,
    },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
