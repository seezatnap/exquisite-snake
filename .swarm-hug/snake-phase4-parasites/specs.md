# Specifications: snake-phase4-parasites

# Phase 4 — Symbiotic Parasites

## Overview

Add the Symbiotic Parasite system. Special parasite pickups spawn occasionally and attach to the snake with unique abilities and drawbacks.

## Prerequisites

- Phase 3 (Echo Ghost) is complete and working.

## Feature Specification

### Parasite Types

| Parasite | Color | Benefit | Drawback |
|----------|-------|---------|----------|
| **Magnet** | Gold | Pulls nearby food toward the snake (2-tile radius) | Snake speed increases by 10% per magnet segment |
| **Shield** | Cyan | Absorbs one wall/self-collision (then breaks off) | Blocks the next food pickup (must eat twice) |
| **Splitter** | Green | Score multiplier ×1.5 while attached | Every 10 seconds it spawns a stationary obstacle on the board |

### ParasiteManager System

- Create `src/game/systems/ParasiteManager.ts`
- Create `src/game/entities/Parasite.ts`
- Parasite pickups spawn occasionally on empty cells (distinct visual from food)
- When eaten, a parasite segment attaches to the snake body
- Max 3 parasite segments at a time; oldest is shed (FIFO) when a 4th is eaten
- Parasite segments are visually distinct: pulsing glow, tiny icon overlay

### Parasite Behaviors

- **Magnet:** Each tick, check for food within 2-tile Manhattan distance of any magnet segment. Pull food 1 tile closer per tick. Stack: +10% base speed per magnet segment.
- **Shield:** On wall or self-collision, if a shield segment exists, absorb the hit (remove the shield segment, cancel game over). Also: the next food the snake touches is "blocked" — it doesn't get consumed on first contact, only on second.
- **Splitter:** While attached, all score gains are multiplied by 1.5. Every 10 seconds, place a stationary obstacle on a random empty cell. Obstacles persist until biome change or game over.

### HUD Update

- Populate the parasite inventory slots in the HUD (show up to 3 parasite icons with type indicators).

### Game Over Stats Update

- Add "parasites collected" to the Game Over stats display.

### Integration Points

- Shield interacts with collision system (absorb one hit)
- Splitter obstacles interact with collision system (snake dies on contact)
- Magnet interacts with food entity (pull toward snake)
- Echo ghost should NOT collide with parasites or be affected by them

## Out of Scope

- Dimensional Rift Portals, Temporal Rewind

