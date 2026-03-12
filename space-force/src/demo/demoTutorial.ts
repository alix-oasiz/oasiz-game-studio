export type TutorialWaitFor = "rotate" | "dash" | "fire" | null;

/** Which mobile touch zone to highlight during this step */
export type TutorialMobileHint = "rotate" | "dash" | "fire" | null;

export interface TutorialStep {
  text: string;
  /** null = auto-advance after holdMs; "rotate"/"dash"/"fire" = wait for player input */
  waitFor: TutorialWaitFor;
  /** How long to hold the panel after typewriter finishes (only used when waitFor is null) */
  holdMs: number;
  /** How long to let the player "try it" before auto-advancing (only when waitFor != null) */
  tryDurationMs: number;
  /** Number of times player must perform the action to advance (only when waitFor != null) */
  requiredCount: number;
  /** Whether to show the Next → button after typewriter completes */
  showNext: boolean;
  /** Which actions are BLOCKED during the try-it phase (demo-only gate) */
  blockActions: ReadonlyArray<"dash" | "fire">;
  /** Which mobile button to highlight above the overlay during this step */
  mobileHint: TutorialMobileHint;
}

export function getTutorialSteps(isMobile: boolean): TutorialStep[] {
  if (isMobile) {
    return [
      {
        text: "Welcome, pilot! Your ship always thrusts forward — use the controls to survive.",
        waitFor: null,
        holdMs: 0,
        tryDurationMs: 0,
        requiredCount: 1,
        showNext: true,
        blockActions: [],
        mobileHint: null,
      },
      {
        text: "Hold the rotate button to steer your ship. Try rotating a few times!",
        waitFor: "rotate",
        holdMs: 0,
        tryDurationMs: 15000,
        requiredCount: 3,
        showNext: false,
        blockActions: ["dash", "fire"],
        mobileHint: "rotate",
      },
      {
        text: "Nice steering! Double-tap the rotate button to dash and dodge. Try it 3 times!",
        waitFor: "dash",
        holdMs: 0,
        tryDurationMs: 20000,
        requiredCount: 3,
        showNext: false,
        blockActions: ["fire"],
        mobileHint: "dash",
      },
      {
        text: "Great dodges! Now tap the fire button to shoot. Fire 3 times!",
        waitFor: "fire",
        holdMs: 0,
        tryDurationMs: 15000,
        requiredCount: 3,
        showNext: false,
        blockActions: [],
        mobileHint: "fire",
      },
    ];
  }

  return [
    {
      text: "Welcome, pilot! Your ship always thrusts forward — use the controls to survive.",
      waitFor: null,
      holdMs: 0,
      tryDurationMs: 0,
      requiredCount: 1,
      showNext: true,
      blockActions: [],
      mobileHint: null,
    },
    {
      text: "Hold A or ← to rotate your ship. Try rotating 3 times!",
      waitFor: "rotate",
      holdMs: 0,
      tryDurationMs: 15000,
      requiredCount: 3,
      showNext: false,
      blockActions: ["dash", "fire"],
      mobileHint: null,
    },
    {
      text: "Nice! Double-tap A to dash and dodge danger. Try dashing 3 times!",
      waitFor: "dash",
      holdMs: 0,
      tryDurationMs: 20000,
      requiredCount: 3,
      showNext: false,
      blockActions: ["fire"],
      mobileHint: null,
    },
    {
      text: "Great moves! Press D, → or Space to fire. Shoot 3 times!",
      waitFor: "fire",
      holdMs: 0,
      tryDurationMs: 15000,
      requiredCount: 3,
      showNext: false,
      blockActions: [],
      mobileHint: null,
    },
  ];
}

export function typewriteText(
  element: HTMLElement,
  text: string,
  charDelayMs = 30,
): { cancel: () => void; done: Promise<void> } {
  let cancelled = false;
  let charIndex = 0;

  const done = new Promise<void>((resolve) => {
    function tick(): void {
      if (cancelled) {
        element.textContent = text;
        resolve();
        return;
      }
      if (charIndex >= text.length) {
        resolve();
        return;
      }
      element.textContent = text.slice(0, charIndex + 1);
      charIndex++;
      setTimeout(tick, charDelayMs);
    }
    tick();
  });

  return {
    cancel: () => {
      cancelled = true;
    },
    done,
  };
}

