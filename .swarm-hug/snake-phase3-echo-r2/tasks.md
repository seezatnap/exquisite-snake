# Tasks

## Echo Ghost Core

- [x] (#1) Create `src/game/entities/EchoGhost.ts` to record the active snake path each tick into a bounded circular buffer, replay the path as a delayed (5-second) ghost trail, and support automatic stop/fade when playback consumes buffered history so it never grows indefinitely [5 pts] (A)

## Gameplay Integration

- [x] (#2) Integrate `EchoGhost` into the game runtime lifecycle (spawn, per-tick update, reset/restart cleanup) and feed current snake positions into the ghost buffer on each tick [5 pts] (blocked by #1) (A)
- [x] (#3) Add echo ghost collision checks to the existing collision pipeline so contact with the ghost is treated as self-collision/game-over using the same failure path and side effects [5 pts] (blocked by #1, #2) (A)
- [x] (#4) Implement delayed ghost-food burst behavior: when food is eaten, queue a cosmetic burst at the corresponding ghost path position exactly 5 seconds later, including handling if the target history sample is unavailable [5 pts] (blocked by #1, #2) (A)

## Rendering & Visuals

- [x] (#5) Implement ghost visual rendering with a dashed outline, 40% opacity, and trailing particle effects; ensure the ghost is tinted to match the active biome at render time [5 pts] (blocked by #1, #2) (B)

## Rewind Support & Safety

- [x] (#6) Add a rewind-ready interface/hook for `EchoGhost` buffer state (snapshot/restore hooks and integration points) so Phase 6 rewind can rewind ghost history without implementing rewind timing in this phase [5 pts] (blocked by #1, #2) (B)
- [A] (#7) Add validation coverage and test plan artifacts for key echo ghost behavior: 5-second delay accuracy, fade-out/replay completion, collision fatality parity, delayed burst timing, and rewind hook availability [5 pts] (blocked by #1, #2, #3, #4, #5, #6)

## Follow-up tasks (from sprint review)
- [A] (#8) Fix delayed ghost-food burst targeting when food is eaten on a Void Rift gravity-nudge step: capture the eat-position before the nudge so the 5-second burst appears at the consumed cell, and add a regression test for this scenario.
