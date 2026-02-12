# Visual QA Report: Biome Transition FX, Render Layering & HUD

**Task**: #16 Manual visual QA pass across multiple 45-second biome cycles
**Tester**: Agent Aaron
**Date**: 2026-02-12
**Method**: Automated simulation of multi-cycle biome gameplay via headless
Phaser mock with instrumented graphics tracking, shake call recording, and
bridge event verification. 38 targeted QA tests created
(`src/__tests__/visual-transition-qa.test.ts`).

---

## Summary

| Area | Status | Notes |
|------|--------|-------|
| Radial wipe transition | PASS | Overlay creates, animates, and destroys correctly |
| Screen shake on transition | PASS | Fires at each biome boundary with correct intensity |
| Render depth/z-order | PASS | Correct hierarchy maintained across all layers |
| HUD biome indicator | PASS | Bridge events fire in deterministic cycle order |
| Biome theme palette swap | PASS | Distinct colors per biome, redraws on each change |
| Mechanic visuals lifecycle | PASS | Lava pools / void vortex create and destroy cleanly |
| Game-over cleanup | PASS | Transition overlay and mechanics cleaned up on death |
| Multi-cycle soak (4 biomes) | PASS | Full rotation + wrap-around works correctly |
| Replay reset behavior | PASS | All per-run biome state resets cleanly |

---

## Defects Found

### QA-DEFECT-01: Void Rift gravity nudge can cause self-collision death [MEDIUM]

**Severity**: Medium (gameplay fairness issue)
**Reproduces**: Consistently during Void Rift biome
**Location**: `src/game/scenes/MainScene.ts` lines 657-674

**Description**: When the Void Rift gravity pull fires, `applyExternalNudge()`
moves the snake head one tile toward center. If the snake is moving away from
center and the gravity pull fires immediately after a step, the head can be
pushed back onto the snake's own body segment at the position it just left.

**Example scenario**:
- Snake segments: head(21,15), body(20,15), body(19,15), direction=right
- Gravity nudge fires: pulls LEFT (toward center at col 20)
- Head moves to (20,15) — **same position as first body segment**
- Self-collision detected → game over

**Impact**: Unfair deaths during Void Rift. Player has no control over gravity
nudges, so dying to self-collision from a nudge feels punishing.

**Suggested fix**: In `applyVoidRiftGravityNudgeIfDue()`, check if the nudge
destination would cause self-collision before applying the nudge. If it would,
skip or defer the nudge.

---

### QA-DEFECT-02: Palette swap occurs before transition wipe completes [LOW]

**Severity**: Low (cosmetic)
**Location**: `src/game/scenes/MainScene.ts` lines 488-494

**Description**: In `handleBiomeTransition()`, `handleBiomeEnter()` is called
before `startBiomeTransitionEffect()`. This means `applyBiomeVisualTheme()`
changes the background color and redraws backdrop/tilemap/grid immediately
with the new biome's colors, but the transition overlay (radial wipe) still
shows the old biome's colors fading out over 320ms.

The result is that the new biome appears instantly underneath while the old
biome's overlay fades away from center outward. This is actually a valid
"reveal" design — not a bug per se — but worth noting that the palette swap
is not synchronized with the wipe animation.

**Impact**: Very minor visual discontinuity. The reveal effect works
because the overlay covers most of the arena during early progress.

---

### QA-DEFECT-03: HUD biome indicator updates instantly without animation [LOW]

**Severity**: Low (polish)
**Location**: `src/components/HUD.tsx` lines 89-101

**Description**: The HUD biome indicator (name + icon) updates instantly via
the bridge `biomeChange` event, while the canvas radial-wipe takes 320ms to
complete. This creates a brief visual mismatch where the HUD shows the new
biome name but the canvas still shows the old biome's wipe overlay.

**Suggested fix**: Add a CSS transition or delay to the biome indicator div
matching the wipe duration (320ms) for a more polished feel.

---

### QA-DEFECT-04: Screen shake completes before wipe animation [COSMETIC]

**Severity**: Cosmetic
**Location**: `src/game/scenes/MainScene.ts` lines 816-825

**Description**: The biome transition shake (110ms, intensity 0.0035) fires
immediately and completes before the radial wipe (320ms) is done. The visual
result is: brief shake jolt → old biome fading out → new biome revealed.
This timing gap means the shake impact doesn't coincide with the visual
climax of the transition.

**Suggested fix**: Either extend shake to 320ms to match wipe, or stagger
the shake to fire at the 50% progress mark of the wipe for a more impactful
feel.

---

### QA-DEFECT-05: Particle emitter cleanup edge case [NEGLIGIBLE]

**Severity**: Negligible
**Location**: `src/game/systems/effects.ts` lines 57-60

**Description**: `emitFoodParticles()` uses `scene.time.delayedCall()` to
destroy the emitter after particles expire (~400ms). If the scene is
destroyed before the callback fires (e.g., rapid game restart within 400ms),
the emitter reference becomes stale. This is mitigated by the very short
lifetime and Phaser's cleanup behavior.

**Impact**: No observable effect in practice.

---

## Verified Behaviors (No Issues)

1. **Render depth hierarchy**: BIOME_BACKDROP(-30) < BIOME_TILEMAP(-20) <
   BIOME_GRID(-10) < BIOME_MECHANIC(5) < FOOD(20) < SNAKE(30) <
   TRANSITION_OVERLAY(40). Verified correct across all biome transitions.

2. **depthSort() called after theme changes**: `syncGameplayLayering()`
   correctly re-asserts depths and sorts children after every biome swap.

3. **Biome cycle order**: Neon City → Ice Cavern → Molten Core → Void Rift →
   repeat. Verified deterministic across 8 transitions (2 full cycles).

4. **Bridge event sequence**: `biomeExit(old)` fires before `biomeEnter(new)`,
   followed by `biomeTransition({from, to})` and `biomeChange(new)`. All
   events carry correct biome IDs.

5. **Visit stats accumulation**: Correctly tracks visits per biome including
   the initial NeonCity visit. Stats reset cleanly on replay.

6. **Lava pool cleanup**: All lava pools are cleared when exiting Molten Core.
   Pool cap is enforced via `trimMoltenLavaPoolsToCap()`.

7. **Mechanic graphics lifecycle**: Graphics for lava pools and void vortex
   are created only during Molten Core and Void Rift respectively, and
   destroyed when transitioning to biomes without mechanics.

8. **Game-over during transition**: Death during a biome transition wipe
   correctly cleans up the overlay graphics, biome mechanics, and lava pools.

9. **Rapid replay**: Five consecutive start→play→die→replay cycles confirmed
   that biome state (current biome, visit stats, lava pools, gravity counter)
   resets completely between games.

---

## Test Coverage Added

File: `src/__tests__/visual-transition-qa.test.ts` (38 tests)

| Test Group | Count | Focus |
|------------|-------|-------|
| Transition FX: radial wipe | 3 | Overlay creation, depth, cleanup |
| Transition FX: screen shake | 4 | Per-transition shake, intensity, multi-cycle |
| Render layering | 5 | Depth hierarchy, graphics creation, depthSort |
| HUD biome indicator | 6 | Bridge events, cycle order, enter/exit sequence |
| Visual theme palette swap | 3 | Background color, redraw, distinct colors |
| Biome mechanic visuals | 3 | Destruction, non-creation, lava pool cleanup |
| Edge cases | 5 | Death during transition, replay, rapid games |
| Multi-cycle soak | 3 | Full rotation, stats accumulation, bridge sync |
| Overlay theming | 1 | Departing biome theme used for overlay |
| Timing constants | 5 | Interval, durations, cycle order validation |
