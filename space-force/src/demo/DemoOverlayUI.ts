import {
  getTutorialSteps,
  typewriteText,
  createControlDiagram,
  TutorialMobileHint,
} from "./demoTutorial";
import { AudioManager } from "../AudioManager";

export interface DemoOverlayCallbacks {
  onTutorialComplete: () => void;
  /** Called when tutorial panel should pause the sim */
  onPauseGame: () => void;
  /** Called when tutorial panel should resume the sim ("try it" phase) */
  onResumeGame: () => void;
  /** Returns the player's ship primary color hex */
  getShipColor: () => string;
  /** Returns the ship's current CSS viewport position */
  getShipPos: () => { x: number; y: number } | null;
  /** Sets/clears the camera zoom boost */
  setZoom: (boost: number | null) => void;
  /** Subscribes to local input actions (from the real game input pipeline). */
  subscribeInputAction: (
    handler: (action: "rotate" | "fire" | "dash") => void,
  ) => () => void;
  /** Demo-only: block specific actions so the player can't perform them in-game */
  setDemoInputBlock: (blocked: { fire: boolean; dash: boolean }) => void;
}

export class DemoOverlayUI {
  private tutorialOverlay: HTMLElement;
  private tutorialPanel: HTMLElement;
  private tutorialDiagram: HTMLElement;
  private tutorialDialogue: HTMLElement;
  private tutorialSkip: HTMLButtonElement;
  private exitBtn: HTMLButtonElement;
  private settingsBtn: HTMLButtonElement;
  private skipTutorialBtn: HTMLButtonElement;

  // Spotlight (player-intro overlay) elements
  private spotlightOverlay: HTMLElement;
  private spotlightRing: HTMLElement;

  private callbacks: DemoOverlayCallbacks | null = null;
  private isMobile: boolean;
  private tutorialRunning = false;
  private cancelTypewriter: (() => void) | null = null;
  private pendingDialogAdvance: (() => void) | null = null;

  // Spotlight state
  private spotlightActive = false;
  private spotlightTrackInterval: number | null = null;
  private spotlightFirstActionTriggered = false;
  private lastStateTapAtMs = 0;
  private readonly handleTutorialSkipClick = (e: Event): void => {
    if (!this.guardStateTap(e)) return;
    // While text is typing, this acts as a fast-forward.
    if (this.cancelTypewriter !== null) {
      this.cancelTypewriter();
      this.cancelTypewriter = null;
      return;
    }
    // For dialog steps that require explicit progression, this advances.
    if (this.pendingDialogAdvance !== null) {
      const advance = this.pendingDialogAdvance;
      this.pendingDialogAdvance = null;
      advance();
    }
  };

  /** Cleanup for the active mobile touch highlight */
  private clearActiveMobileHighlight: (() => void) | null = null;

  constructor(isMobile: boolean) {
    this.isMobile = isMobile;

    this.tutorialOverlay = document.getElementById("demoTutorialOverlay")!;
    this.tutorialPanel = document.getElementById("demoTutorialPanel")!;
    this.tutorialDiagram = document.getElementById("demoTutorialDiagram")!;
    this.tutorialDialogue = document.getElementById("demoTutorialDialogue")!;
    this.tutorialSkip = document.getElementById(
      "demoTutorialSkip",
    ) as HTMLButtonElement;
    this.exitBtn = document.getElementById(
      "demoExitBtn",
    ) as HTMLButtonElement;
    this.settingsBtn = document.getElementById(
      "demoSettingsBtn",
    ) as HTMLButtonElement;
    this.skipTutorialBtn = document.getElementById(
      "demoSkipTutorialBtn",
    ) as HTMLButtonElement;
    this.spotlightOverlay = document.getElementById(
      "demoPlayerIntroOverlay",
    )!;
    this.spotlightRing = document.getElementById(
      "demoPlayerIntroRing",
    )!;
  }

  setCallbacks(callbacks: DemoOverlayCallbacks): void {
    this.callbacks = callbacks;
  }

  showTutorial(isMobile = this.isMobile): void {
    this.tutorialOverlay.style.pointerEvents = "auto";
    this.tutorialOverlay.classList.remove("hidden");
    this.resetTutorialSkipButton();
    this.hideTutorialActionButton();
    this.tutorialSkip.addEventListener("click", this.handleTutorialSkipClick);

    void this.runTutorial(isMobile);
  }

