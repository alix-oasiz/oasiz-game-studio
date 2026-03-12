# Space Force Learning Log

Durable implementation learnings to avoid repeating known mistakes.

## Usage Rules

- Append-only. Do not rewrite historical entries.
- Keep entries actionable and specific to a failed assumption or correction.
- When a learning becomes stable policy, mirror it into `AGENTS.md`.
- Link major learnings to matching `progress.md` milestones where relevant.

## Entry Template

```md
## YYYY-MM-DD - <short title>
- Context:
- Wrong assumption:
- Detection signal:
- Corrected approach:
- Guardrail:
- Related files:
```

## 2026-02-26 - Demo tutorial input path must reuse game pipeline

- Context:
  - Mobile demo tutorial progression was keyboard-only in practice.
- Wrong assumption:
  - Overlay-local touch/keyboard handlers were enough to drive tutorial action detection.
- Detection signal:
  - Touch did not advance tutorial/control handoff while gameplay touch zones existed.
  - Required behavior was only observed through keyboard path.
- Corrected approach:
  - Route tutorial action detection through canonical local input action callback path:
    - `Game.onLocalInputAction -> main.ts subscriber bridge -> DemoOverlayUI`.
  - Ensure overlays are non-blocking during try/control phases so touch zones receive input.
- Guardrail:
  - Do not add duplicate gameplay input detection in overlays when input pipeline callbacks already exist.
- Related files:
  - `src/Game.ts`
  - `src/main.ts`
  - `src/demo/DemoOverlayUI.ts`

## 2026-02-26 - Demo teardown must precede create/join transitions

- Context:
  - Entering create room/lobby caused transient jump patterns and unintended start-screen side effects.
- Wrong assumption:
  - It was safe to phase-hop while demo state was still partially active.
- Detection signal:
  - Visible transition from demo PLAYING -> START-like behavior -> lobby.
  - Intro/audio/UI effects briefly replayed out of scope.
- Corrected approach:
  - Perform explicit demo teardown before initiating create/join flow.
  - Keep suppress-next-start side effects scoped to teardown-for-action path.
- Guardrail:
  - For demo-to-action transitions, never patch around transient phases; teardown first, then transition.
- Related files:
  - `src/main.ts`
  - `src/demo/DemoController.ts`
  - `src/demo/DemoOverlayUI.ts`

## 2026-02-26 - Splash/logo/menu audio sequencing must be single-owner per cue

- Context:
  - Cue conflicts occurred between splash/logo/start BGM, including duplicate or conflicting trigger timing.
- Wrong assumption:
  - Multiple flow owners could safely trigger the same cue family with independent timing.
- Detection signal:
  - Perceived conflict where one cue masked another, and retriggers occurred across nearby transitions.
- Corrected approach:
  - Assign one owner per cue timeline segment and gate scene music starts around intro completion boundaries.
  - Cancel pending timers and clear conflicting cue paths when leaving scope.
- Guardrail:
  - For timeline-sensitive cues, keep single ownership and explicit cancellation/phase gates.
- Related files:
  - `src/main.ts`
  - `src/ui/startScreen.ts`
  - `src/AudioManager.ts`

## 2026-02-28 - Batch responsive layout work instead of iterative CSS patch chains

- Context:
  - Lobby/start screen responsiveness required many follow-up fixes across the same breakpoints.
- Wrong assumption:
  - Small incremental CSS tweaks would converge quickly without causing regressions in nearby viewport states.
- Detection signal:
  - Repeated same-day layout milestones on identical UI surfaces and recurring overflow/compression regressions.
- Corrected approach:
  - Do one ownership pass for layout math and breakpoint strategy first, then execute one coherent implementation slice.
  - Validate against fixed viewport matrix before moving to polish.
- Guardrail:
  - For responsive/UI-heavy tasks, do not ship repeated micro-patches without a unified layout model and test matrix.
- Related files:
  - `index.html`
  - `progress.md`

