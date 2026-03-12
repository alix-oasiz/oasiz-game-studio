# Space Force Random Input Lag - Deep Findings Log

Date: 2026-03-02
Scope: Fresh pass excluding previously discussed extrapolation/sync-interval angles.
Method: Append findings immediately when identified.

---
## Finding 1 - Local Dev Haptic Warning Storm (High)
- Time found: 2026-03-02
- Area: input feedback + SDK bridge fallback
- Evidence:
  - Input press feedback fires on every press: `src/feedback/inputFeedback.ts` -> `SettingsManager.triggerHaptic(...)`.
  - Bridge call path: `src/platform/oasizBridge.ts` -> `oasiz.triggerHaptic(type)`.
  - SDK fallback warns per call in local dev: `node_modules/@oasiz/sdk/dist/index.js` logs `console.warn` whenever `window.triggerHaptic` bridge is missing.
- Why this matches random lag:
  - During active play, key/touch presses can be frequent; each press emits a warning in local dev.
  - Console warnings are synchronous enough to intermittently hitch the main thread, especially when DevTools console is open or preserving logs.
- Impact:
  - Local mode appears "randomly laggy" despite no network, and online can worsen due additional workload.
- Suggested direction:
  - Gate platform haptic calls when bridge is unavailable (or only probe once and cache availability).
  - Avoid per-press bridge calls in local dev fallback mode.

## Finding 2 - Per-Tick Deep Snapshot Allocation Churn (High)
- Time found: 2026-03-02
- Area: shared simulation snapshot pipeline
- Evidence:
  - Every sim tick calls `hooks.onSnapshot(this.buildSnapshot())`: `shared/sim/SpaceForceSimulation.ts` (update loop).
  - `buildSimulationSnapshot(...)` recreates arrays/objects each tick for ships, pilots, projectiles, asteroids, powerups, mines, missiles, turret bullets: `shared/sim/modules/simulationSnapshot.ts`.
  - Asteroid payload includes full `vertices` arrays in snapshot path each tick (`vertices: asteroid.vertices`).
- Why this matches random lag:
  - Constant object churn causes periodic GC pauses rather than constant slowdown, perceived as random stutters/input delay.
  - Spikes grow with combat intensity/entity count (projectiles/asteroids/powerups), so lag appears intermittent and situational.
- Impact:
  - Affects local mode too (in-process transport still allocates snapshot objects).
  - Online mode likely worse due additional transport/parse overhead layered on top.
- Suggested direction:
  - Move to structural sharing / delta snapshots for stable entities.
  - Stop including asteroid vertices in the high-frequency snapshot channel (keep separate low-frequency collider channel only).

## Finding 3 - O(n^2) Pilot Debris Collision Pass During Bursts (Medium-High)
- Time found: 2026-03-02
- Area: render effects update path
- Evidence:
  - `RenderEffectsPilotDebrisLayer.update()` runs nested pair checks across debris pieces (`for i` x `for j`) with sqrt/impulse math each frame.
  - Debris is spawned in bursts on pilot death/kill (`spawnPilotDeathBurst`, `spawnPilotKillBurst`), then simulated for ~1s.
- Why this matches random lag:
  - Cost is not constant; it spikes only during/after specific combat events (kills/ejections).
  - These transient CPU bursts can delay frame processing, so input feels delayed only "sometimes."
- Impact:
  - More visible in chaotic rounds with frequent pilot deaths.
- Suggested direction:
  - Replace pairwise collision with grid/binning or disable inter-debris collision entirely for cosmetic debris.
  - Keep only wall bounce + drag for debris pieces.

## Finding 4 - Projectile Removal Path Is O(P^2) During Collision Bursts (High)
- Time found: 2026-03-02
- Area: simulation collision handling hot path
- Evidence:
  - `SpaceForceSimulation.createCollisionHandlersContext()` defines `removeProjectileEntity` as:
    - `this.removeProjectileBody(projectileId);`
    - `this.projectiles = this.projectiles.filter((proj) => proj.id !== projectileId);`
  - `checkSweptProjectileHitShipCollisions(...)` can call `removeProjectileEntity(...)` many times within one tick (wall hits, shield hits, ship hits) while iterating projectile entries.