export function createControlDiagram(
  isMobile: boolean,
  step: "rotate" | "dash" | "fire" | "all" = "all",
): string {
  if (isMobile) {
    if (step === "rotate" || step === "dash") {
      const label = step === "rotate" ? "ROTATE" : "DASH";
      const hint = step === "rotate" ? "Hold left side" : "Double-tap left";
      return `<svg viewBox="0 0 200 72" xmlns="http://www.w3.org/2000/svg" class="demo-diagram-svg">
        <rect x="4" y="4" width="88" height="64" rx="10" fill="rgba(0,240,255,0.12)" stroke="#00f0ff" stroke-width="2"/>
        <text x="48" y="32" text-anchor="middle" fill="#00f0ff" font-family="Orbitron,sans-serif" font-size="9">${label}</text>
        <text x="48" y="50" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-family="sans-serif" font-size="9">${hint}</text>
      </svg>`;
    }
    if (step === "fire") {
      return `<svg viewBox="0 0 200 72" xmlns="http://www.w3.org/2000/svg" class="demo-diagram-svg">
        <rect x="108" y="4" width="88" height="64" rx="10" fill="rgba(255,0,170,0.12)" stroke="#ff00aa" stroke-width="2"/>
        <text x="152" y="32" text-anchor="middle" fill="#ff00aa" font-family="Orbitron,sans-serif" font-size="9">FIRE</text>
        <text x="152" y="50" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-family="sans-serif" font-size="9">Tap right side</text>
      </svg>`;
    }
    // "all"
    return `<svg viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg" class="demo-diagram-svg">
      <rect x="4" y="4" width="88" height="72" rx="10" fill="rgba(0,240,255,0.07)" stroke="#00f0ff" stroke-width="1.5"/>
      <text x="48" y="34" text-anchor="middle" fill="#00f0ff" font-family="Orbitron,sans-serif" font-size="9">ROTATE</text>
      <text x="48" y="54" text-anchor="middle" fill="rgba(255,255,255,0.6)" font-family="sans-serif" font-size="9">Hold left side</text>
      <rect x="108" y="4" width="88" height="72" rx="10" fill="rgba(255,0,170,0.07)" stroke="#ff00aa" stroke-width="1.5"/>
      <text x="152" y="34" text-anchor="middle" fill="#ff00aa" font-family="Orbitron,sans-serif" font-size="9">FIRE</text>
      <text x="152" y="54" text-anchor="middle" fill="rgba(255,255,255,0.6)" font-family="sans-serif" font-size="9">Tap right side</text>
    </svg>`;
  }

  // Desktop
  if (step === "rotate") {
    return `<svg viewBox="0 0 220 72" xmlns="http://www.w3.org/2000/svg" class="demo-diagram-svg">
      <rect x="4" y="4" width="212" height="64" rx="10" fill="rgba(0,240,255,0.1)" stroke="#00f0ff" stroke-width="2"/>
      <text x="110" y="30" text-anchor="middle" fill="#00f0ff" font-family="Orbitron,sans-serif" font-size="9">ROTATE</text>
      <text x="110" y="50" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-family="sans-serif" font-size="10">A  /  ←</text>
    </svg>`;
  }
  if (step === "dash") {
    return `<svg viewBox="0 0 220 72" xmlns="http://www.w3.org/2000/svg" class="demo-diagram-svg">
      <rect x="4" y="4" width="212" height="64" rx="10" fill="rgba(0,240,255,0.1)" stroke="#00f0ff" stroke-width="2"/>
      <text x="110" y="30" text-anchor="middle" fill="#00f0ff" font-family="Orbitron,sans-serif" font-size="9">DASH / DODGE</text>
      <text x="110" y="50" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-family="sans-serif" font-size="10">Double-tap A  /  ←</text>
    </svg>`;
  }
  if (step === "fire") {
    return `<svg viewBox="0 0 220 72" xmlns="http://www.w3.org/2000/svg" class="demo-diagram-svg">
      <rect x="4" y="4" width="212" height="64" rx="10" fill="rgba(255,0,170,0.1)" stroke="#ff00aa" stroke-width="2"/>
      <text x="110" y="30" text-anchor="middle" fill="#ff00aa" font-family="Orbitron,sans-serif" font-size="9">FIRE</text>
      <text x="110" y="50" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-family="sans-serif" font-size="10">D  /  →  /  Space</text>
    </svg>`;
  }
  // "all"
  return `<svg viewBox="0 0 220 80" xmlns="http://www.w3.org/2000/svg" class="demo-diagram-svg">
    <rect x="4" y="4" width="96" height="72" rx="10" fill="rgba(0,240,255,0.07)" stroke="#00f0ff" stroke-width="1.5"/>
    <text x="52" y="30" text-anchor="middle" fill="#00f0ff" font-family="Orbitron,sans-serif" font-size="9">ROTATE</text>
    <text x="52" y="48" text-anchor="middle" fill="rgba(255,255,255,0.6)" font-family="sans-serif" font-size="10">A  /  ←</text>
    <text x="52" y="66" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-family="sans-serif" font-size="8">double-tap to dodge</text>
    <rect x="116" y="4" width="100" height="72" rx="10" fill="rgba(255,0,170,0.07)" stroke="#ff00aa" stroke-width="1.5"/>
    <text x="166" y="30" text-anchor="middle" fill="#ff00aa" font-family="Orbitron,sans-serif" font-size="9">FIRE</text>
    <text x="166" y="48" text-anchor="middle" fill="rgba(255,255,255,0.6)" font-family="sans-serif" font-size="10">D  /  →  /  Space</text>
  </svg>`;
}