## 2026-02-28 - Coarse-pointer interactions need a shared debounce wrapper everywhere

- Context:
  - Duplicate mobile tap firing appeared in multiple places (lobby actions, debug panel controls, settings-adjacent buttons).
- Wrong assumption:
  - Per-component click handlers were sufficient and could be fixed ad hoc.
- Detection signal:
  - Single tap triggered two state flips/actions due synthetic click/touch event overlap.
- Corrected approach:
  - Standardize a reusable coarse-pointer tap guard with preventDefault/stopPropagation and cooldown timing.
- Guardrail:
  - Any new high-frequency mobile action button must use the shared tap-guard path by default.
- Related files:
  - `src/ui/lobby.ts`
  - `src/debug/debugPanel.ts`

## 2026-02-28 - Process tooling should be source-of-truth aware before becoming policy

- Context:
  - Governance hash drift checks were added, then rolled back when local-only tracking proved insufficient.
- Wrong assumption:
  - Local repository hash snapshots were a reliable proxy for upstream governance drift.
- Detection signal:
  - Tooling overhead increased while still missing the intended upstream/main-tracking requirement.
- Corrected approach:
  - Run a viability test against the real authority path (upstream/default branch or maintainer-managed source) before codifying workflow.
- Guardrail:
  - Do not harden process automation into AGENTS policy unless it validates against actual source-of-truth boundaries.
- Related files:
  - `AGENTS.md`
  - `README.md`
  - `progress.md`

## 2026-02-28 - Lock loadtest objective before choosing transport path

- Context:
  - Loadtest flow switched between matchmaking parity and direct Colyseus join paths to satisfy different goals.
- Wrong assumption:
  - A single loadtest connection path can optimize both gameplay-path fidelity and loadtest panel observability.
- Detection signal:
  - Repeated toggles in runner connection strategy and follow-up fixes for NOT_FOUND/visibility behavior.
- Corrected approach:
  - Define test intent first per runner:
    - parity runner follows real client matchmaking flow,
    - observability runner may use direct Colyseus APIs for panel counters.
- Guardrail:
  - Every loadtest runner must declare its primary objective in docs and avoid mixed-purpose path changes.
- Related files:
  - `server/loadtest/*.ts`
  - `server/README.md`
  - `progress.md`

## 2026-02-28 - Learning promotion sweep into policy guardrails

- Context:
  - Multiple repeat issues were already captured, but policy-level guidance needed stronger concrete rules to prevent recurrence.
- Wrong assumption:
  - Keeping learnings only in `.agents/learning.md` was enough to change day-to-day implementation behavior.
- Detection signal:
  - Recurring patterns continued across responsive UI passes, tap handling, and tooling/loadtest flow decisions.
- Corrected approach:
  - Promote stable cross-task learnings directly into `AGENTS.md` as enforceable guardrails.
  - Keep `learning.md` focused on assumption/failure context and promotion decisions.
- Guardrail:
  - Run periodic learning-promotion sweeps; when a learning repeats, convert it into explicit AGENTS policy language with action verbs.
- Promoted now:
  - shared coarse-pointer tap guard usage
  - coherent responsive planning before CSS micro-iterations
  - source-of-truth validation before policy automation
  - explicit loadtest objective declaration (parity vs observability)
- Related files:
  - `AGENTS.md`
  - `progress.md`

## 2026-03-02 - Progress tracking must preserve interruption recoverability

- Context:
  - `progress.md` active section drifted into a closed-thread dump and lost quick visibility into truly in-flight work.
- Wrong assumption:
  - Updating progress mostly at start/end and leaving closed threads in `Active Task Threads` was still good enough for operational tracking.
- Detection signal:
  - `Active Task Threads` contained only closed items (18/18), `progress.md` exceeded 700 lines, and latest in-run activity was harder to recover than reading changed files directly.