  private resetTutorialSkipButton(): void {
    const fresh = this.tutorialSkip.cloneNode(true) as HTMLButtonElement;
    this.tutorialSkip.parentNode?.replaceChild(fresh, this.tutorialSkip);
    this.tutorialSkip = fresh;
    this.tutorialSkip.textContent = "Next";
    this.tutorialSkip.classList.remove("demo-start-playing-btn");
    this.tutorialSkip.classList.add("hidden");
  }

  /** Shows the Exit Demo button (top-left). Call after tutorial completes. */
  showExitButton(onExit: () => void): void {
    this.exitBtn.classList.remove("hidden");
    // Clone to remove any prior click listeners
    const fresh = this.exitBtn.cloneNode(true) as HTMLButtonElement;
    this.exitBtn.parentNode?.replaceChild(fresh, this.exitBtn);
    this.exitBtn = fresh;
    this.exitBtn.addEventListener("click", (e) => {
      if (!this.guardStateTap(e)) return;
      this.exitBtn.classList.add("hidden");
      onExit();
    });
  }

  /** Fires the tutorial complete callback immediately — used by the skip button. */
  triggerTutorialComplete(): void {
    this.hideAll();
    this.callbacks?.onTutorialComplete();
  }

  /** Shows the Skip Tutorial button (top-right, left of settings) during tutorial. */
  showSkipTutorialButton(onSkip: () => void): void {
    this.skipTutorialBtn.classList.remove("hidden");
    const fresh = this.skipTutorialBtn.cloneNode(true) as HTMLButtonElement;
    this.skipTutorialBtn.parentNode?.replaceChild(fresh, this.skipTutorialBtn);
    this.skipTutorialBtn = fresh;
    this.skipTutorialBtn.addEventListener("click", () => {
      onSkip();
    });
  }

  /** Shows the Settings button (top-right) during tutorial. */
  showSettingsButton(onOpenSettings: () => void): void {
    this.settingsBtn.classList.remove("hidden");
    // Clone to remove any prior click listeners
    const fresh = this.settingsBtn.cloneNode(true) as HTMLButtonElement;
    this.settingsBtn.parentNode?.replaceChild(fresh, this.settingsBtn);
    this.settingsBtn = fresh;
    this.settingsBtn.addEventListener("click", () => {
      onOpenSettings();
    });
  }

  /** Waits for the centered tutorial action button to advance the dialog. */
  private waitForNextButton(): Promise<void> {
    return new Promise((resolve) => {
      this.pendingDialogAdvance = (): void => {
        this.hideTutorialActionButton();
        resolve();
      };
    });
  }

  hideAll(): void {
    this.tutorialOverlay.classList.add("hidden");
    this.hideTutorialActionButton();
    this.exitBtn.classList.add("hidden");
    this.settingsBtn.classList.add("hidden");
    this.skipTutorialBtn.classList.add("hidden");
    this.cancelTypewriter?.();
    AudioManager.stopCue("CAPTAIN_SPEECH");
    this.tutorialRunning = false;
    this.pendingDialogAdvance = null;
    this.tutorialOverlay.style.pointerEvents = "";

    // Clear spotlight, mobile highlight, zoom, and input blocks on cleanup
    this.stopSpotlight();
    this.clearActiveMobileHighlight?.();
    this.clearActiveMobileHighlight = null;
    this.callbacks?.setZoom(null);
    this.callbacks?.setDemoInputBlock({ fire: false, dash: false });
  }

  destroy(): void {
    this.hideAll();
  }

  private guardStateTap(e: Event | null): boolean {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const now = Date.now();
    if (now - this.lastStateTapAtMs < 300) {
      return false;
    }
    this.lastStateTapAtMs = now;
    return true;
  }

  // -------------------------------------------------------------------------
  // Spotlight management — dark overlay with ship-centered circular hole
  // -------------------------------------------------------------------------

