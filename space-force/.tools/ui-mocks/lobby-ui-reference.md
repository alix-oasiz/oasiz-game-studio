# Space Force — Lobby UI Reference

**File:** `assets/lobby-design-claude-2 - redesign.html`
**Target device:** Landscape-only. Minimum 568px wide (iPhone SE landscape). No portrait support.
**Browser target:** Chrome 105+, Safari 16+, Firefox 110+.

---

## Scaling System

### Fluid root font-size
```css
html { font-size: clamp(13px, 1.8vw, 16px); }
```
| Viewport width | Root font-size |
|---|---|
| 568px (iPhone SE landscape) | 13px |
| 889px | 16px (cap) |
| > 889px | 16px (stays) |

All spatial values are in `rem` so the entire UI scales together via this single knob. No individual properties need fluid sizing.

### What intentionally stays `px` / `vw`
| Value | Location | Reason |
|---|---|---|
| `clamp(40px, 8vw, 100px)` | `--side-pad` | Viewport-proportional gutter; vw dominates, px floor/cap add no value as rem |
| `body::before/after` gradient stops | derived via `calc(var(--side-pad) + 20px)` | Auto-tracks `--side-pad` |
| `26px 26px` | dot grid `background-size` | Decorative, not layout |
| `1px` / `1.5px` / `2px` | all borders | Sub-pixel hairlines; antialiasing degrades at rem |
| `blur(10px)` / `blur(12px)` | `backdrop-filter` | Filter px, not layout |
| `clamp(13px, 1.8vw, 16px)` | `html font-size` | Root must be px |
| `<canvas width="110" height="74">` | map-thumb HTML attributes | Controls drawing buffer resolution, not display size |
| `clip-path: inset(0 0 0 -300px)` | P1 / P4 glow bleed | Arbitrary large bleed — "big enough" value |

---

## CSS Custom Properties (Design Tokens)

All tokens live in `:root`. Edit here to retheme the whole UI.

### Global palette
```css
--gold:    #d97706;       /* primary accent — host pip, launch btn, arena label */
--gold-lt: #f5a623;       /* lighter gold — button hover gradient */
--gold-dk: #92520a;       /* darker gold — reserved */
--bg:      #060b16;       /* page background */
--panel:   #0a1020;       /* elevated panels */
--panel2:  #0e1628;       /* double-elevated panels */
--border:  rgba(255,255,255,0.06);   /* subtle dividers */
--border2: rgba(255,255,255,0.11);   /* slightly bolder dividers */
--text:    #ccd6f0;       /* primary text */
--dim:     rgba(160,180,220,0.58);   /* secondary / dimmed text */
```

### Type scale
All font-sizes are `rem` and scale with the fluid root.

| Variable | rem value | px at 16px root | Usage |
|---|---|---|---|
| `--fs-nano`  | `0.5rem`    | 8px  | Demo bar labels, ultra-small badges |
| `--fs-micro` | `0.5625rem` | 9px  | Decorative section labels, map card text |
| `--fs-btn`   | `0.75rem`   | 12px | Buttons, interactive elements |
| `--fs-badge` | `0.8125rem` | 13px | Type badges, slot labels (P1–P4), host pip |
| `--fs-body`  | `0.875rem`  | 14px | Secondary body text, card role |
| `--fs-title` | `1.125rem`  | 18px | Card player name, key display values |

### Layout tokens
```css
--topbar-h:  3.625rem;              /* 58px — topbar height; drives topbar-rail spacer */
--strip-h:   8.125rem;              /* 130px — ctrl-strip height; body adds matching padding-bottom */
--side-pad:  clamp(40px, 8vw, 100px); /* card tray horizontal gutter */
```

### Per-card player color tokens
Set inline on each `.pcard` via JavaScript:
```html
<div class="pcard pcard--filled" style="--pc:#00e5ff; --pc-rgb:0,229,255">
```
- `--pc` — solid hex color; used for `drop-shadow`, `color`, direct fill
- `--pc-rgb` — raw `r,g,b` components (no `rgba()` wrapper); used wherever opacity varies: `rgba(var(--pc-rgb), 0.14)` etc.

CSS references `var(--pc)` and `rgba(var(--pc-rgb), alpha)` throughout card elements (glow, viewport ring, ring-pulse animation, type-badge "you" variant). The token pair is set once; all derived uses update automatically.

---

## Player Data — How to Change Colors / Names

### Data source (JS, ~line 903)
```js
const PLAYERS = [
  { color: '#00e5ff', name: 'Ace Striker'  },  // P1
  { color: '#ff2d9b', name: 'NovaBotX'     },  // P2
  { color: '#ffe500', name: 'StarChaser'   },  // P3
  { color: '#00ff88', name: 'CosmoRacer'   },  // P4
];
```
`hexToRgb(color)` derives the `--pc-rgb` string automatically — no parallel array to maintain.