- Corrected approach:
  - Keep `Active Task Threads` open-only with a single explicit placeholder when empty.
  - Record timestamped mid-run checkpoints at meaningful step boundaries for live recoverability.
  - Keep completed detail in one concise milestone entry with traceability mapping.
- Guardrail:
  - Never leave closed threads in `Active Task Threads`; condense when active visibility degrades, and include `progress -> learning -> AGENTS` plus architecture change/no-change note in cleanup milestones.
- Related files:
  - `progress.md`
  - `AGENTS.md`
  - `.agents/learning.md`

## 2026-03-02 - Render-effect experiments need budget and rollback gates

- Context:
  - Halftone implementation moved through multiple same-day pivots (selective post pass, refinement, correction, object-space pivot, cache rewrite, and eventual removal).
- Wrong assumption:
  - Visual-style iteration inside the main render path could proceed safely without an explicit perf budget and rollback discipline.
- Detection signal:
  - Rapid sequence of reversals and implementation swaps in rendering milestones while lag investigation remained active.
- Corrected approach:
  - Treat broad render effects as budgeted experiments:
    - define target cost up front,
    - keep a fast disable/revert path,
    - prefer object-local/precomputed treatment before frame-wide compositing.
- Guardrail:
  - Any new render-wide visual effect must declare budget target + rollback path before iterative tuning on default gameplay path.
- Related files:
  - `src/systems/rendering/GameRenderer.ts`
  - `src/systems/rendering/Renderer.ts`
  - `src/systems/rendering/layers/EntityVisualsRenderer.ts`
  - `.tools/docs/lag-findings-deep-pass.md`

## 2026-03-02 - Mode/flow refactors require immediate dead-path sweeps

- Context:
  - Follow-up milestones removed `FREEPLAY` remnants, hidden map id `6`, duplicate demo starfield initialization, and stale map visibility toggles after flow changes.
- Wrong assumption:
  - Leaving temporary compatibility branches and hidden IDs after refactors was low risk and could be cleaned later.
- Detection signal:
  - Repeated cleanup milestones were needed to remove stale branches and special cases across demo/start/map flow.
- Corrected approach:
  - Pair mode/flow refactors with a same-window dead-path sweep across runtime + docs to remove obsolete flags, IDs, and fallback initializers.
- Guardrail:
  - After any canonical flow/model change, run a required dead-path cleanup pass before considering the refactor complete.
- Related files:
  - `src/main.ts`
  - `src/demo/DemoController.ts`
  - `src/ui/screens.ts`
  - `shared/game/mapConfigs.ts`
  - `.tools/docs/GAME_MODES.md`

## 2026-03-02 - Intermittent lag triage must lock capture conditions first

- Context:
  - Random lag analysis required deep-pass findings and branch parity checks while runtime symptoms were intermittent.
- Wrong assumption:
  - Ad hoc observations were sufficient to prioritize fixes for non-deterministic lag.
- Detection signal:
  - Multiple plausible hotspots surfaced concurrently and confidence in root cause stayed low until findings were systematized.
- Corrected approach:
  - Start intermittent perf investigations with a fixed capture matrix (feature flags/tooling state/device mode), then attach each finding to a specific capture condition.
- Guardrail:
  - For random/intermittent lag reports, do not jump to mitigation first; lock reproducibility and capture conditions before ranking root-cause candidates.
- Related files:
  - `.tools/docs/lag-findings-deep-pass.md`
  - `progress.md`

## 2026-03-04 - Collision hot-path changes need deterministic harness coverage first

- Context:
  - Collision anti-tunneling work landed across several follow-up milestones (behavior fix, telemetry wiring, allocation gating, and module split).
- Wrong assumption:
  - Collision hot-path behavior could be safely evolved first and instrumented/validated later without added churn.
- Detection signal:
  - Multiple near-term follow-up milestones were needed to add deterministic verification and then remove avoidable telemetry allocations from gameplay-default paths.