  private startSpotlight(): void {
    if (!this.callbacks) return;
    const overlay = this.spotlightOverlay;
    const ring = this.spotlightRing;
    const cb = this.callbacks;

    const shipColor = cb.getShipColor();
    ring.style.borderColor = shipColor;
    ring.style.boxShadow = `0 0 24px ${shipColor}, 0 0 48px ${shipColor}55`;
    ring.style.opacity = "1";

    const positionRing = (): void => {
      const pos = cb.getShipPos();
      if (pos) {
        ring.style.left = `${pos.x}px`;
        ring.style.top = `${pos.y}px`;
        overlay.style.setProperty("--spot-x", `${pos.x}px`);
        overlay.style.setProperty("--spot-y", `${pos.y}px`);
      }
    };

    // Start with a tight circle (inline override beats the class value)
    // After a short delay, remove the override → CSS transition expands to spot-panel size
    overlay.style.setProperty("--spot-r", "52px");
    overlay.style.setProperty("--spot-bg-alpha", "0.88");
    overlay.classList.remove("hidden", "spot-action", "spot-panel");
    overlay.style.pointerEvents = "none";

    // Ring starts small to match the tight spotlight
    ring.style.width = "75px";
    ring.style.height = "75px";

    positionRing();
    this.spotlightTrackInterval = window.setInterval(positionRing, 16);
    this.spotlightActive = true;

    // After 200 ms the camera tween has started — remove inline override so
    // the CSS transition (0.45 s) expands the circle to spot-panel radius
    setTimeout(() => {
      if (!this.spotlightActive) return;
      overlay.style.removeProperty("--spot-r");
      overlay.classList.add("spot-panel");
      this.applyRingSize("panel");
    }, 200);
  }

  /**
   * Switch spotlight between "panel" (wide hole while tip text is showing)
   * and "action" (tighter focus while player is performing the action).
   */
  private setSpotlightMode(mode: "panel" | "action"): void {
    if (!this.spotlightActive) return;
    this.spotlightOverlay.classList.toggle("spot-panel", mode === "panel");
    this.spotlightOverlay.classList.toggle("spot-action", mode === "action");
    this.applyRingSize(mode);
  }

  /** Smoothly resize the ring to match the spotlight hole. */
  private applyRingSize(mode: "panel" | "action"): void {
    // Ring diameter ≈ 2 × spotlight-radius × 0.9  (sits just inside fade edge)
    const diameter = mode === "panel" ? 210 : 130;
    this.spotlightRing.style.width = `${diameter}px`;
    this.spotlightRing.style.height = `${diameter}px`;
  }

  private stopSpotlight(): void {
    if (this.spotlightTrackInterval !== null) {
      clearInterval(this.spotlightTrackInterval);
      this.spotlightTrackInterval = null;
    }
    this.spotlightOverlay.classList.add("hidden");
    this.spotlightOverlay.classList.remove("spot-panel", "spot-action", "spot-dimmed");
    this.spotlightOverlay.style.removeProperty("--spot-r");
    this.spotlightOverlay.style.removeProperty("--spot-bg-alpha");
    this.spotlightRing.style.removeProperty("width");
    this.spotlightRing.style.removeProperty("height");
    this.spotlightRing.style.removeProperty("left");
    this.spotlightRing.style.removeProperty("top");
    this.spotlightRing.style.removeProperty("border-color");
    this.spotlightRing.style.removeProperty("box-shadow");
    this.spotlightRing.style.removeProperty("opacity");
    this.spotlightActive = false;
  }

  /**
   * Dissolve the spotlight by blooming the circular hole outward from the
   * ship's current position until it fills the viewport, then clean up.
   * Used by "Start Playing" so the transition feels ship-centered.
   */
  private fadeOutSpotlightFromShip(): void {
    if (!this.spotlightActive) return;

    // Stop position tracking — pin the hole at the ship's last known position
    if (this.spotlightTrackInterval !== null) {
      clearInterval(this.spotlightTrackInterval);
      this.spotlightTrackInterval = null;
    }
    this.spotlightActive = false;

    const overlay = this.spotlightOverlay;

    // Use ease-out so the bloom accelerates quickly from the ship, then
    // gently fills the screen edges; fade the dark veil out simultaneously
    overlay.style.transition =
      "--spot-r 0.65s ease-out, --spot-bg-alpha 0.5s ease-in, opacity 0.35s ease, visibility 0.35s ease";
    overlay.style.setProperty("--spot-r", "200vmax");
    overlay.style.setProperty("--spot-bg-alpha", "0");

    // After transitions finish, clean up fully
    setTimeout(() => {
      overlay.classList.add("hidden");
      overlay.classList.remove("spot-panel", "spot-action", "spot-dimmed");
      overlay.style.removeProperty("--spot-r");
      overlay.style.removeProperty("--spot-bg-alpha");
      overlay.style.removeProperty("transition");
    }, 750);
  }

  /** Called on the player's first action — widens spotlight while keeping demo veil dark. */
  private dimSpotlight(): void {
    if (!this.spotlightActive) return;
    // Keep the veil dark in demo flow while widening spotlight coverage.
    this.spotlightOverlay.classList.remove("spot-dimmed");
    this.spotlightOverlay.style.setProperty("--spot-bg-alpha", "0.88");
    this.spotlightOverlay.style.setProperty("--spot-r", "185px");
    this.spotlightRing.style.opacity = "1";
    this.applyRingSize("panel");
  }

