# Specifications: exquisite-snake

# Exquisite Snake — PRD

## Overview

A polished, professional snake game built as a **Next.js (App Router) + TypeScript** application using **Phaser 3** (open-source, MIT-licensed game engine). The game should feel premium: smooth animations, particle effects, screen-shake, responsive layout, and a cohesive dark-neon visual theme.

## Tech Stack

- **Framework:** Next.js 14+ with App Router, TypeScript strict mode
- **Game Engine:** Phaser 3 (loaded client-side only; use `dynamic()` import with `ssr: false`)
- **Styling:** Tailwind CSS for the surrounding UI (scoreboard, menus, overlays)
- **Package Manager:** npm
- **Deployment target:** Static export (`next build && next export`) — no server features required

## Core Snake Mechanics

Standard snake rules as the baseline:
- Grid-based movement, arrow-key / WASD controls
- Snake grows when eating food
- Game over on wall collision or self-collision
- Score tracking, high-score persistence (localStorage)
- Smooth interpolated movement (not jerky tile-snapping)
- Mobile-friendly touch/swipe controls

## Five Novel Features

### 1. Temporal Rewind

The player can press **R** (or tap a UI button) to rewind time by ~3 seconds. The entire game state (snake position history, food, score, obstacles) scrubs backward in a smooth VCR-style animation.

- Each rewind costs **20 % of current score** (minimum 10 points) and **removes the last 2 tail segments**.
- A cooldown bar (8 seconds) prevents spam.
- Visual: scanline + chromatic-aberration post-processing flash during rewind.

### 2. Biome Shifting

Every 45 seconds the arena transitions to one of four biomes. Each biome changes the tilemap palette **and** introduces a unique mechanic:

| Biome | Visual | Mechanic |
|-------|--------|----------|
| **Neon City** | Cyberpunk grid, pink/cyan | Default — no modifier |
| **Ice Cavern** | Frost tiles, blue glow | Snake slides 2 extra tiles before stopping when turning (momentum) |
| **Molten Core** | Lava cracks, orange embers | Random lava pools spawn; touching one burns off 3 tail segments |
| **Void Rift** | Star-field, purple vortex | Gravity wells pull the snake toward the center of the arena |

Biome transitions use a radial-wipe shader or dissolve effect.

### 3. Echo Ghost

The game records the snake's path. After a **5-second delay**, a translucent "echo ghost" snake replays that exact path on the board.

- Colliding with the echo ghost kills the player, so you must avoid your own past.
- The ghost fades after replaying its segment history (so it doesn't grow forever).
- When food is eaten, a ghost-food particle burst appears at the ghost's position 5 seconds later (cosmetic only).
- The echo ghost is visually distinct: dashed outline, 40 % opacity, slight trailing particles.

### 4. Symbiotic Parasites

Special "parasite" pickups spawn occasionally (distinct from normal food). When eaten, a **parasite segment** attaches to the snake with a unique color and ability:

| Parasite | Color | Benefit | Drawback |
|----------|-------|---------|----------|
| **Magnet** | Gold | Pulls nearby food toward the snake (2-tile radius) | Snake speed increases by 10 % per magnet segment |
| **Shield** | Cyan | Absorbs one wall/self-collision (then breaks off) | Blocks the next food pickup (must eat twice) |
| **Splitter** | Green | Score multiplier ×1.5 while attached | Every 10 seconds it spawns a stationary obstacle on the board |

- Max 3 parasite segments at a time. Oldest is shed when a 4th is eaten.
- Parasite segments are visually distinct: pulsing glow, tiny icon overlay.

### 5. Dimensional Rift Portals

Pairs of linked portals appear on the board at random intervals (~30 seconds). When the snake's **head** enters a portal:

- The head exits the paired portal and continues in the same direction.
- The body segments smoothly thread through the portal, creating the illusion that the snake exists in two locations at once while passing through.
- Portals have a swirling vortex animation and distort nearby tiles (barrel shader).
- A portal collapses 8 seconds after spawning. If the snake is mid-transit when it collapses, the remaining body teleports instantly (with a flash) — but collisions are briefly disabled during the teleport to avoid unfair deaths.

## UI & Chrome

- **Start screen:** Game title with animated snake logo, "Press any key" prompt, high-score display.
- **HUD:** Top bar with score, high score, current biome indicator, rewind cooldown bar, parasite inventory icons.
- **Game Over overlay:** Final score, high score, "Play Again" button, brief stats (time survived, biomes visited, parasites collected, rewinds used).
- **Responsive:** Canvas scales to viewport; surrounding UI uses Tailwind responsive utilities.
- **Accessibility:** Keyboard-only navigable menus; color-blind-friendly palette option toggle.

## Quality Bar

- 60 FPS target on modern browsers.
- No jank on biome transitions or portal teleports.
- All text is anti-aliased; fonts loaded via `next/font`.
- Sound effects (optional, off by default): eat, rewind whoosh, biome transition chime, portal warp, death. Use Web Audio API or Howler.js.
- Subtle screen-shake on collisions and biome shifts.

## Project Structure (suggested)

```
src/
  app/
    page.tsx          — landing page, mounts <Game /> client component
    layout.tsx        — root layout with Tailwind + font setup
  components/
    Game.tsx          — dynamic-imported Phaser wrapper (ssr: false)
    HUD.tsx           — React overlay for score, cooldowns, etc.
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
      Parasite.ts
      EchoGhost.ts
      Portal.ts
    systems/
      BiomeManager.ts
      RewindManager.ts
      ParasiteManager.ts
      PortalManager.ts
    utils/
      grid.ts
      storage.ts      — localStorage helpers
  styles/
    globals.css       — Tailwind base + neon theme tokens
```

## Out of Scope

- Multiplayer / networking
- Backend / database
- Leaderboards beyond local high score
- Native mobile builds

