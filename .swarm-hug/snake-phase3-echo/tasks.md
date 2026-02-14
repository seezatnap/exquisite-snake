# Tasks

## Core Ghost Systems

- [x] (#1) Create `src/game/entities/EchoGhost.ts` with an `EchoGhost` entity that records the snake path each tick into a fixed-size circular buffer, supports 5-second replay delay derived from tick rate, and exposes deterministic APIs for writing positions and reading the delayed ghost trail. [5 pts] (A)
- [x] (#2) Integrate the new ghost entity into game initialization and update lifecycle so each game tick appends the current snake state, tracks progression vs. replay, and starts ghost output after exactly 5 seconds without affecting existing movement/food logic. [5 pts] (blocked by #1) (A)
- [A] (#3) Implement ghost lifecycle management for bounded playback: when buffered history is exhausted, fade the ghost out cleanly and prevent indefinite extension/growth while still maintaining a rolling replay window. [5 pts] (blocked by #1, #2)

## Gameplay & Collision

- [ ] (#4) Add echo ghost to the central collision detection flow and treat any snake/ghost contact as a fatal self-collision-equivalent event, including reuse of existing game-over outcome handling. [5 pts] (blocked by #2, #3)
- [ ] (#5) Implement delayed ghost-food burst behavior: when the real snake eats food, schedule a cosmetic particle burst at the corresponding ghost position exactly 5 seconds later, with no impact on score/state except visuals. [5 pts] (blocked by #2, #3)

## Rendering & Biome

- [ ] (#6) Render the ghost as a distinct translucent hazard (40% opacity, dashed outline) with trailing particles, using current renderer systems and matching existing segment geometry. [5 pts] (blocked by #2, #3)
- [ ] (#7) Apply biome-aware tinting to ghost visuals so trail and particles are colored by the current biome while preserving opacity and dashed styling, including smooth transitions if the biome changes during replay. [5 pts] (blocked by #6)

## Rewind Preparation

- [A] (#8) Add a rewind-ready interface/hook on `EchoGhost` for future Phase 6 integration (e.g., buffer snapshot/rewind state API), and wire it to existing architecture without implementing rewind behavior now. [5 pts] (blocked by #1, #2)

## Testing

- [ ] (#9) Add automated tests for 5-second delay accuracy, ghost self-overlap kill behavior, fade-out and bounded buffer lifecycle, delayed food particle burst timing, and biome-tinted ghost rendering metadata. [5 pts] (blocked by #4, #5, #6, #7, #8)

## Follow-up tasks (from sprint review)
- [x] (#10) Add unit tests for `EchoGhost.reset()` and constructor edge cases (zero/negative tick interval and delay) in `echo-ghost.test.ts` (blocked by #1) (A)