  // -------------------------------------------------------------------------
  // Interactive tutorial flow
  // -------------------------------------------------------------------------

  private async runTutorial(isMobile: boolean): Promise<void> {
    this.tutorialRunning = true;
    this.spotlightFirstActionTriggered = false;
    const steps = getTutorialSteps(isMobile);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (!this.tutorialRunning) break;

      // --- Zoom + spotlight activate before the first action step ---
      if (i === 1) {
        // Step 1: snap to tight zoom so the ship fills the screen
        this.callbacks?.setZoom(2.5);
        await this.wait(300);
        if (!this.tutorialRunning) break;

        // Step 2: spotlight appears as a tight circle at the ship
        this.startSpotlight();

        // Step 3: simultaneously zoom out slightly + let circle expand
        // (CSS @property transition handles the --spot-r expansion over 0.45 s)
        await this.tweenZoom(2.5, 1.7, 650);
        if (!this.tutorialRunning) break;

        await this.wait(150);
        if (!this.tutorialRunning) break;
      }

      // --- Apply input restrictions for this step ---
      if (step.waitFor !== null) {
        const blockDash = step.blockActions.includes("dash");
        const blockFire = step.blockActions.includes("fire");
        this.callbacks?.setDemoInputBlock({ dash: blockDash, fire: blockFire });
      }

      // --- Show diagram for this step ---
      this.tutorialDiagram.innerHTML = createControlDiagram(
        isMobile,
        step.waitFor ?? "all",
      );

      // --- Mobile button highlight applied BEFORE showPanel so the button is
      //     visible and tappable even while the player is reading the tip. ---
      this.clearActiveMobileHighlight?.();
      this.clearActiveMobileHighlight = null;
      if (isMobile && step.mobileHint !== null) {
        this.clearActiveMobileHighlight = this.startMobileButtonHighlight(
          step.mobileHint,
        );
      }

      // --- Show panel with typewriter, spotlight in panel-wide mode ---
      this.showPanel();
      this.showTutorialNextButton();
      this.callbacks?.onPauseGame();
      this.tutorialDialogue.textContent = "";
      await this.typeStep(step.text);
      if (!this.tutorialRunning) break;

      // --- Wait for Next button if required (welcome step) ---
      if (step.showNext) {
        await this.waitForNextButton();
        if (!this.tutorialRunning) break;
        continue;
      }
      this.hideTutorialActionButton();

      // --- Action step: keep panel visible, make overlay pass-through, resume sim ---
      // Bot ships are frozen in the simulation (demoFrozenPlayerIds); only the
      // player's ship responds. emitLocalInputActions() counts button presses.
      this.setPanelPassthrough();
      this.callbacks?.onResumeGame();

      if (step.waitFor !== null) {
        await this.waitForInputCount(
          step.waitFor,
          step.requiredCount,
        );
        if (!this.tutorialRunning) break;
      }

      // Clear mobile highlight before next step
      this.clearActiveMobileHighlight?.();
      this.clearActiveMobileHighlight = null;
    }

    if (!this.tutorialRunning) return;

    // All action steps done — clear restrictions
    this.callbacks?.setDemoInputBlock({ fire: false, dash: false });
    this.clearActiveMobileHighlight?.();
    this.clearActiveMobileHighlight = null;