- Corrected approach:
  - For shared simulation collision/scoring hot paths, establish deterministic scenario coverage first, then iterate behavior/perf/refactors against that baseline.
  - Keep telemetry opt-in and guard event object construction behind enabled callbacks/flags.
- Guardrail:
  - Do not merge collision/scoring hot-path rewrites without deterministic harness validation and explicit telemetry allocation gating for default runtime.
- Related files:
  - `shared/sim/modules/simulationCollisionHandlers.ts`
  - `shared/sim/modules/simulationSweptCollisions.ts`
  - `scripts/run-sim-collision-matrix.ts`
  - `progress.md`

## 2026-03-04 - User-intent lock must gate implementation when request is diagnosis-only

- Context:
  - Spotlight bug report requested verification/confirmation flow first, but implementation changes were applied before explicit user approval.
- Wrong assumption:
  - It was acceptable to move directly from diagnosis into code changes once a likely root cause was identified.
- Detection signal:
  - User repeatedly flagged that docs were not being followed in request context and that unrequested patches were being applied.
  - Rollback and progress-history correction were required to restore requested state and traceability.
- Corrected approach:
  - When user intent is diagnosis/check/confirm, lock session mode to read-only until the user explicitly says to implement.
  - Before any edit, restate AGENTS-relevant constraints for the specific request context and confirm scope boundary in-thread.
  - If scope is violated, stop changes, revert net code impact, and append explicit rollback + postmortem milestones.
- Guardrail:
  - Explicit diagnosis-only requests are a hard no-edit boundary; no code/doc mutation is allowed until the user issues a direct implementation command.
- Related files:
  - `AGENTS.md`
  - `progress.md`
  - `src/main.ts`

## 2026-03-11 - Session discipline: context bootstrap and progress close-out must be automatic

- Context:
  - Repeated across multiple sessions: progress.md not updated after task completion, Agents.md / .agents/learning.md / ARCHITECTURE.md not loaded before implementation, only typecheck run instead of full validation matrix.
- Wrong assumption:
  - These are reminders that the user will provide when needed. They are optional hygiene.
- Detection signal:
  - User having to say "progress md?" or "why do I have to keep telling you every time?" more than once.
  - Agents.md exists in the working directory root and was never read despite CLAUDE.md explicitly pointing to it.
- Corrected approach:
  - At session start: read `Agents.md`, `ARCHITECTURE.md`, `.agents/learning.md` before any implementation.
  - After every completed task (no exceptions, no matter how small): update `progress.md` milestone journal.
  - For runtime-impacting changes: run BOTH `bun run typecheck` AND `bun run build`, not just typecheck.
  - Do not wait for user to ask for progress update. It is a hard close-out requirement per Agents.md §Progress Log Contract.
- Guardrail:
  - Treat "update progress.md" as the final step of every task, same weight as typecheck. If skipped, the task is not done.
  - Treat reading `Agents.md` + `.agents/learning.md` as the first step of every session, not optional context.
- Related files:
  - `Agents.md`
  - `.agents/learning.md`
  - `progress.md`

## 2026-03-06 - Contract changes require a docs impact matrix, not progress-only logging

- Context:
  - Ship-skin sync work changed cross-runtime contracts and persistence ownership, while follow-up updates focused on `progress.md`.
- Wrong assumption:
  - Updating only `progress.md` was enough documentation coverage for the milestone.
- Detection signal:
  - User explicitly challenged missing doc updates and requested justification across architecture/readme scope.
- Corrected approach:
  - Run an explicit doc impact matrix whenever runtime contracts/ownership change:
    - `ARCHITECTURE.md` for ownership/boundaries
    - `server/README.md` for API/room command contract
    - `shared/README.md` for shared payload contract notes
    - `progress.md` milestone for traceability
- Guardrail:
  - Do not close a contract-changing milestone until architecture + affected readmes are updated (or explicitly justified as unchanged) and captured in one progress entry.
- Related files:
  - `ARCHITECTURE.md`
  - `server/README.md`
  - `shared/README.md`
  - `progress.md`
