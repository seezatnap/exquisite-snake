# Parasite Phase 4 Regression Checklist

**Task**: #13 Add integration/regression tests and QA checklist for splitter obstacle lifecycle and lethal collisions, Echo Ghost exclusion rules, HUD inventory updates, and Game Over parasites-collected display  
**Owner**: Agent Aaron  
**Date**: 2026-02-14

## Scope

This checklist validates the Phase 4 integration paths that cross gameplay scene logic, bridge synchronization, and React overlays:

1. Splitter obstacle lifecycle and lethal collisions
2. Echo Ghost exclusion rules for parasite systems
3. HUD parasite inventory live updates
4. Game Over parasites-collected stat display

## Automated Coverage Matrix

| ID | Behavior | Automated test(s) |
| --- | --- | --- |
| P4-REG-01 | Splitter obstacles spawn on cadence while attached and persist until biome-change/run-end cleanup | `src/__tests__/main-scene-parasite-hooks.test.ts` - `spawns splitter obstacles every 10 seconds while splitter is attached`; `src/__tests__/main-scene-parasite-hooks.test.ts` - `clears splitter obstacles on biome change and on run end` |
| P4-REG-02 | Splitter obstacle contact is lethal and shield does not absorb splitter-obstacle hits | `src/__tests__/main-scene-parasite-hooks.test.ts` - `kills the snake on splitter obstacle contact without consuming shield`; `src/__tests__/parasite-manager.test.ts` - `does not absorb collisions without shield segments or for unsupported kinds` |
| P4-REG-03 | Echo Ghost stays excluded from parasite pickup/obstacle collision paths and parasite side effects | `src/__tests__/parasite-manager.test.ts` - `enforces Echo Ghost exclusions in parasite hooks`; `src/__tests__/parasite-phase4-regression.test.tsx` - `keeps echo ghost excluded from parasite pickup/obstacle collisions` |
| P4-REG-04 | HUD inventory updates on parasite attach, FIFO shed, and shield break events | `src/__tests__/hud.test.tsx` - `updates parasite inventory when bridge emits activeParasitesChange`; `src/__tests__/main-scene-parasite-hooks.test.ts` - `updates bridge parasite inventory on FIFO shed when a 4th pickup is consumed`; `src/__tests__/main-scene-parasite-hooks.test.ts` - `updates bridge parasite inventory when shield breaks on collision`; `src/__tests__/parasite-phase4-regression.test.tsx` - `updates HUD parasite inventory on attach, FIFO shed, and shield break` |
| P4-REG-05 | Game Over shows run-level parasites-collected from real gameplay flow | `src/__tests__/game-over.test.tsx` - `displays parasites collected stat from bridge state`; `src/__tests__/game-over.test.tsx` - `updates parasites collected when bridge emits parasitesCollectedChange`; `src/__tests__/parasite-phase4-regression.test.tsx` - `shows run parasite total on Game Over after lethal splitter-obstacle collision` |

## Manual Validation Checklist

- Start a run, attach at least one Splitter parasite, and survive for 10+ seconds.
- Verify a splitter obstacle appears on an empty grid cell and remains present while playing.
- Confirm snake death occurs immediately on splitter-obstacle contact, even if a Shield parasite is attached.
- Trigger a biome transition and verify splitter obstacles clear from the board.
- Start a fresh run and verify previous-run splitter obstacles do not persist.
- Confirm Echo Ghost replay can overlap parasite pickup/obstacle positions without consuming pickups or altering obstacle state.
- Attach and shed parasites until FIFO behavior occurs, then confirm HUD inventory order updates oldest-to-newest correctly.
- Consume a Shield on wall/self collision and verify HUD inventory removes Shield immediately.
- End a run after collecting parasites and verify Game Over shows the correct `PARASITES COLLECTED` total.
- Start another run and verify HUD inventory and parasites-collected counter reset to empty/zero.

## Validation Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
