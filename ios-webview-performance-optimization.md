# iOS WebView Performance Optimization

Practical lessons learned from optimizing HTML5 canvas games running inside iOS WebView (WKWebView) and Android WebView iframes. These patterns apply broadly to any interactive web content embedded in native apps.

---

## 1. Use Web Audio API Instead of HTMLAudioElement for SFX

**Problem:** `HTMLAudioElement.currentTime = 0` is a **synchronous** operation on iOS WebView. The audio decoder must seek back to the start of the file before returning control to JavaScript. When called on every dot-connect, coin pickup, or rapid-fire interaction, this blocks the main thread for 2-10ms per call — enough to cause visible input lag.

**Fix — Web Audio API with pre-decoded buffers:**
Decode audio files once into `AudioBuffer` objects, then play them via `AudioBufferSourceNode.start()` which is non-blocking and can overlap multiple instances without seeking.

```typescript
let audioCtx: AudioContext | null = null;
let popBuffer: AudioBuffer | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

async function loadAudioBuffer(url: string): Promise<AudioBuffer | null> {
  try {
    const ctx = getAudioContext();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuffer);
  } catch (err) {
    return null;
  }
}

function playSfx(buffer: AudioBuffer | null, volume: number): void {
  if (!buffer || !audioCtx) return;
  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  gain.gain.value = volume;
  source.buffer = buffer;
  source.connect(gain);
  gain.connect(audioCtx.destination);
  source.start(0);
}

// Initialize on first user gesture (required by autoplay policy)
document.addEventListener("pointerdown", () => {
  getAudioContext();
  void loadAudioBuffer(popUrl).then(b => { popBuffer = b; });
}, { once: true, passive: true });
```

**When to use:** All short SFX (pops, taps, impacts, pickups). Keep `HTMLAudioElement` only for background music that needs loop/pause/resume.

**Why this matters:** `AudioBufferSourceNode.start()` is fire-and-forget with zero main-thread blocking. Multiple sounds can overlap without contention. This is the single highest-impact optimization for perceived input lag in iOS WebView games.

---

## 2. Haptic Feedback + Audio = Double Frame Stall

**Problem:** Calling `window.triggerHaptic()` synchronously in the same frame as audio playback causes a compounded delay. The native bridge call (via `postMessage` to React Native or WKWebView) blocks the JS thread while the audio system is also busy.

**Fix — Defer Haptics with `setTimeout(fn, 0)`:**
Push the haptic call to the next microtask so it doesn't compete with audio on the same frame.

```typescript
private triggerHaptic(type: string): void {
  if (typeof (window as any).triggerHaptic === "function") {
    setTimeout(() => (window as any).triggerHaptic(type), 0);
  }
}
```

**Key insight:** The user won't perceive a 1-frame delay in vibration, but they will perceive a frame drop in animation.

---

## 3. `localStorage.setItem()` Is Synchronous and Expensive

**Problem:** `localStorage.setItem()` is a synchronous I/O operation. On iOS WebView it can take 1-5ms per call. If triggered on every coin pickup or score change during gameplay, it causes visible frame drops.

**Fix — Dirty Flag + Deferred Flush:**
Update in-memory state immediately but defer the actual `localStorage` write to safe transition points (level complete, game over, pause, exit to menu).

```typescript
private coinSaveDirty = false;

private addCoins(amount: number): void {
  this.coinBank += amount;
  this.coinSaveDirty = true;
}

private flushCoinSave(): void {
  if (!this.coinSaveDirty) return;
  localStorage.setItem("coins", String(this.coinBank));
  this.coinSaveDirty = false;
}
```

**Rule of thumb:** Never call `localStorage` inside a game loop or collision handler. Batch writes to state transitions.

---

## 4. `getBoundingClientRect()` Forces Synchronous Layout Reflow

**Problem:** Calling `getBoundingClientRect()` on every pointer event or every frame forces the browser to recalculate layout synchronously. On iOS WebView this is especially expensive because the layout engine is shared with the native shell. In input handlers, this adds measurable latency between touch and response.

