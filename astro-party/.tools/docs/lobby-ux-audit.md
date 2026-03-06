# Lobby UX Audit — 2026-03-06

Snapshot analysis of the current lobby implementation after the pcard redesign.
Use this as the iteration backlog. Mark items `[done]` / `[wont-fix]` / `[deferred]` as we work through them.

---

## Current File State (at audit time)

- `index.html`: new lobby CSS scoped under `#lobbyScreen` + new HTML structure
- `src/ui/lobby.ts`: pcard generator, ship-skin cycling, session-mode indicator, delegated listeners

---

## Priority 0 — Foundational / Structural

### P0-A  Typography spaghetti: 6 font sizes on one screen  `[done]`
**What:** Six distinct `--fs-*` variables are all visible simultaneously in the lobby:

| Var | Value | Where used |
|---|---|---|
| `--fs-nano` | 0.5rem / ~8px | map-picker-desc, badge text |
| `--fs-micro` | 0.5625rem / ~9px | "Arena", "Mode", "P1" slot, room-tag "ROOM" label |
| `--fs-btn` | 0.75rem / ~12px | Buttons, logo, leave btn, session chips, launch btn |
| `--fs-badge` | 0.8125rem / ~13px | type-badge text |
| `--fs-body` | 0.875rem / ~14px | Map name, map desc, ruleset value, status text |
| `--fs-title` | 1.125rem / ~18px | Player names |

12px, 13px, and 14px are 1–2px apart — visually indistinguishable, creating noise instead of hierarchy. nano vs micro is an 8px vs 9px distinction — equally meaningless at render.

**The standard:** 3 sizes max in a single view. Hierarchy lives in weight, color, and opacity — not pixel-increment increments.

**Proposed consolidation to 3 tiers:**

| Tier | Size | Replaces | Usage |
|---|---|---|---|
| `--fs-label` | 0.5625rem / ~9px | nano + micro | Section headers, slot tags, decorative micro-text |
| `--fs-ui` | 0.75rem / ~12px | btn + badge + body | All interactive + secondary text: buttons, values, status, desc |
| `--fs-display` | 1.125rem / ~18px | title | Player names only |

Sub-hierarchy within each tier carried by `font-weight` (400 vs 700) and color (`var(--text)` vs `var(--dim)` vs specific accent).

**Decision needed:** Are nano/micro or badge/body splits intentional for any specific element? Confirm before collapsing.

---

## Priority 1 — Visible to Users

### P1-A  Role/type label missing from cards  `[wont-fix]`
**What:** `PLAYER_ROLE` constant (`"Room Leader"`, `"AI Opponent"`, `"Remote Player"`, `"Local Player"`) exists in lobby.ts but `updateLobbyUI` no longer renders a `.card-role` div. Only signal is the 14px `meta-ident` icon in the top-left corner.
**Why it matters:** Online sessions with unfamiliar players have no legible callout distinguishing AI bots from human opponents.
**Fix:** Re-add a role/type text line under `.card-name` in the card-info block.

### P1-B  `map-desc` font size same as `map-title`  `[done]`
**What:** Both `.map-title` and `.map-desc` use `var(--fs-body)` (0.875rem). `.map-desc` already has `var(--dim)` color but the size creates no hierarchy.
**Fix:** Drop `.map-desc` to `var(--fs-btn)` (0.75rem) or `var(--fs-micro)` (0.5625rem). One-line CSS change.

### P1-C  Self-card footer is minimal and confusing  `[open]`
**What:** The skin-cycle button sits alone in the footer, right-aligned (`justify-content: flex-end`). No "You" label, no role callout. Other cards render an invisible `card-footer-spacer` — footer height is inconsistent between self and others.
**Fix:** Add a "You" or role text label to the left side of the footer for self-card. Re-examine footer justify.

---

## Priority 2 — Polish / Feel

### P2-A  All 4 float + ring-pulse animations always running  `[done]`
**What:** `lb-float` (4.5s) × 4 + `lb-ring-pulse` (3.8s) × 4 = 8 concurrent CSS animations in the lobby at all times. With the lobby potentially open for minutes waiting for players, this is unnecessary on mobile.
**Fix options:**
- Stagger with `animation-delay` per card (1.1s apart) so they phase-offset rather than sync
- Only run on `:hover` + pause otherwise via `animation-play-state`
- Keep full animation but reduce to float-only and skip ring-pulse on non-hovered cards

### P2-B  `updateLobbyUI` innerHTML reset restarts ship animations  `[open]`
**What:** Every player join/leave triggers a full innerHTML replace of `.card-tray`. The float animation restarts from frame 0 for each card — visible jank when someone joins.
**Note:** This is a structural issue. A real fix requires keyed DOM diffing or stable card elements. May be accepted as-is given lobby frequency. Flag for decision.

### P2-C  Empty card state is visually weak  `[done]`
**What:** Empty slots have flat `#060b16` background — visually identical to the body background. No dashed border, no pulse, nothing to signal interactability. Add-AI/Local buttons are centered in the scene but lack visual framing.
**Fix:** Dashed or low-opacity border on `pcard--empty`, subtle background differentiation, maybe a very faint pulse on the `empty-icon`.

### P2-D  Non-host ctrl-strip has no affordance for locked controls  `[done]`
**What:** When `host-locked` is applied, buttons go 50% opacity. Non-host users see dimmed controls with no explanation. No tooltip on mobile.
**Fix:** Add a small lock icon or "host only" micro-label to the mode section head when the user is not the leader.

