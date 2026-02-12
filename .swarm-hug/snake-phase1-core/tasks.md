# Tasks

## Foundation & Architecture

- [x] (#1) Initialize a Next.js 14+ App Router project in TypeScript strict mode with Tailwind CSS and npm, configure static export (`next build && next export`) for client-only deployment, and scaffold the Phase 1 directory/file structure under `src/` (including empty `game/systems/` for future phases) [5 pts] (A)
- [x] (#2) Implement `src/app/layout.tsx` and `src/app/page.tsx` to provide global Tailwind/font setup and mount a client-side `<Game />` entry point with proper overlay layering for menus/HUD [5 pts] (blocked by #1) (A)
- [x] (#3) Build `src/components/Game.tsx` as a Phaser wrapper using `dynamic(..., { ssr: false })`, with safe game instance mount/unmount and cleanup to avoid duplicate canvas instances on rerender/navigation [5 pts] (blocked by #2) (A)
- [x] (#4) Create `src/game/config.ts` and `src/game/scenes/Boot.ts` with Phaser scale/config defaults, arena dimensions, and preload setup for assets/visual primitives needed by gameplay and neon UI polish [5 pts] (blocked by #3) (A)
- [x] (#5) Define `src/game/scenes/MainScene.ts` core scene skeleton plus a Phaser↔React state bridge for game phase, score/high score, and elapsed survival time updates consumed by overlays [5 pts] (blocked by #3) (A)

## Gameplay Mechanics

- [x] (#6) Implement `src/game/utils/grid.ts` and movement timing primitives for grid-based logic with smooth interpolation between tiles (no jerky tile-snapping) [5 pts] (blocked by #4) (A)
- [x] (#7) Implement `src/game/entities/Snake.ts` with arrow-key/WASD movement, buffered input queueing, anti-180-degree turn rules, and segment growth support [5 pts] (blocked by #6) (A)
- [ ] (#8) Implement `src/game/entities/Food.ts` spawn/eat behavior with safe spawn positions (not inside snake), score increment hooks, and snake growth trigger integration [5 pts] (blocked by #7)
- [ ] (#9) Implement wall-collision and self-collision detection in `MainScene`, transition to game-over state, and deterministic reset logic for replay sessions [5 pts] (blocked by #7)
- [x] (#10) Implement `src/game/utils/storage.ts` localStorage helpers and integrate high-score persistence (load on boot, update on run end, fault-tolerant fallbacks when storage is unavailable) [5 pts] (blocked by #5) (B)
- [ ] (#11) Implement mobile-friendly touch/swipe controls with threshold/debounce tuning and map them into the same buffered direction-input system used by keyboard controls [5 pts] (blocked by #7)
- [x] (#12) Implement responsive canvas sizing and resize handling so the arena scales cleanly across viewport/device changes while preserving gameplay grid integrity [5 pts] (blocked by #4) (A)

## UI & Flow

- [x] (#13) Build `src/components/StartScreen.tsx` with animated snake-logo/title treatment, “Press any key” start prompt, and high-score display sourced from persisted data [5 pts] (blocked by #10) (A)
- [x] (#14) Build `src/components/HUD.tsx` top bar showing score/high score and reserved placeholder slots for future biome indicator, rewind cooldown, and parasite inventory [5 pts] (blocked by #5) (B)
- [ ] (#15) Build `src/components/GameOver.tsx` overlay with final score, high score, time survived, and a Play Again action wired to scene reset and state re-entry [5 pts] (blocked by #9, #10)
- [ ] (#16) Integrate start/HUD/game-over overlays into a complete game loop (start -> playing -> game over -> replay), including keyboard-first navigation and consistent focus management between states [5 pts] (blocked by #13, #14, #15)

## Visual Polish & Performance

- [x] (#17) Implement `src/styles/globals.css` neon theme tokens and Tailwind-driven dark-cyberpunk styling (pink/cyan on dark), including visible arena grid lines and responsive layout polish for surrounding UI [5 pts] (blocked by #2) (A)
- [ ] (#18) Add gameplay effects: particle burst on food pickup and subtle screen-shake on collision/death, tuned to remain readable and non-disorienting [5 pts] (blocked by #8, #9, #17)
- [ ] (#19) Execute performance and quality hardening for Phase 1: validate 60 FPS target under normal play, add focused tests for grid/input/storage logic, run end-to-end gameplay QA, and confirm static export output is production-ready [5 pts] (blocked by #12, #16, #18)

## Follow-up tasks (from sprint review)
- [x] (#20) Restore SSR-safe Phaser loading in `src/components/Game.tsx` — sprint 4 replaced the `dynamic(..., { ssr: false })` wrapper and async `import("phaser")` from task #3 with a direct top-level `import Phaser from "phaser"`, which will crash during Next.js server-side rendering since Phaser requires browser globals (`window`, `document`) (blocked by #4) (C)
- [x] (#21) Eliminate dual source of truth in `MainScene` by removing local `phase`/`score`/`highScore`/`elapsedTime` fields and reading from `gameBridge.getState()` instead, so external bridge consumers and the scene cannot drift out of sync (blocked by #5) (C)