- Why this matches random lag:
  - In high-fire moments, each projectile removal rescans the full projectile array, turning burst frames into O(P^2)-like work.
  - This is event-driven (combat bursts), so hitching appears random rather than constant.
- Impact:
  - Local mode can spike hard during clustered firefights; online mode layers network/render overhead on top.
- Suggested direction:
  - Switch to mark-and-sweep projectile deletion (collect IDs in a `Set`, apply one compaction pass per tick).
  - Keep body removal immediate, but defer array compaction to once-per-tick.
## Finding 5 - Unused Per-Tick Projectile Velocity Snapshot Allocation (Medium-High)
- Time found: 2026-03-02
- Area: simulation tick pre-collision capture path
- Evidence:
  - `SpaceForceSimulation.update()` allocates `previousProjectileVelocities = this.captureBodyVelocities(this.projectileBodies)` every tick.
  - `checkSweptProjectileHitShipCollisions(...)` receives this as `_previousProjectileVelocities` and never uses it.
- Why this matches random lag:
  - This creates an avoidable `Map` + per-projectile object allocation every tick.
  - GC pressure scales with live projectile count, so stutters appear intermittently during projectile-heavy moments.
- Impact:
  - Pure overhead in both local and online play paths.
- Suggested direction:
  - Remove velocity snapshot capture entirely (or consume it meaningfully if needed for future collision logic).
## Finding 6 - Swept Projectile Collision Performs Repeated Raycasts + Sorts Per Projectile (High)
- Time found: 2026-03-02
- Area: simulation collision broadphase/narrowphase
- Evidence:
  - `checkSweptProjectileHitShipCollisions(...)` iterates every projectile and for each one calls:
    - `queryOrderedShieldHitsAlongSegment(...)` (iterates ships + sorts hits), and
    - `queryOrderedShipBodiesAlongSegment(...)` (Matter ray query + dedupe map + sort by segment t).
  - This runs in the main tick path (`SpaceForceSimulation.update`) every PLAYING tick.
- Why this matches random lag:
  - Cost explodes during projectile bursts (many active projectiles in one frame), producing transient CPU spikes rather than constant slowdown.
  - Those spikes directly delay tick completion, which feels like occasional input lag.
- Impact:
  - Affects both local and online; online adds network processing on top.
- Suggested direction:
  - Introduce coarse prefiltering/spatial partitioning before ray queries.
  - Cap swept checks per tick or degrade to simpler checks when projectile count crosses a threshold.
## Finding 7 - Local Sim Uses `setInterval` Without Catch-Up/Clock Correction (Medium-High)
- Time found: 2026-03-02
- Area: local transport simulation scheduler
- Evidence:
  - `LocalSharedSimTransport.createRoom()` drives simulation with:
    - `setInterval(() => simulation.update(TICK_DURATION_MS), TICK_DURATION_MS)`.
  - Tick progression is fixed-step per callback and does not account for real elapsed time when callbacks are delayed.
- Why this matches random lag:
  - Browser timer jitter and occasional main-thread stalls delay callbacks unpredictably.
  - Because missed time is not caught up, sim responsiveness temporarily drops (inputs wait longer for the next sim tick), perceived as random input lag.
- Impact:
  - Primarily visible in local mode; online mode has its own host scheduler, but this still hurts local baseline feel.
- Suggested direction:
  - Replace interval scheduling with an accumulator driven by `performance.now()` (or RAF-driven fixed-step runner), including bounded catch-up steps.
## Finding 8 - Online Server Re-Clones Snapshot Per Client During Fanout (Medium-High, Online)
- Time found: 2026-03-02
- Area: server snapshot broadcast path
- Evidence:
  - `SpaceForceRoom.broadcastSnapshotToClients(...)` loops all clients and calls `sendSnapshotToClient(client, snapshot)`.
  - `sendSnapshotToClient` calls `client.send("evt:snapshot", this.stripAsteroidVertices(snapshot))`.
  - `stripAsteroidVertices(...)` rebuilds a new snapshot object and maps all asteroids (`{ ...asteroid, vertices: [] }`) on every call.