**Fix — Cache rect values, invalidate on resize only:**

```typescript
let canvasRect = canvas.getBoundingClientRect();

function resizeCanvas(): void {
  // ... resize logic ...
  canvasRect = canvas.getBoundingClientRect();
}

function handlePointerDown(e: PointerEvent): void {
  const x = e.clientX - canvasRect.left;
  const y = e.clientY - canvasRect.top;
  // ...
}
```

**For `pointermove` specifically**, use `e.offsetX` / `e.offsetY` which are pre-computed by the browser relative to the target element, eliminating `getBoundingClientRect()` entirely from the hottest input path:

```typescript
function handlePointerMove(e: PointerEvent): void {
  const x = e.offsetX;
  const y = e.offsetY;
  // ...
}
```

---

## 5. Touch Event Handling: `passive` Listeners and `touch-action` CSS

**Problem:** Non-passive `pointermove`/`touchmove` listeners that call `e.preventDefault()` force the iOS compositor to wait for JavaScript before scrolling/rendering. This introduces a ~100-300ms delay on touch input because the browser must determine whether the event will be cancelled.

**Fix — Use CSS `touch-action: none` + passive move listeners:**

```css
canvas {
  touch-action: none; /* Tells browser: no scroll/zoom on this element */
}
```

```typescript
// pointermove can be passive — CSS handles scroll prevention
canvas.addEventListener("pointermove", handlePointerMove, { passive: true });

// pointerdown/pointerup still need preventDefault for focus management
canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointerup", handlePointerUp);
```

**Why:** `touch-action: none` in CSS tells the compositor thread at the OS level that this element won't scroll or zoom. The compositor no longer needs to wait for JS to call `preventDefault()`, so touch events are dispatched immediately. This is the correct way to prevent scrolling on a game canvas — not `e.preventDefault()` in move handlers.

**Also remove duplicate touch event listeners.** If you're using `pointer` events, don't also add `touch` event listeners — they fire redundantly and double the work.

---

## 6. Canvas2D: Eliminate `clip()` Operations

**Problem:** `ctx.clip()` is one of the most expensive Canvas2D operations on iOS. It forces the GPU to create a clipping mask, and combined with `save()`/`restore()` it snapshots and restores the entire context state. A single `clip()` call can cost 0.5-2ms on mobile.

**Fix — Replace clip with geometry:**
If you're clipping to draw a highlight/shadow at the bottom of a rounded panel, just draw the highlight with matching corner radii instead:

```typescript
// BAD: expensive clip
renderCtx.save();
renderCtx.beginPath();
renderCtx.roundRect(x, y, width, height, radius);
renderCtx.clip();
renderCtx.fillStyle = "rgba(0,0,0,0.15)";
renderCtx.fillRect(x, y + height - 4, width, 4);
renderCtx.restore();

// GOOD: no clip needed
renderCtx.fillStyle = "#d5d5d6";
renderCtx.beginPath();
renderCtx.roundRect(x, y + height - 4, width, 4, [0, 0, radius, radius]);
renderCtx.fill();
```

**Rule:** If `clip()` is called more than once per frame, find a way to eliminate it. Most clipping can be replaced with careful geometry.

---

## 7. Canvas2D: Minimize `save()` / `restore()` Calls

**Problem:** `ctx.save()` and `ctx.restore()` snapshot and restore the **entire** canvas state (transform, clip, styles, compositing, etc.). On iOS WebView, each pair costs measurable time. When called per-item in a loop (per ripple, per particle, per button), the cost multiplies.

**Fix — Set and reset individual properties instead:**

```typescript
// BAD: save/restore per ripple
for (const ripple of ripples) {
  ctx.save();
  ctx.globalAlpha = ripple.alpha;
  ctx.fillStyle = colors[ripple.color];
  ctx.beginPath();
  ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// GOOD: set/reset globalAlpha once
for (const ripple of ripples) {
  ctx.globalAlpha = ripple.alpha;
  ctx.fillStyle = colors[ripple.color];
  ctx.beginPath();
  ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
  ctx.fill();
}
ctx.globalAlpha = 1;
```

