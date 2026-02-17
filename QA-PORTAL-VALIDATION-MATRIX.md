# Phase 5 Portal Validation Matrix

**Task**: #13 Add automated tests and a manual QA matrix for Dimensional Rift Portals
**Owner**: Agent Aaron
**Date**: 2026-02-17

## Scope

This matrix covers the Phase 5 validation areas requested in task #13:

1. Spawn cadence
2. Portal traversal
3. Split rendering during traversal
4. Collapse edge cases
5. Temporary collision immunity
6. Biome interactions
7. Ghost and food exclusions

## Automated Coverage Matrix

| ID | Behavior | Automated test(s) |
| --- | --- | --- |
| PTL-VAL-01 | Spawn cadence | `src/__tests__/portal-manager.test.ts` - `uses a randomized default spawn interval near 30 seconds`; `spawns linked pairs on valid empty cells when the timer elapses`; `retries cadence after a blocked spawn and succeeds when cells become valid` |
| PTL-VAL-02 | Portal traversal | `src/__tests__/main-scene.test.ts` - `teleports the snake head to a paired portal exit when a step lands on an entry cell`; `preserves movement cadence by evaluating portal traversal only on stepped ticks` |
| PTL-VAL-03 | Split rendering | `src/__tests__/main-scene.test.ts` - `renders split-snake mirror positions on the entry side while threading is active`; `clears split-snake overlay drawing once portal threading completes` |
| PTL-VAL-04 | Collapse edge cases | `src/__tests__/main-scene.test.ts` - `force-completes remaining threaded segments when the portal collapses mid-transit`; `renders an emergency flash hook when collapse forces instant teleport completion`; `does not grant collision immunity when a portal collapses without active threading` |
| PTL-VAL-05 | Temporary collision immunity | `src/__tests__/main-scene.test.ts` - `temporarily disables collisions for ~0.5s after forced teleport, then restores them` |
| PTL-VAL-06 | Biome interactions | `src/__tests__/main-scene.test.ts` - `preserves Ice Cavern momentum turn delay across portal traversal`; `applies Molten Core lava hazards immediately after portal exit`; `applies Void Rift gravity from the post-teleport exit position`; `excludes active portal endpoints from Molten Core lava spawn candidates` |
| PTL-VAL-07 | Ghost/food exclusions | `src/__tests__/main-scene.test.ts` - `keeps food on the entry tile when snake traversal teleports through a portal`; `keeps food respawns off active portal endpoint cells`; `replays echo ghost history at recorded portal-exit cells without portal rerouting` |

## Manual QA Matrix

| ID | Area | Setup | Steps | Expected result |
| --- | --- | --- | --- | --- |
| PTL-MAN-01 | Spawn cadence | Start a fresh run and survive at least 70 seconds. | Observe portal appearances over time without pausing. | First linked pair appears around 30 seconds (within configured random window), collapses after ~8 seconds, and the next cadence cycle continues normally. |
| PTL-MAN-02 | Traversal continuity | Move toward an active portal with at least 3 body segments. | Enter one portal head-first and keep direction unchanged. | Head exits from linked portal, direction and movement cadence stay intact, and segment ordering remains consistent. |
| PTL-MAN-03 | Split rendering | Use a snake length of at least 4, then traverse an active portal. | Watch the entry and exit sides while body threads through. | Snake appears on both sides during threading, then split overlay clears immediately after traversal completes. |
| PTL-MAN-04 | Collapse edge behavior | Begin traversal with a longer snake while portal lifetime is nearly expired. | Trigger/observe collapse mid-transit. | Remaining segments snap to exit side instantly in correct order and emergency flash VFX appears at entry/exit anchors. |
| PTL-MAN-05 | Collision immunity window | Repeat PTL-MAN-04 near a hazard (wall or self-collision setup). | Observe collisions for ~0.5 seconds after forced completion, then continue for another step window. | Fatal collisions are ignored briefly right after forced teleport, then collision checks re-enable and hazards kill normally afterward. |
| PTL-MAN-06 | Biome interactions | Run portal traversals in Ice Cavern, Molten Core, and Void Rift (use `?biomeOrder=` override if needed). | Traverse portals in each biome and compare post-exit behavior. | Ice momentum delay persists, Molten hazards apply at exit tile immediately, and Void gravity applies using exit-side position. |
| PTL-MAN-07 | Ghost/food exclusions | Create conditions with active portals, food near entry cells, and delayed ghost playback. | Eat food and traverse portals; then observe ghost replay path and food respawn locations. | Food is never pulled through portal routing, food respawns avoid active endpoints, and echo ghost replays recorded raw positions without portal teleport rerouting. |

## Validation Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Latest Execution Result

- Date: 2026-02-17
- Status: PASS
- Notes: `npm run lint`, `npm run typecheck`, full `npm test` (31 files / 797 tests), and `npm run build` all completed successfully.