- Why this matches random lag:
  - In online rooms, this clone work scales with `clients x asteroids x snapshot rate`.
  - Under combat-heavy asteroid counts, server-side GC/CPU spikes can delay outbound snapshot timing, appearing as intermittent input/response lag client-side.
- Impact:
  - Primarily online-mode scalability/rate stability issue; local mode unaffected.
- Suggested direction:
  - Build one pre-stripped snapshot per sim tick and reuse it for all clients in that fanout cycle.
## Finding 9 - Asteroid Halftone Cache Key Rebuild Allocates Large Strings Every Draw (Medium)
- Time found: 2026-03-02
- Area: asteroid render path
- Evidence:
  - `EntityVisualsRenderer.drawAsteroid(...)` calls `getAsteroidHalftoneEntry(state)` for every asteroid every frame.
  - `getAsteroidHalftoneEntry` always computes `signature = getAsteroidHalftoneSignature(state)` first.
  - `getAsteroidHalftoneSignature` builds a string by mapping all vertices with `toFixed(...)` and joining them.
- Why this matches random lag:
  - This is high-allocation string work in the render loop, scaling with asteroid count/vertex count.
  - As asteroid populations fluctuate during gameplay, GC pressure creates intermittent stutters rather than constant slowdown.
- Impact:
  - Visible in both local and online rendering paths.
- Suggested direction:
  - Precompute and store a stable asteroid visual signature/hash at asteroid creation time.
  - Avoid per-frame vertex-to-string conversions.
## Finding 10 - Hot Tick Rebuilds Heavy Context Objects/Bound Closures Each Frame (Medium)
- Time found: 2026-03-02
- Area: simulation orchestration allocations
- Evidence:
  - `SpaceForceSimulation.update()` recreates tick-scoped context objects repeatedly:
    - `createCollisionHandlersContext()` (includes multiple `.bind(...)` functions and inline closures),
    - `createMapFeaturesContext()` via `applyMapFeatureForcesToBodies()` and `applyMapFeatureKinematics()`.
  - These contexts are rebuilt every PLAYING tick instead of reused.
- Why this matches random lag:
  - Constant closure/object allocation on the main sim path increases GC pressure.
  - GC pauses manifest intermittently, so lag feels random even when average FPS seems fine.
- Impact:
  - Affects both local and online simulation paths.
- Suggested direction:
  - Reuse stable context objects where possible and avoid per-tick `.bind(...)` / inline closure creation.
  - Keep only truly tick-variant fields mutable.
## Finding 11 - Map Feature Force Application Scales With Dynamic Entity Bursts (Medium-High)
- Time found: 2026-03-02
- Area: per-tick map force systems
- Evidence:
  - `applyCenterHoleForcesToBodies(...)` and `applyRepulsionForcesToBodies(...)` loop across ships, pilots, asteroids, projectiles, and turret bullets for each map feature.
  - Each iteration performs distance math (`Math.sqrt`, normalization) and `Body.applyForce(...)`.
  - Called every PLAYING tick from `SpaceForceSimulation.update()`.
- Why this matches random lag:
  - Cost rises sharply when projectile/bullet counts spike, but only on maps with active center holes/repulsion zones.
  - This creates situational, intermittent hitches (map- and combat-intensity-dependent).
- Impact:
  - Both local and online modes; more pronounced in chaotic projectile moments.
- Suggested direction:
  - Early-cull by cheap AABB/radius buckets before sqrt/force application.
  - Optionally skip map-force evaluation for very short-lived entities when counts exceed a threshold.

---
## Branch Validation - `space-force-dev-observed-next` (Server/Sim Focus)
- Time found: 2026-03-02
- Scope: `HEAD..space-force-dev-observed-next` diff + direct file checks.

### Finding 12 - Finding 8 Confirmed Fixed on Target Branch (High Value)
- Time found: 2026-03-02
- Area: server snapshot fanout (`server/src/rooms/SpaceForceRoom.ts`)
- Evidence:
  - Target branch now precomputes once per broadcast:
    - `this.prepareColliderCache(snapshot);`
    - `const strippedSnapshot = this.stripAsteroidVertices(snapshot);`
  - Fanout reuses `strippedSnapshot` via `sendPreparedSnapshotToClient(...)` instead of re-stripping per client.
- Result:
  - **Finding 8 is fixed** on `space-force-dev-observed-next`.