**When `save()`/`restore()` IS needed:** Only when you must apply a transform (scale, rotate, translate) that can't be undone by setting a single property. Even then, guard it:

```typescript
const needsTransform = scale !== 1;
if (needsTransform) ctx.save();
// ... draw with transform ...
if (needsTransform) ctx.restore();
```

---

## 8. Canvas2D: Cache Font Strings

**Problem:** Setting `ctx.font` triggers font parsing in the browser engine. On iOS WebView, this is notably slow — each assignment parses the CSS font shorthand, resolves the font family, and updates internal state. With 10+ font assignments per frame across HUD panels, this adds up.

**Fix — Pre-compute font strings on resize, reuse from cache:**

```typescript
const cachedFonts = {
  hudLabel: "",
  hudValue: "",
  scoreText: "",
  // ...
};

function rebuildFontCache(): void {
  cachedFonts.hudLabel = `700 ${isMobile ? 8 : 9}px 'Nunito', sans-serif`;
  cachedFonts.hudValue = `500 ${isMobile ? 20 : 28}px 'Nunito', sans-serif`;
  cachedFonts.scoreText = `600 ${isMobile ? 22 : 26}px 'Nunito', sans-serif`;
}

// Call on resize
function resizeCanvas(): void {
  // ...
  rebuildFontCache();
}

// In render functions
renderCtx.font = cachedFonts.hudValue; // No string construction, no parsing overhead
```

**Also applies to:** `measureText()` — never call it in a render loop. Cache the result and recompute only on resize.

---

## 9. Canvas2D: Remove Shadows (`shadowBlur`)

**Problem:** Canvas `shadowBlur` is implemented as a Gaussian blur on the CPU. Even small blur values (2-4px) can cost 1-3ms per draw call on iOS. If applied to multiple elements per frame, it dominates the frame budget.

**Fix — Fake shadows with offset geometry:**

```typescript
// BAD: expensive GPU blur
ctx.shadowColor = "rgba(0,0,0,0.2)";
ctx.shadowBlur = 4;
ctx.shadowOffsetY = 2;
ctx.fillRect(x, y, w, h);

// GOOD: simple offset rectangle
ctx.fillStyle = "rgba(0,0,0,0.06)";
ctx.beginPath();
ctx.roundRect(x, y + 2, w, h, radius);
ctx.fill();

ctx.fillStyle = "#f0f0f1";
ctx.beginPath();
ctx.roundRect(x, y, w, h, radius);
ctx.fill();
```

**Rule:** Never use `shadowBlur` in a game render loop. The visual difference is imperceptible but the performance cost is massive.

---

## 10. Avoid Expensive Operations in Render/Game Loops

**Problem:** Certain operations that are cheap on desktop become frame-budget killers in iOS WebView when called every frame.

**Operations to move out of the game loop:**

| Operation | Cost on iOS WebView | Fix |
|---|---|---|
| `window.matchMedia()` | ~0.5ms | Cache on resize |
| `window.devicePixelRatio` | ~0.2ms | Cache on resize |
| `canvas.getBoundingClientRect()` | ~0.5-1ms | Cache on resize |
| `ctx.measureText()` | ~0.3ms | Cache on resize |
| `document.getElementById()` | ~0.1ms | Cache reference once |
| `element.style.width = ...` | Forces layout | Do on resize only |
| `Array.splice(i, 1)` in loops | O(n) shift | Swap-and-pop pattern |
| `array.some()` / `array.find()` | Closure allocation | Use counters/flags |

**Swap-and-pop pattern for O(1) array removal:**

```typescript
// BAD: O(n) per removal
for (let i = particles.length - 1; i >= 0; i--) {
  if (particles[i].dead) particles.splice(i, 1);
}

// GOOD: O(1) per removal
let i = particles.length;
while (i--) {
  if (particles[i].dead) {
    particles[i] = particles[particles.length - 1];
    particles.pop();
  }
}
```

