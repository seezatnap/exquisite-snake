# Parasite Integration Regression QA Checklist

**Task**: #13 Add integration/regression tests and QA checklist for splitter obstacle lifecycle/lethal collisions, Echo Ghost exclusion rules, HUD inventory updates, and Game Over parasites-collected display  
**Owner**: Agent Aaron  
**Date**: 2026-02-14

## Scope

1. Splitter obstacle lifecycle and lethal-collision behavior
2. Echo Ghost exclusion from parasite pickup/obstacle/effect interactions
3. HUD parasite inventory live updates
4. Game Over parasites-collected stat rendering/reactivity

## Automated Coverage Matrix

| ID | Requirement | Automated test(s) |
| --- | --- | --- |
| PAR-REG-01 | Splitter obstacles spawn on cadence and persist between safe ticks | `src/__tests__/main-scene.test.ts` - `spawns splitter obstacles every 10 seconds while splitter is attached`; `src/__tests__/main-scene.test.ts` - `keeps splitter obstacles alive across safe ticks and still kills on later contact` |
| PAR-REG-02 | Splitter obstacles clear at lifecycle boundaries (biome exit / run end) | `src/__tests__/main-scene.test.ts` - `clears splitter obstacles when a biome exits`; `src/__tests__/main-scene.test.ts` - `clears splitter obstacles when the run ends` |
| PAR-REG-03 | Splitter obstacles are lethal and shield cannot absorb them | `src/__tests__/main-scene.test.ts` - `ends the run when snake head touches a splitter obstacle`; `src/__tests__/main-scene.test.ts` - `does not let shield absorb splitter obstacle collisions` |
| PAR-REG-04 | Echo Ghost does not consume parasite pickups | `src/__tests__/main-scene.test.ts` - `does not consume parasite pickups when only echo ghost playback overlaps the pickup cell` |
| PAR-REG-05 | Echo Ghost does not collide with splitter obstacles | `src/__tests__/main-scene.test.ts` - `does not trigger splitter-obstacle collisions when only echo ghost playback overlaps the obstacle` |
| PAR-REG-06 | Echo Ghost does not receive parasite effects (magnet/shield/splitter) | `src/__tests__/parasite-manager.test.ts` - `keeps echo ghost excluded from parasite collisions and effects` |
| PAR-REG-07 | HUD inventory updates for attach/shed/break ordering | `src/__tests__/hud.test.tsx` - `reflects attach, FIFO shed, and break/removal inventory updates in slot order`; `src/__tests__/hud.test.tsx` - `updates parasite inventory when bridge emits parasiteInventoryChange` |
| PAR-REG-08 | Game Over shows and updates parasites-collected stat | `src/__tests__/game-over.test.tsx` - `displays parasites collected in the stats output`; `src/__tests__/game-over.test.tsx` - `updates parasites collected when bridge emits parasitesCollectedChange`; `src/__tests__/game-over.test.tsx` - `resets parasites-collected display when a new run reset emits zero` |

## Manual QA Checklist

- Start a run with a splitter segment attached and survive through at least two 10-second intervals; confirm stationary splitter obstacles appear and remain on board.
- Verify splitter obstacles are removed when a biome transition exits and when the run ends.
- Intentionally move snake head onto a splitter obstacle; confirm immediate game over.
- Repeat splitter-obstacle collision with an active shield segment; confirm shield is not consumed and collision is still fatal.
- Observe echo ghost playback crossing parasite pickup cells; confirm no pickup is consumed unless snake head enters the pickup cell.
- Observe echo ghost playback crossing splitter obstacle cells; confirm no collision/game-over side effect is triggered from ghost overlap alone.
- Trigger parasite inventory attach, FIFO shed, and shield-break style removals during gameplay; confirm HUD parasite slots update in order and reflect current active max-3 inventory.
- End a run after collecting parasites; confirm Game Over shows `PARASITES COLLECTED` with correct total.
- Start a new run and return to Game Over; confirm parasites-collected stat resets for the new run.

## Validation Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Latest Execution Result

- Date: 2026-02-14
- Status: PASS
- Notes: `npm run lint`, `npm run typecheck`, `npm test` (824 tests), and `npm run build` all completed successfully.