### Finding 13 - Finding 1 Likely Fixed on Target Branch (Local Dev Haptics)
- Time found: 2026-03-02
- Area: platform haptic bridge calls (`src/SettingsManager.ts`, `src/ui/haptics.ts`)
- Evidence:
  - Target branch removes `platform/oasizBridge.ts` usage for haptics.
  - Haptic calls are now guarded by direct bridge presence checks:
    - only call `window.triggerHaptic(...)` when function exists.
- Result:
  - **Finding 1 is likely fixed** for local-dev warning storm behavior.

### Finding 14 - Findings 2/4/5/6/7/10/11 Not Fixed on Target Branch
- Time found: 2026-03-02
- Area: sim tick/collision/scheduler hot paths
- Evidence:
  - `SpaceForceSimulation` still captures unused `previousProjectileVelocities`.
  - `createCollisionHandlersContext` still removes projectile via `this.projectiles = this.projectiles.filter(...)`.
  - `checkSweptProjectileHitShipCollisions(...)` path unchanged (ray queries + sorting per projectile).
  - `LocalSharedSimTransport` still uses fixed `setInterval(... update(TICK_DURATION_MS) ...)` with no elapsed-time catch-up.
  - Snapshot build path still allocates full per-tick payload arrays/objects.
  - Map force systems still execute per-feature/per-entity force loops each tick.
- Result:
  - **Findings 2, 4, 5, 6, 7, 10, and 11 remain open** on `space-force-dev-observed-next`.

### Finding 15 - Findings 3 and 9 Not Fixed on Target Branch
- Time found: 2026-03-02
- Area: render hot paths
- Evidence:
  - No target-branch changes detected for:
    - `src/systems/rendering/effects/RenderEffectsPilotDebrisLayer.ts`
    - `src/systems/rendering/layers/EntityVisualsRenderer.ts`
- Result:
  - **Findings 3 and 9 remain open** on `space-force-dev-observed-next`.

### Finding 16 - Additional Sim Cleanup Improvement Present on Target Branch
- Time found: 2026-03-02
- Area: collision-group lifecycle (`shared/sim/physics/Physics.ts`, `SpaceForceSimulation.ts`)
- Evidence:
  - Adds `Physics.releasePlayerCollisionGroup(playerId)`.
  - Calls release on player removal (`removePlayer(...)`).
- Why it matters:
  - Prevents unbounded player collision-group map growth over long sessions/rejoins.
- Result:
  - Not the primary random-lag root cause, but a valid long-session stability/perf cleanup.

---
## Debounce / Safeguard Conflict Audit

### Finding 17 - No Evidence of Debounce "Pile-Up" in Active Match Input Path
- Time found: 2026-03-02
- Area: gameplay input vs UI tap guards
- Evidence:
  - Debounce/tap-guard code is confined to UI flows (`ui/lobby.ts`, `ui/advancedSettings.ts`, `ui/screens.ts`, demo overlay), not ship control input handlers.
  - Match input paths in `systems/input/*` do not rely on these UI tap-guard maps.
- Result:
  - Current safeguards are **unlikely** to be the source of random in-match control lag.

### Finding 18 - Listener Accumulation Risk Not Observed for Guarded Buttons
- Time found: 2026-03-02
- Area: event binding lifecycle
- Evidence:
  - `create*UI` and `bindEndScreenUI` are instantiated once in `main.ts` init flow.
  - Guard state uses scalar timers or `WeakMap<EventTarget, number>`, which do not stack per tap.
- Result:
  - No direct evidence of accumulating debounce handlers causing compounding delays.

### Finding 19 - Target Branch Introduces Start-Screen Concurrency Risk (Separate From Pile-Up)
- Time found: 2026-03-02
- Area: `ui/startScreen.ts` on `space-force-dev-observed-next`
- Evidence:
  - Removes global `startActionInFlight`/`setStartActionLock`.
  - Only the clicked button is disabled; other start actions can still be triggered while async room action is pending.
- Why it matters:
  - Can cause overlapping room create/join actions and state races, which may look like intermittent UI/network weirdness (not gameplay frame lag).
- Result:
  - Not debounce pile-up, but a new conflict vector worth guarding.
