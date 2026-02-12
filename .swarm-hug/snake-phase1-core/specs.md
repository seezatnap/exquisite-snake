# Specifications: snake-phase1-core

# Phase 1 — Core Snake Game

## Overview

A polished, professional snake game built as a **Next.js 14+ (App Router) + TypeScript** application using **Phaser 3** (open-source, MIT-licensed game engine). This phase delivers a fully playable, visually polished baseline with a dark-neon aesthetic — no novel features yet, just rock-solid fundamentals.

## Tech Stack

- **Framework:** Next.js 14+ with App Router, TypeScript strict mode
- **Game Engine:** Phaser 3 (loaded client-side only; use `dynamic()` import with `ssr: false`)
- **Styling:** Tailwind CSS for surrounding UI (scoreboard, menus, overlays)
- **Package Manager:** npm
- **Deployment target:** Static export (`next build && next export`) — no server features required

## Core Snake Mechanics

- Grid-based movement, arrow-key / WASD controls
- Input buffering and anti-180-degree turn constraints
- Snake grows when eating food
- Game over on wall collision or self-collision
- Score tracking, high-score persistence (localStorage)
- Smooth interpolated movement (not jerky tile-snapping)
- Mobile-friendly touch/swipe controls
- Responsive canvas scaling to viewport

## Visual Theme

- Dark-neon cyberpunk aesthetic (pink/cyan palette on dark background)
- Grid lines visible on the arena floor
- Particle burst on food pickup
- Subtle screen-shake on collision/death
- 60 FPS target, no jank

## UI & Game Flow

- **Start screen:** Game title with animated snake logo, "Press any key" prompt, high-score display
- **HUD:** Top bar with score and high score (leave placeholder slots for future biome indicator, rewind cooldown, parasite inventory)
- **Game Over overlay:** Final score, high score, "Play Again" button, brief stats (time survived)
- **Responsive:** Canvas scales to viewport; surrounding UI uses Tailwind responsive utilities
- **Accessibility:** Keyboard-only navigable menus; visible focus states

## Project Structure

```
src/
  app/
    page.tsx          — landing page, mounts <Game /> client component
    layout.tsx        — root layout with Tailwind + font setup
  components/
    Game.tsx          — dynamic-imported Phaser wrapper (ssr: false)
    HUD.tsx           — React overlay for score, etc.
    StartScreen.tsx   — pre-game menu
    GameOver.tsx      — post-game overlay
  game/
    config.ts         — Phaser.Types.Core.GameConfig
    scenes/
      Boot.ts         — asset preload
      MainScene.ts    — primary gameplay scene
    entities/
      Snake.ts
      Food.ts
    systems/
      (empty — future features go here)
    utils/
      grid.ts
      storage.ts      — localStorage helpers
  styles/
    globals.css       — Tailwind base + neon theme tokens
```

## Out of Scope (deferred to later phases)

- Biome Shifting
- Echo Ghost
- Symbiotic Parasites
- Dimensional Rift Portals
- Temporal Rewind
- Sound effects
- Color-blind palette toggle

