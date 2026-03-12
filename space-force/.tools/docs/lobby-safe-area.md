# Lobby Safe-Area Reference

## CSS Variables (defined on `#lobbyScreen`)

```css
#lobbyScreen {
  --topbar-h:  3.625rem;   /* 58px — topbar height excluding safe-area-inset-top */
  --strip-h:   8.125rem;   /* 130px — ctrl-strip height excluding safe-area-inset-bottom */
  --side-pad:  clamp(40px, 8vw, 100px);
}
```

## Safe Area Integration

### Topbar (fixed to device top)
```css
#lobbyScreen .topbar {
  height: calc(var(--topbar-h) + env(safe-area-inset-top, 0px));
  padding-top: env(safe-area-inset-top, 0px);
  padding-left: max(1.75rem, env(safe-area-inset-left, 0px));
  padding-right: max(1.75rem, env(safe-area-inset-right, 0px));
}
#lobbyScreen .topbar-rail {
  height: calc(var(--topbar-h) + env(safe-area-inset-top, 0px));
}
```

### Ctrl-strip (fixed to device bottom)
```css
#lobbyScreen .ctrl-strip {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
#lobbyScreen .body {
  padding-bottom: calc(var(--strip-h) + env(safe-area-inset-bottom, 0px));
}
```

## Platform Overlay Budget

- Top HUD overlay: 60px from top (platform navigation)
- The topbar is 58px + safe-area-inset-top, placing lobby content below platform UI
- Leave button is in the topbar (not floating), so no manual positioning needed

## Room Code Visibility

```typescript
// Shown only when session is online AND not running inside platform runtime
const roomContainer = elements.roomCodeDisplay.closest(".room-tag") as HTMLElement | null;
const isLocal = game.getSessionMode() === "local";
roomContainer.style.display = isLocal || isPlatform ? "none" : "flex";
```
