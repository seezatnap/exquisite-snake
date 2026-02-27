# Tasks

## Core Gameplay Systems

- [x] (#1) Audit Phase 1-3 movement, collision, board occupancy, and render extension points, then implement `src/game/entities/Portal.ts` with linked-pair IDs, lifecycle states, timers, and empty-cell placement helpers [5 pts] (A)
- [x] (#2) Implement `src/game/systems/PortalManager.ts` to spawn linked portal pairs on valid empty cells at randomized ~30-second intervals and collapse/despawn each pair 8 seconds after spawn [5 pts] (blocked by #1) (A)
- [x] (#3) Integrate `PortalManager` into the main game update flow so portal spawn, active, and collapse state changes are exposed in deterministic order to movement, collision, and rendering systems [5 pts] (blocked by #2) (A)

## Portal Traversal

- [x] (#4) Implement head traversal so when the snake head enters a portal cell it exits from the paired portal cell while preserving current direction and movement cadence [5 pts] (blocked by #3) (A)
- [x] (#5) Implement body threading logic so segments transit one-by-one through the linked portals with maintained segment order and smooth continuity [5 pts] (blocked by #4) (A)
- [x] (#6) Implement collapse-mid-transit handling so any remaining unthreaded segments are teleported instantly to the exit side with correct final ordering/positions [5 pts] (blocked by #5) (A)
- [x] (#7) Add emergency teleport safety handling: trigger flash VFX and disable collisions for ~0.5 seconds after forced teleport, then reliably restore collision checks [5 pts] (blocked by #6) (A)

## Visual Effects & Rendering

- [x] (#8) Build portal visuals with swirling vortex animation for both ends of each linked pair, including spawn/despawn animation hooks tied to portal lifecycle [5 pts] (blocked by #3) (A)
- [x] (#9) Implement nearby tile distortion around active portals using barrel shader or scale-effect fallback, with tunable radius/intensity and cleanup on collapse [5 pts] (blocked by #8) (A)
- [x] (#10) Implement split-snake rendering state during transit so the snake appears at both entry and exit sides while segments are still threading [5 pts] (blocked by #5, #8) (A)

## Mechanics Integration

- [x] (#11) Integrate portal traversal with biome mechanics (ice momentum, lava pools, gravity wells) so pre- and post-teleport movement/hazard behavior remains correct [5 pts] (blocked by #7) (A)
- [x] (#12) Enforce exclusions and invariants: echo ghost replays raw position history without using portals, and food plus food-related mechanics are never pulled/routed through portals [5 pts] (blocked by #11) (A)

## Testing & Validation

- [x] (#13) Add automated tests and a manual QA matrix covering spawn cadence, traversal, split rendering, collapse edge cases, temporary collision immunity, biome interactions, and ghost/food exclusions [5 pts] (blocked by #9, #10, #12) (A)