### P2-E  `card-info` horizontal padding too large on narrow cards  `[done]`
**What:** `card-info` has `padding: 1.125rem 1.5rem 1.25rem`. At 480px viewport each card is ~120px. 1.5rem × 2 ≈ 40px = only ~80px for the player name before ellipsis kicks in.
**Fix:** Reduce to `1rem` horizontal padding, or use a clamp. Measure against iPhone SE landscape (568px × 320px).

---

## Priority 3 — Edge Cases / Technical Debt

### P3-A  Session indicator absolute-center can overlap room tag  `[wont-fix]`
No real-world landscape device narrow enough to cause this collision.

### P3-B  `card-ship-wrap` rotation applied to all ship assets  `[wont-fix]`
All ship skins are drawn facing right — the -16deg rotation is a consistent intentional pose across all assets.

### P3-C  Hidden `modeCycleBtn` has live Standard/Sane/Chaos handler  `[deferred]`
**What:** `modeCycleBtn` is `display:none` but its click handler still cycles Standard/Sane/Chaos. Will stay dormant until Advanced Settings panel is built. No action needed now — just track so it's not forgotten.
**Planned resolution:** Wire `modeCycleBtn` into the Advanced Settings physics panel when that work starts.

---

## Decisions Needed from User

| # | Question |
|---|---|
| D1 | P1-A (role label): one line below name, or small badge, or tooltip-only? |
| D2 | P2-A (animation count): stagger? pause on idle? or accept as-is? |
| D3 | P2-B (innerHTML jank): accept? or invest in keyed diff? |
| D4 | P3-B (rotation): move to fallback-only? or keep current? |

---

## Items Confirmed / Explained by User

_Populate as we iterate._

---

## Done Log

_Move completed items here with brief resolution note._

### P0-A — Typography spaghetti `[done]`
Consolidated 6 `--fs-*` variables to 3 tiers: `--fs-label` (0.5625rem), `--fs-ui` (0.75rem), `--fs-display` (1.125rem). All 20 usage sites updated. Sub-hierarchy now carried by font-weight and color only.

### P1-B — map-desc font size `[done]`
Dropped `.map-desc` from `--fs-ui` to `--fs-label` (0.5625rem). Map title stays `--fs-ui` — clear size step between title and description.

### P1-A — role label `[wont-fix]`
Icons in the metadata rail are the intentional identifier surface. Role text was deliberately removed in the metadata rail cleanup milestone.

### P2-A — animation count `[done]`
Float: staggered per card slot (0s / 1.1s / 2.2s / 3.3s delay). Ring-pulse: moved to hover-only on `.pcard--filled`. Idle animation count drops to 4 floats (phased) with 0 ring-pulses.

### P2-C — empty card state `[done]`
Added `lb-blink 2.8s` animation to `.empty-icon`. No border/background change — flat panel is intentional.

### P2-D — host-locked buttons react on click `[done]`
Added `pointer-events: none` to all `.host-locked` lobby button rules. No hover/active state fires. Status label communicates wait; no lock icon needed.

### P1-C — self-card footer `[done]`
Skin-cycle action moved to footer as an in-flow `.card-skin-btn` pill (absolute viewport placement was invisible due to stacking context — `.card-info` at z:6 paints over `.card-scene` at z:1 regardless of child z-index). All cards now have consistent footer height. Button extended to local player cards too (see Local Player Skin Cycling below).

### P2-B — innerHTML animation restart `[done]`
Replaced full-tray `innerHTML` reset with keyed DOM: 4 persistent `.pcard` elements always in the tray. `updateLobbyUI` does per-slot targeted updates. Ship skin changes patch only `.card-ship-wrap` inner HTML — the wrap element and its float animation are never destroyed. Full redraw only on slot transition (empty↔filled) which is the expected/acceptable restart moment.

### P2-E — card-info horizontal padding `[done]`
Reduced from `1.5rem` to `1rem` side padding on `.card-info`. At 568px viewport this frees ~13px per side, giving ~93px for player name instead of ~80px.

### Animation rotation jump `[done]`
`lb-float` keyframes updated to include `translateY(4%) rotate(-16deg)` at 0%/100% and `translateY(calc(4% - 0.4375rem)) rotate(-16deg)` at 50%. Previously the animation overrode the base transform at keyframe start, stripping rotation and causing a visible snap for stagger-delayed cards.

### P3-A — session pill overlap `[wont-fix]`
No real landscape device narrow enough to cause collision.

### P3-B — ship-wrap rotation on skin assets `[wont-fix]`
All skins face right consistently — -16deg rotation is an intentional pose applied uniformly.

### Font size floor bump `[done]`
Raised `--fs-label` from 0.5625rem to 0.7rem (9.1px–11.2px) and `--fs-ui` from 0.75rem to 0.9rem (11.7px–14.4px). `--fs-display` unchanged. Both were below legible minimum at narrow landscape.

### Local player skin cycling `[done]`
Host can now cycle ship skins for local player slots (not AI bots). `cycleMyShipSkin()` generalized to `cycleShipSkinForPlayer(playerId, isSelf)`. Self path: saves preference + debounced server sync. Local player path: sets visual override only (no sync needed in local session). Click handler guard: allows self always, local player only if current player is host. Footer for local player cards shows both skin-cycle pill and Remove button side-by-side in `.card-footer-actions`.
