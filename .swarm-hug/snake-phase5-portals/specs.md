# Specifications: snake-phase5-portals

# Phase 5 — Dimensional Rift Portals

## Overview

Add the Dimensional Rift Portal system. Pairs of linked portals appear at random intervals and teleport the snake across the board.

## Prerequisites

- Phases 1–3 are complete and merged to main. Phase 4 was skipped.

## Feature Specification

### PortalManager System

- Create `src/game/systems/PortalManager.ts`
- Create `src/game/entities/Portal.ts`
- Linked portal pairs spawn on empty cells every ~30 seconds
- Each portal has a swirling vortex animation
- Nearby tiles are visually distorted (barrel shader or simple scale effect)
- Portals collapse (despawn) 8 seconds after appearing

### Portal Traversal

- When the snake's **head** enters a portal, the head exits the paired portal continuing in the same direction
- Body segments smoothly thread through the portal one by one, creating the illusion the snake exists in two locations simultaneously
- The snake body effectively has a "split" rendering while mid-transit

### Portal Collapse

- If the snake is mid-transit when a portal collapses, the remaining body segments teleport instantly to the exit side
- A flash VFX plays during instant teleport
- Collisions are briefly disabled (~0.5s) during emergency teleport to avoid unfair deaths

### Integration Points

- Portal traversal must work correctly with all biome mechanics (ice momentum, lava pools, gravity wells)
- Echo ghost does NOT use portals (ghost replays raw position history)
- Food should not be pulled through portals by any mechanic

## Out of Scope

- Temporal Rewind