---

## 11. Frame Skipping with Dirty Flags

**Problem:** Redrawing the full canvas every frame even when nothing has changed wastes battery and GPU cycles. On iOS WebView, unnecessary redraws compete with the native shell for GPU time.

**Fix — Only render when state changes:**

```typescript
let needsRedraw = true;

function markDirty(): void {
  needsRedraw = true;
}

function gameLoop(): void {
  const hasAnimations = particles.length > 0 || dotsAnimating;

  if (hasAnimations) {
    updateAnimations();
    needsRedraw = true;
  }

  if (needsRedraw) {
    render();
    needsRedraw = false;
  }

  requestAnimationFrame(gameLoop);
}

// Call markDirty() from: input handlers, resize, state changes
```

---

## 12. Font Loading: Preload Instead of @import

**Problem:** `@import url(...)` inside a `<style>` tag is render-blocking. The browser must download and parse the CSS file before rendering anything, adding 100-500ms to initial load on mobile networks.

**Fix — Use `<link>` tags with preconnect and preload:**

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap">
```

---

## 13. Invisible DOM Updates Are Wasted Work

**Problem:** Updating DOM elements (toggling classes, setting `textContent`, querying children) for UI panels that are currently hidden is pure waste. On iOS WebView, even hidden DOM mutations can trigger style recalculation.

**Fix — Early-Return Guard on Visibility:**

```typescript
private refreshShopUI(): void {
  if (!this.shopModal.classList.contains("visible")) return;
  // Expensive DOM operations only run when modal is open
}
```

---

## 14. `Math.random()` in Render Loops Causes Visual Flickering

**Problem:** Calling `Math.random()` inside `draw()` or `render()` functions produces different values every frame, causing visual elements to flicker or jitter.

**Fix — Pre-calculate random values at creation time:**

```typescript
interface Rock { variance: number; }
createRock(): Rock {
  return { variance: Math.random() * 0.2 };
}
```

---

## 15. `requestAnimationFrame` for Non-Critical DOM Updates

**Problem:** Updating HUD text (score, coin count) synchronously during collision handling adds to the frame budget at the worst possible time.

**Fix — Defer visual-only updates:**

```typescript
private addCoins(amount: number): void {
  this.coinBank += amount;
  requestAnimationFrame(() => this.updateScoreDisplay());
}
```

---

## Summary Checklist

| # | Optimization | Impact | Effort |
|---|---|---|---|
| 1 | Web Audio API for SFX (not HTMLAudioElement) | **Critical** | Medium |
| 2 | Defer haptics with `setTimeout(fn, 0)` | High | Trivial |
| 3 | Debounce `localStorage` writes | High | Low |
| 4 | Cache `getBoundingClientRect()`, use `offsetX`/`offsetY` | High | Low |
| 5 | `touch-action: none` CSS + passive move listeners | **Critical** | Trivial |
| 6 | Eliminate `clip()` from Canvas2D | High | Low |
| 7 | Minimize `save()`/`restore()` — set/reset directly | High | Low |
| 8 | Cache font strings, rebuild on resize | Medium | Low |
| 9 | Remove `shadowBlur` — use offset geometry | High | Low |
| 10 | Move expensive queries out of game loop | Medium | Low |
| 11 | Frame skipping with dirty flags | Medium | Low |
| 12 | Preload fonts instead of @import | Medium | Trivial |
| 13 | Guard invisible DOM updates | Medium | Trivial |
| 14 | Pre-calculate random values | Medium | Low |
| 15 | `requestAnimationFrame` for HUD updates | Low-Med | Trivial |

**General principle:** In a WebView, the JS thread shares resources with the native bridge, audio subsystem, and layout engine. Any synchronous call to these systems during a game frame is a potential frame drop. Defer, cache, pool, and guard.
