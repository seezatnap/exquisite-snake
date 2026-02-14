# Specifications: snake-phase3-echo-r2

# Phase 3 — Echo Ghost

## Overview

Add the Echo Ghost system to the existing snake game (with biomes). The game records the snake's path and replays it as a translucent ghost on a 5-second delay. The player must avoid their own past.

## Prerequisites

- Phase 2 (Biome Shifting) is complete and working.

## Feature Specification

### EchoGhost Entity

- Create `src/game/entities/EchoGhost.ts`
- Records the snake's position each game tick into a circular buffer
- After a 5-second delay, a ghost snake replays the recorded path
- Ghost is visually distinct: dashed outline, 40% opacity, trailing particles
- Ghost fades out after replaying its buffered history (doesn't grow forever)

### Gameplay Interactions

- Colliding with the echo ghost kills the player (same as self-collision)
- When the real snake eats food, a cosmetic ghost-food particle burst appears at the ghost's corresponding position 5 seconds later
- The echo ghost respects biome visuals (tinted to match current biome)

### Integration Points

- Echo ghost collision check added to the main collision detection system
- Rewind (Phase 6) will need to also rewind the ghost buffer — leave a hook/interface for this but don't implement rewind interaction yet

### Game Over Stats Update

- No new stats needed for echo ghost (it's an always-on hazard)

## Out of Scope

- Symbiotic Parasites, Dimensional Rift Portals, Temporal Rewind

