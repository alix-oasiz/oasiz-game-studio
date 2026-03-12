# Deferred Substep Approach (Not Implemented Yet)

This note captures a deferred plan for physics substepping to further reduce tunneling.

## Goal

- Improve high-relative-speed collision reliability (especially dash-driven ship collisions)
  without permanently doubling full simulation cost.

## Recommended Scope

- Substep physics integration only.
- Keep authoritative game-logic tick at current `60Hz`.
- Do not run full `simulation.update(...)` multiple times per server interval.

## Why This Scope

- `SpaceForceRoom` currently calls `simulation.update(tickDurationMs)` per fixed tick and
  already supports catch-up substeps up to 8 under load.
- Running full simulation substeps would multiply:
  - all game systems
  - snapshot emission cadence
  - server broadcast load in `PLAYING`.
- Physics-only substeps contain cost to collision/integration while preserving current
  gameplay/state cadence.

## Integration Sketch

1. Extend `Physics.update(dtMs)` to support an optional substep count.
2. Compute an adaptive substep count (`1` or `2`) from current runtime conditions:
   - any active dash windows
   - high recent collision-miss risk signals
   - optional body-count guardrails.
3. Run `Engine.update(...)` in smaller slices when substeps are enabled.
4. Keep the rest of `SpaceForceSimulation.update(...)` single-pass.

## Guardrails

- Disable adaptive substep escalation when body count exceeds a safe threshold
  (e.g., asteroid-heavy sessions).
- Keep deterministic ordering stable (same collision hooks, same sync order).
- Add runtime counters before rollout:
  - substep-active tick ratio
  - sim update duration percentiles
  - collision/tunnel guard hit counts.

## Rollout Plan

1. Land instrumentation only.
2. Enable substeps behind a debug/runtime flag.
3. Validate on:
   - default 4-player local flow
   - server 4-player online flow
   - asteroid-heavy (`SPAWN`) stress conditions.
4. Promote to default only if frame/tick budgets remain stable.
