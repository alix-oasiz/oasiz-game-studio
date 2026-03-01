# AGENTS.md - Marble Madness Context Index

This file is an index/dispatcher for project conventions.
Do not duplicate detailed conventions here.

## Context Loading Policy
- Load only the convention file(s) needed for the current task.
- Do not load unrelated convention files to minimize context/token usage.
- Apply rules from the selected file as authoritative for that domain.

## Convention Files
- `PLATFORM_CONVENTIONS.md`
  - Load when the task involves platform layout, tile sequencing, slope/width transitions, gaps, wall-floor blending, camera pan semantics, or platform texture density.
- `OBSTACLE_CONVENTIONS.md`
  - Load when the task involves obstacle design, blockers, hazards, timing gates, trigger zones, obstacle difficulty tuning, or obstacle event logic.

## Naming Policy
- Use **platform** terminology in code/docs/prompts

## Build And Version Policy
- When a change is ready to test, always produce a new build before handoff.
- Before each test build, increment `const BUILD_VERSION = "x.y.z"` in `src/main.ts`.
- Do not reuse an old build number for a new testable change.
- Use `npm run build:versioned` for test builds so version bump + build happens consistently.
- For WSL/local testing where hot reload is unreliable, use `npm run build:versioned:serve` to build then restart Vite on `127.0.0.1:5173` in one command.
- If local dev shows stale behavior or an old build label, run `npm run dev:restart` to restart the Vite server cleanly.
