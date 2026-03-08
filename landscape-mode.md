# Landscape Mode Implementation Guide

Learnings from debugging forced landscape mode in iOS webviews.

## Problem: Game Appears Clipped with Black Borders

When forcing landscape mode on a portrait mobile device (by rotating the game container 90°), the gameplay may appear clipped with black bars on all sides, even though:
- The start screen appears fullscreen
- Touch input works in the "black bar" areas

## Root Cause: Pixel Art Integer Upscaling

If the game uses pixel art mode with an offscreen render canvas, the issue is likely in the **upscaling logic**, not container sizing.

### The Problematic Pattern

```typescript
// Integer upscale for crisp pixels - BUT this leaves gaps!
const scale = Math.max(1, Math.floor(Math.min(
  canvas.width / renderCanvas.width,
  canvas.height / renderCanvas.height
)));
const dstW = renderCanvas.width * scale;
const dstH = renderCanvas.height * scale;
const ox = Math.floor((canvas.width - dstW) * 0.5);
const oy = Math.floor((canvas.height - dstH) * 0.5);
ctx.drawImage(renderCanvas, 0, 0, srcW, srcH, ox, oy, dstW, dstH);
```

**Why it fails:**
- `Math.floor()` truncates the scale factor to an integer
- The resulting destination size (`dstW`, `dstH`) is smaller than the canvas
- The image is centered, creating black borders on all sides

**Example math:**
- `renderScale` = 0.42, `dpr` = 2
- Integer scale = `floor(2 / 0.42)` = `floor(4.76)` = 4
- Destination = `viewW * 0.42 * 4` = `viewW * 1.68`
- Canvas = `viewW * 2`
- **Gap = 16% on each side**

### The Fix

Fill the entire canvas instead of using integer scaling:

```typescript
ctx.imageSmoothingEnabled = false; // Preserves pixel art look
ctx.drawImage(renderCanvas, 0, 0, canvas.width, canvas.height);
```

The `imageSmoothingEnabled = false` ensures the upscaling still produces crisp, blocky pixels rather than blurry interpolation.

## Why Start Screen Appeared Fullscreen

The start screen is typically an **HTML overlay** (`position: absolute; inset: 0`), not canvas-rendered. HTML elements fill their container naturally via CSS, bypassing the pixel art upscaling logic entirely.

## Debugging Tips

1. **Touch test**: If touch input works in the "clipped" black areas, the container/canvas DOM elements are correctly sized - the issue is in rendering, not sizing.

2. **Check for pixel art mode**: Look for offscreen render canvases and upscaling logic in the draw/render loop.

3. **Container sizing**: For forced landscape, use viewport dimensions (`window.innerWidth`/`innerHeight`) not physical screen dimensions (`screen.width`/`screen.height`) - the latter ignores platform UI overlays.

## Problem: Buttons Don't Work or Work Inconsistently

When forcing landscape mode via CSS rotation, buttons may:
- Appear in wrong positions (outside visible game area)
- Not respond to taps at all
- Work only when holding and releasing (not quick taps)
- Toggle on then immediately off

### Issue 1: Button Positioning in Rotated Container

When using `transform: rotate(90deg)` on the game container, CSS positioning becomes counter-intuitive because the coordinate system is rotated.

**Fix:** Add explicit positioning rules for the `.forcedLandscape` class:

```css
.forcedLandscape #pauseBtn {
    position: absolute;
    top: 60px;
    right: 20px;
    left: auto;
    bottom: auto;
}

.forcedLandscape #settingsBtn {
    position: absolute;
    top: 60px;
    right: 70px;
    left: auto;
    bottom: auto;
}
```

### Issue 2: Overlay Z-Index Problems

Pause/settings overlays may not appear when buttons are clicked because they're behind other elements in the rotated container.

**Fix:** Ensure overlays fill the container and have proper z-index:

```css
.forcedLandscape .overlay {
    position: absolute;
    inset: 0;
    z-index: 100;
}

.forcedLandscape #pauseOverlay {
    z-index: 101;
}
```

### Issue 3: Double-Fire (touchend + click) Causes Toggle to Open Then Close

**Root Cause:** On iOS webview with CSS-transformed containers (90° rotation), both `touchend` and `click` events fire when tapping a button. Even with `e.preventDefault()` on touchend, the click event still fires afterward.

**Symptoms:**
- Button works on "hold and release" but not on quick tap
- Debug logs show `toggleSettings isOpen=true willOpen=false` (panel thinks it's already open)
- Handler executes twice in rapid succession: first opens, second closes

**The Fix: Debounce Pattern**

Use a timestamp-based debounce to prevent the handler from executing more than once within 150ms:

```typescript
const addButtonHandler = (el: HTMLElement | null, handler: () => void) => {
  if (!el) return;
  let lastFire = 0;
  const DEBOUNCE_MS = 150;
  const debounced = () => {
    const now = Date.now();
    if (now - lastFire < DEBOUNCE_MS) return;
    lastFire = now;
    handler();
  };
  el.addEventListener("click", debounced);
  el.addEventListener("touchend", (e) => {
    e.preventDefault(); // Still helps in some cases
    debounced();
  }, { passive: false });
};
```

**Why this works:**
- First event (usually touchend) fires and executes the handler
- Second event (click) fires within 150ms and is blocked by the debounce
- Panel opens/closes only once per tap

### Issue 4: SVG Icons Intercepting Touch Events

If buttons contain SVG icons, touch events may target the SVG path instead of the button element.

**Fix:** Add `pointer-events: none` to SVG elements inside buttons:

```css
.iconBtn svg {
    width: 24px;
    height: 24px;
    fill: currentColor;
    pointer-events: none; /* Ensure touches go to button, not SVG path */
}
```

## Debugging Tips for Button Issues

1. **Use visual logging**: On iOS webview, `fetch` calls may not work for logging. Use an on-screen debug panel:
   ```html
   <div id="debugPanel" style="position:fixed;bottom:10px;left:10px;..."></div>
   <script>
     window.debugLog = function(msg) {
       const panel = document.getElementById('debugPanel');
       const line = document.createElement('div');
       line.textContent = msg;
       panel.appendChild(line);
     };
   </script>
   ```

2. **Log event flow**: Add logs to touchstart, touchend, click, and handler functions to trace exactly what fires.

3. **Check toggle state**: If a toggle button doesn't work, log `isOpen` value - if it's `true` when you expect `false`, the handler ran twice.

4. **Compare working vs broken buttons**: If pause button works but settings doesn't, they should have identical handler patterns.

## Related Code Locations (wave-mode)

- Pixel art config: `CONFIG.PIXEL_ART`, `CONFIG.PIXEL_RENDER_SCALE_MOBILE`
- Upscaling logic: End of `draw()` method
- Container rotation: `onResize()` method, `forceLandscape` branch
- Button handler helper: `addButtonHandler()` in `setupUI()` method
- Forced landscape CSS: `index.html` styles for `.forcedLandscape`