**To change a player color:** edit `color` in `PLAYERS[i]`. Both `--pc` and `--pc-rgb` update automatically everywhere.

**To change a player name:** edit `name` in `PLAYERS[i]`.

### Other player data arrays
```js
const SLOTS = ['P1', 'P2', 'P3', 'P4'];       // slot labels, top-right of each card
const MODES = ['Standard', 'Sane', 'Chaotic']; // game mode cycle values

state.types = ['you','ai','online','ai'];       // per-slot type; drives badge + role text
```

### Badge types and their visual meaning
| Type key | Badge class | Color | Role text |
|---|---|---|---|
| `you`    | inline style (player color) | `--pc` | Room Leader |
| `ai`     | `tb--ai`     | purple `#a78bfa` | AI Opponent |
| `local`  | `tb--local`  | yellow `#fcd34d` | Local Player |
| `online` | `tb--online` | green `#6ee7b7`  | Remote Player |

---

## DOM Structure

```
.root (flex column, 100dvh)
  .topbar (fixed, z:10, h: --topbar-h)
    .logo
    .topbar-divider
    .session-group
    .room-tag
    .leave-btn
  .topbar-rail (height: --topbar-h, occupies flow space)
  .body (flex: 1, padding-bottom: --strip-h)
    .card-tray (flex row, padding: 0 --side-pad)
      .pcard × N
        .card-glow (abs, z:0)
        .card-slot (abs, z:6, top-right)
        .card-type (abs, z:6, top-left)
        .card-scene (flex:1, container-type:size)
          .card-viewport (width: min(13.125rem, 85cqw, 85cqh), aspect-ratio:1)
            .viewport-ring
            .viewport-inner
              .card-ship-svg
        .card-info (flex-shrink:0)
          .card-name
          .card-role
          .card-footer
            .host-pip  [if host]
            .card-act  [if canAct]
    .body-fade-bottom (abs, gradient overlay above ctrl-strip)

.ctrl-strip (fixed, bottom:0, z:8, h: --strip-h)
  .cs-map   (flex: 2 1 0, max-width: 26.25rem, min-width: 14rem)
  .cs-div
  .cs-mode  (flex: 1 1 0, max-width: 11.875rem, min-width: 9rem)
  .cs-div
  .cs-launch (flex: 1.5 1 0)

.modal-bg
.map-modal (width: min(47.5rem, calc(100vw - 3rem)))
  .modal-head
  .modal-grid (3-column grid of .mpcard)

.demo-bar (fixed, bottom: 0.6875rem, centered)
```

---

## Key Architectural Decisions

### Card viewport — CSS Container Queries
The ship circle is sized with a 3-way `min()`:
```css
width: min(13.125rem, 85cqw, 85cqh);
aspect-ratio: 1;
```
- `13.125rem` — absolute cap (210px at 16px root)
- `85cqw` — 85% of `.card-scene` container width
- `85cqh` — 85% of `.card-scene` container height

`cqw`/`cqh` are relative to `.card-scene` which has `container-type: size` and `flex: 1`. On short landscape devices or when many players are present (less vertical space per card), `cqh` wins and the circle shrinks to fit vertically — no JS required.

### Ctrl-strip — proportional flex layout
Columns use weighted grow/shrink (`flex: N 1 0`) rather than fixed basis so they compress proportionally at narrow viewports:

| Column | flex | max-width | min-width | Purpose |
|---|---|---|---|---|
| `.cs-map` | `2 1 0` | `26.25rem` | `14rem` | Map thumbnail needs most room |
| `.cs-mode` | `1 1 0` | `11.875rem` | `9rem` | Mode label + cycle button |
| `.cs-launch` | `1.5 1 0` | — | `0` | Launch button; shrinks last |

Launch button: `width: min(100%, 14.375rem)` — caps at natural size on wide sections, fills on narrow.

### Side-padding glow bleed (P1 / P4)
P1 and P4 cards use `clip-path` instead of `overflow: hidden` so their `.card-glow` can bleed into the side gutters:
```css
.pcard:first-child { overflow: visible; clip-path: inset(0 0 0 -300px); }
.pcard:last-child  { overflow: visible; clip-path: inset(0 -300px 0 0); }
```
Inner cards use default `overflow: hidden` to contain their glow.

### Modal responsive cap
```css
width: min(47.5rem, calc(100vw - 3rem));
```
Prevents the 760px modal from overflowing at 667px viewport width.
