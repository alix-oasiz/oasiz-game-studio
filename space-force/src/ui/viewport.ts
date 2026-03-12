import { Game } from "../Game";

export interface ViewportController {
  isMobile: boolean;
  updateViewportVars: () => void;
  subscribeViewportChange: (listener: () => void) => () => void;
}

function parsePx(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function createViewportController(game: Game): ViewportController {
  const isMobile = window.matchMedia("(pointer: coarse)").matches;
  const viewportChangeListeners = new Set<() => void>();
  let lastViewportSignature: string | null = null;

  function notifyViewportChange(): void {
    for (const listener of [...viewportChangeListeners]) {
      listener();
    }
  }

  function updateViewportVars(force = false): void {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const width = vv?.width ?? window.innerWidth;
    const height = vv?.height ?? window.innerHeight;
    const offsetX = vv?.offsetLeft ?? 0;
    const offsetY = vv?.offsetTop ?? 0;
    const roundedWidth = Math.round(width * 100) / 100;
    const roundedHeight = Math.round(height * 100) / 100;
    const roundedOffsetX = Math.round(offsetX * 100) / 100;
    const roundedOffsetY = Math.round(offsetY * 100) / 100;
    const signature =
      roundedWidth.toString() +
      "|" +
      roundedHeight.toString() +
      "|" +
      roundedOffsetX.toString() +
      "|" +
      roundedOffsetY.toString();
    if (!force && signature === lastViewportSignature) {
      return;
    }
    lastViewportSignature = signature;

    root.style.setProperty("--vw", width + "px");
    root.style.setProperty("--vh", height + "px");
    root.style.setProperty("--vv-offset-x", offsetX + "px");
    root.style.setProperty("--vv-offset-y", offsetY + "px");

    const styles = getComputedStyle(root);
    const safeTop = parsePx(styles.getPropertyValue("--safe-top"));
    const safeRight = parsePx(styles.getPropertyValue("--safe-right"));
    const safeBottom = parsePx(styles.getPropertyValue("--safe-bottom"));
    const safeLeft = parsePx(styles.getPropertyValue("--safe-left"));

    const isPortrait = height > width;
    const layoutWidth = isMobile && isPortrait ? height : width;
    const layoutHeight = isMobile && isPortrait ? width : height;
    root.style.setProperty("--layout-width", layoutWidth + "px");
    root.style.setProperty("--layout-height", layoutHeight + "px");
    let boxLeft = 0;
    let boxTop = 0;
    let boxRight = layoutWidth;
    let boxBottom = layoutHeight;

    if (isMobile && isPortrait) {
      const rotTop = safeLeft;
      const rotBottom = safeRight;
      const rotLeft = safeBottom;
      const rotRight = safeTop;
      boxLeft = rotLeft;
      boxTop = rotTop;
      boxRight = layoutWidth - rotRight;
      boxBottom = layoutHeight - rotBottom;
    } else {
      boxLeft = safeLeft;
      boxTop = safeTop;
      boxRight = layoutWidth - safeRight;
      boxBottom = layoutHeight - safeBottom;
    }

    const boxWidth = Math.max(0, boxRight - boxLeft);
    const boxHeight = Math.max(0, boxBottom - boxTop);
    root.style.setProperty("--box-left", boxLeft + "px");
    root.style.setProperty("--box-top", boxTop + "px");
    root.style.setProperty("--box-right", boxRight + "px");
    root.style.setProperty("--box-bottom", boxBottom + "px");
    root.style.setProperty("--box-width", boxWidth + "px");
    root.style.setProperty("--box-height", boxHeight + "px");

    const layoutMode = boxWidth < 720 ? "narrow" : "wide";
    root.dataset.layout = layoutMode;

    game.handleResize();
    notifyViewportChange();
  }

  updateViewportVars(true);

  window.addEventListener("resize", () => updateViewportVars(false));
  window.addEventListener("orientationchange", () => updateViewportVars(true));
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => updateViewportVars(false));
  }

  if (isMobile) {
    document.getElementById("rotateOverlay")?.remove();
  }

  return {
    isMobile,
    updateViewportVars,
    subscribeViewportChange: (listener: () => void): (() => void) => {
      viewportChangeListeners.add(listener);
      return (): void => {
        viewportChangeListeners.delete(listener);
      };
    },
  };
}

export async function tryLockOrientation(isMobile: boolean): Promise<void> {
  if (!isMobile) return;
  try {
    await (
      screen.orientation as unknown as { lock?: (mode: string) => void }
    )?.lock?.("landscape");
  } catch {
    // Orientation lock not supported or not allowed - CSS overlay handles this
  }
}
