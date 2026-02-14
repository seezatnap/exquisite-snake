# Tasks

## Test Infrastructure

- [A] (#1) Extend existing Vitest test harness in `src/__tests__/` with deterministic timer controls, reusable snake/ghost path fixtures, and assertion helpers for ghost position, fade state, collision game-over signal, food-burst events, and snapshot/restore hook invocation to support all echo ghost validation scenarios [5 pts]

## Echo Ghost Replay Timing

- [ ] (#2) Add automated validation in `src/__tests__/` that the ghost trail replays a known snake path at exactly +5,000 ms delay (step-by-step coordinate parity against the original path with fake timers) [5 pts] (blocked by #1)
- [ ] (#3) Add automated validation in `src/__tests__/` that delayed cosmetic food burst effects fire exactly 5 seconds after food consumption and at the ghost’s delayed replay position, not the live snake position [5 pts] (blocked by #1)

## Echo Ghost Lifecycle & Collision

- [ ] (#4) Add automated validation in `src/__tests__/` that when replay history is fully consumed, the ghost stops replaying and transitions through fade-out/completion behavior with no extra movement frames [5 pts] (blocked by #1)
- [ ] (#5) Add automated validation in `src/__tests__/` that ghost contact causes fatal game-over through the same self-collision pathway (shared reducer/action/result parity) used for normal snake self-collisions [5 pts] (blocked by #1)

## Rewind Hooks & Test Plan Artifacts

- [ ] (#6) Add automated checks in `src/__tests__/` confirming rewind snapshot/restore hooks are present and callable with stable behavior, and create/update a test plan artifact mapping all five required scenarios to setup, expected results, and execution steps for team validation [5 pts] (blocked by #2, #3, #4, #5)