    // Show final "Start Playing" panel (spotlight stays wide, zoom stays)
    this.tutorialRunning = false;
    this.tutorialDiagram.innerHTML = "";
    this.showPanel();
    this.callbacks?.onPauseGame();
    this.tutorialDialogue.textContent = "You're ready. Good luck, Cadet!";
    this.showStartPlayingButton();
  }

  private showPanel(): void {
    this.tutorialOverlay.style.pointerEvents = "auto";
    this.tutorialPanel.style.pointerEvents = "";
    this.tutorialPanel.classList.remove("panel-hidden");
    this.setSpotlightMode("panel");
  }

  /**
   * Keeps the panel VISIBLE but makes the overlay background pass-through so
   * touch/mouse events reach the game canvas underneath. The panel itself still
   * receives pointer events (tutorial action button stays tappable).
   */
  private setPanelPassthrough(): void {
    this.tutorialOverlay.style.pointerEvents = "none";
    this.tutorialPanel.style.pointerEvents = "auto";
    // Spotlight stays wide — panel is still showing
    this.setSpotlightMode("panel");
  }

  private showStartPlayingButton(): void {
    this.pendingDialogAdvance = null;
    const fresh = this.tutorialSkip.cloneNode(true) as HTMLButtonElement;
    this.tutorialSkip.parentNode?.replaceChild(fresh, this.tutorialSkip);
    this.tutorialSkip = fresh;
    this.tutorialSkip.textContent = "Start Playing";
    this.tutorialSkip.classList.add("demo-start-playing-btn");
    this.tutorialSkip.classList.remove("hidden");
    this.tutorialSkip.addEventListener("click", (e) => {
      if (!this.guardStateTap(e)) return;
      // Bloom the spotlight outward from the ship, then promote to live match
      this.fadeOutSpotlightFromShip();
      this.callbacks?.setZoom(null);
      this.tutorialOverlay.classList.add("hidden");
      this.callbacks?.onTutorialComplete();
    });
  }

  private showTutorialNextButton(): void {
    this.tutorialSkip.textContent = "Next";
    this.tutorialSkip.classList.remove("demo-start-playing-btn");
    this.tutorialSkip.classList.remove("hidden");
  }

  private hideTutorialActionButton(): void {
    this.pendingDialogAdvance = null;
    this.tutorialSkip.classList.add("hidden");
  }

  private async typeStep(text: string): Promise<void> {
    const tw = typewriteText(this.tutorialDialogue, text, 28);
    this.cancelTypewriter = tw.cancel;
    void AudioManager.playCue("CAPTAIN_SPEECH");
    try {
      await tw.done;
    } finally {
      this.cancelTypewriter = null;
      AudioManager.stopCue("CAPTAIN_SPEECH");
    }
  }

  /**
   * Waits for the player to perform an action N times before resolving.
   * Only advances when the required count is fully met — no auto-timeout.
   */
  private waitForInputCount(
    action: "rotate" | "dash" | "fire",
    requiredCount: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      let resolved = false;
      let count = 0;
      let unsubscribeInputAction: (() => void) | null = null;

      const done = (): void => {
        if (resolved) return;
        resolved = true;
        unsubscribeInputAction?.();
        unsubscribeInputAction = null;
        // Brief pause to let the last action animate before advancing
        setTimeout(resolve, 800);
      };

      unsubscribeInputAction = this.callbacks?.subscribeInputAction(
        (localAction) => {
          if (!this.tutorialRunning) {
            done();
            return;
          }
          if (localAction === action) {
            // On the very first action, dim the spotlight overlay
            if (!this.spotlightFirstActionTriggered) {
              this.spotlightFirstActionTriggered = true;
              this.dimSpotlight();
            }
            count++;
            if (count >= requiredCount) {
              done();
            }
          }
        },
      ) ?? null;

      if (unsubscribeInputAction === null) {
        done();
        return;
      }
    });
  }

  // -------------------------------------------------------------------------
  // Mobile touch button highlighting (raised above overlay)
  // -------------------------------------------------------------------------

  private startMobileButtonHighlight(hint: TutorialMobileHint): () => void {
    if (!this.isMobile || hint === null) return () => {};

    const buttonAttr = hint === "fire" ? "B" : "A";
    const selector = `#touchZones .touch-zone[data-slot="0"][data-button="${buttonAttr}"]`;
    const container = document.getElementById("touchZones");

    const applyHighlight = (): void => {
      // Elevate the whole container so individual zones can appear above the
      // tutorial overlay (z-500). Per-child z-index is trapped by parent stacking.
      container?.classList.add("demo-touch-elevated");
      const zones = document.querySelectorAll<HTMLElement>(selector);
      zones.forEach((zone) => {
        zone.classList.add("demo-left-highlight", "demo-tutorial-above");
      });
    };
    const clearHighlight = (): void => {
      container?.classList.remove("demo-touch-elevated");
      const zones = document.querySelectorAll<HTMLElement>(selector);
      zones.forEach((zone) => {
        zone.classList.remove("demo-left-highlight", "demo-tutorial-above");
      });
    };

    applyHighlight();
    const poll = window.setInterval(applyHighlight, 150);

    return (): void => {
      window.clearInterval(poll);
      clearHighlight();
    };
  }

  /**
   * Smoothly interpolates the camera zoom from `from` to `to` over `durationMs`.
   * Uses ease-out cubic so the zoom-out feels natural and cinematic.
   */
  private tweenZoom(from: number, to: number, durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      const startMs = performance.now();
      const tick = (): void => {
        const elapsed = performance.now() - startMs;
        const t = Math.min(elapsed / durationMs, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - t, 3);
        this.callbacks?.setZoom(from + (to - from) * eased);
        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

