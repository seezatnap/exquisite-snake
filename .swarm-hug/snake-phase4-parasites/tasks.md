# Tasks

## Foundations

- [x] (#1) Validate Phase 3 integration points (movement, collision, scoring, biome-change hooks, Echo Ghost behavior) and scaffold `src/game/entities/Parasite.ts` plus `src/game/systems/ParasiteManager.ts` with parasite types, shared state models, timers, and constants (max segments 3, magnet radius 2, magnet speed bonus 10%, splitter interval 10s) [5 pts] (A)
- [x] (#2) Implement parasite pickup spawning so pickups appear occasionally on random empty cells only, never overlap snake/food/obstacles, and use a render identity visually distinct from normal food [5 pts] (blocked by #1) (A)
- [x] (#3) Implement parasite pickup consumption to attach parasite segments to the snake, track active segments, enforce max-3 FIFO shedding when a 4th is eaten, and increment a run-level parasites-collected counter [5 pts] (blocked by #2) (A)

## Ability Mechanics

- [x] (#4) Implement Magnet behavior: each tick, detect food within 2-tile Manhattan distance of any magnet segment, pull food 1 tile closer per tick with valid-cell checks, and apply stacked +10% base speed per magnet segment [5 pts] (blocked by #3) (A)
- [x] (#5) Implement Shield behavior: on wall/self collision, consume one shield segment to absorb the hit and cancel game over, then enforce blocked-next-food logic where first contact does not consume and second contact does [5 pts] (blocked by #3) (A)
- [x] (#6) Implement Splitter score behavior so all score gains are multiplied by 1.5 while splitter is attached, across all existing score event paths [5 pts] (blocked by #3) (B)
- [x] (#7) Implement Splitter obstacle behavior: spawn a stationary obstacle every 10 seconds while splitter is attached, place only on random empty cells, persist obstacles until biome change or game over, and clear correctly on those events [5 pts] (blocked by #3) (B)

## Integration and Rendering

- [A] (#8) Integrate collision handling for parasite effects: splitter obstacles kill on contact, shield absorption resolves before game-over finalization, and collision ordering remains deterministic with existing wall/self checks [5 pts] (blocked by #5, #7)
- [x] (#9) Add parasite segment visuals on the snake with pulsing glow and tiny type icon overlays (Magnet/Shield/Splitter), ensuring proper layering with existing snake and ghost rendering [5 pts] (blocked by #3) (C)
- [A] (#10) Enforce Echo Ghost exclusions so ghost entities neither collide with parasite pickups/obstacles nor receive parasite-driven effects (magnet pull, shield absorb, splitter multiplier) [5 pts] (blocked by #4, #5, #6, #7)

## HUD and End Screen

- [B] (#11) Update HUD parasite inventory to display up to 3 active parasite icons with type indicators and live updates on attach/shed/break events, and add parasites-collected to Game Over stats output [5 pts] (blocked by #3, #9)

## Testing and QA

- [B] (#12) Add automated tests for ParasiteManager and ability rules: spawn-on-empty validation, FIFO cap behavior, magnet pull and speed stacking, shield absorb plus blocked-food state transitions, and splitter score multiplier [5 pts] (blocked by #4, #5, #6)
- [ ] (#13) Add integration/regression tests and QA checklist for splitter obstacle lifecycle and lethal collisions, Echo Ghost exclusion rules, HUD inventory updates, and Game Over parasites-collected display [5 pts] (blocked by #8, #10, #11)

## Follow-up tasks (from sprint review)
- [x] (#14) Integrate `ParasiteManager.spawnPickupIfDue` into `MainScene` so parasite pickups actually appear during active gameplay, using live snake/food/obstacle occupancy and clearing pickup state on run reset. (B)
- [x] (#15) Add a `MainScene` integration test that advances parasite timers and verifies spawned pickups are rendered and never placed on snake, food, or obstacle cells. (B)

## Follow-up tasks (from sprint review)
- [x] (#16) Complete runtime pickup consumption in `MainScene` by consuming when the snake head enters a pickup cell, removing the consumed pickup sprite, and applying inventory/FIFO plus parasites-collected updates from `ParasiteManager`. (C)
- [C] (#17) Update food respawn placement to exclude active parasite pickup cells (not just snake cells), and add regression coverage that food and parasite pickups never overlap after food is eaten.

## Follow-up tasks (from sprint review)
- [ ] (#18) Extend food respawn placement to exclude active splitter-obstacle and Molten Core lava cells (not just snake), and add a regression test that post-eat food respawns never land on hazard/obstacle tiles. (blocked by #17)
- [x] (#19) Update Molten Core lava spawn candidate filtering to exclude active parasite pickup and splitter-obstacle cells, and add integration coverage that lava and parasite entities never overlap. (C)
