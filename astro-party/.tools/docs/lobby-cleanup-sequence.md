# Lobby Cleanup Sequence

## Goal
Clean up the redesigned lobby in staged passes with manual verification after each chunk.

## Ordered Plan
1. Base layout fixes:
- Restore topbar local/online mode indicator from the redesign mock.
- Keep the indicator non-clickable for now.
- Place it centered in the topbar.
- Wire it to current session mode so it reflects `local` vs `online`.

2. Local vs online behavior + host wiring:
- In online mode, hide local add options.
- In local mode, show local add options (when allowed by current room state).
- Recheck host vs non-host controls so leader-only actions are correctly locked:
  start, mode/ruleset change, advanced settings, map picker, add/kick/remove.

3. Touch debounce pass:
- Apply shared coarse-pointer debounce/guard behavior across lobby action controls.

4. Ship preview asset pass:
- Keep current simple ship visual as fallback.
- Render actual ship skin assets inside preview circle with proper scale/angle.

5. Validation/cleanup pass:
- Run typecheck/build.
- Remove any dead paths left from redesign migration.

## Manual Verification Gates
1. Online room:
- Topbar indicator shows `Online`.
- Local add options are not visible.

2. Local room:
- Topbar indicator shows `Local`.
- Local add options are visible on empty slots.

3. Host vs non-host:
- Non-host cannot trigger leader-only actions.
- Host can use leader-only actions.

4. Post-pass checks:
- `bun run typecheck`
- `bun run build`

## Current Status
- Completed in branch:
  - Base layout fixes (centered non-clickable mode indicator).
  - Local vs online behavior + host wiring cleanup.
  - Touch debounce pass for lobby actions.
  - Ship preview asset pass with fallback.
- Final cleanup check completed:
  - Removed temporary debug artifact used during ship-color diagnosis.
  - Re-ran `typecheck` and `build` successfully.
