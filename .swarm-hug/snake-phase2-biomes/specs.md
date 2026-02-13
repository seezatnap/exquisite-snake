# Specifications: snake-phase2-biomes

# Phase 2 — Biome Shifting

## Overview

Add the Biome Shifting system to the existing core snake game. Every 45 seconds the arena transitions to one of four biomes, each with a distinct visual palette and unique gameplay mechanic.

## Prerequisites

- Phase 1 (core snake game) is complete and playable on `feature/snake-phase1-core`.

## Feature Specification

### Biome Definitions

| Biome | Visual | Mechanic |
|-------|--------|----------|
| **Neon City** | Cyberpunk grid, pink/cyan | Default — no modifier |
| **Ice Cavern** | Frost tiles, blue glow | Snake slides 2 extra tiles before stopping when turning (momentum) |
| **Molten Core** | Lava cracks, orange embers | Random lava pools spawn; touching one burns off 3 tail segments |
| **Void Rift** | Star-field, purple vortex | Gravity wells pull the snake toward the center of the arena |

### BiomeManager System

- Create `src/game/systems/BiomeManager.ts`
- Timer-based biome rotation every 45 seconds
- Biomes cycle in order: Neon City → Ice Cavern → Molten Core → Void Rift → repeat
- Track biome-visit stats for the Game Over screen

### Biome Transition Effects

- Radial-wipe or dissolve effect between biomes
- Subtle screen-shake on transition
- Palette/tilemap swap during transition

### Biome Mechanics

- **Ice Cavern:** When player turns, snake continues 2 extra tiles in the old direction before changing. Movement must remain predictable and fair.
- **Molten Core:** Lava pools spawn randomly on empty cells. Contact burns off 3 tail segments (or kills if snake is too short). Pools despawn when biome changes.
- **Void Rift:** A gravity well at the arena center exerts pull on the snake. The pull nudges movement toward center by 1 tile every few steps. Visual vortex at center.

### HUD Update

- Update the HUD biome indicator slot to show the current biome name and icon.

### Game Over Stats Update

- Add "biomes visited" to the Game Over stats display.

## Out of Scope

- Echo Ghost, Symbiotic Parasites, Dimensional Rift Portals, Temporal Rewind

