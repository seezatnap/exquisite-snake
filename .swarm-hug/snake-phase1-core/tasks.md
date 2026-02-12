# Tasks

## Foundation & Architecture

- [x] (#1) Initialize a Next.js 14+ App Router project in TypeScript strict mode with Tailwind CSS and npm, configure static export (`next build && next export`) for client-only deployment, and scaffold the Phase 1 directory/file structure under `src/` (including empty `game/systems/` for future phases) [5 pts] (A)
- [x] (#2) Implement `src/app/layout.tsx` and `src/app/page.tsx` to provide global Tailwind/font setup and mount a client-side `<Game />` entry point with proper overlay layering for menus/HUD [5 pts] (blocked by #1) (A)
- [x] (#3) Build `src/components/Game.tsx` as a Phaser wrapper using `dynamic(..., { ssr: false })`, with safe game instance mount/unmount and cleanup to avoid duplicate canvas instances on rerender/navigation [5 pts] (blocked by #2) (A)
- [x] (#4) Create `src/game/config.ts` and `src/game/scenes/Boot.ts` with Phaser scale/config defaults, arena dimensions, and preload setup for assets/visual primitives needed by gameplay and neon UI polish [5 pts] (blocked by #3) (A)
- [x] (#5) Define `src/game/scenes/MainScene.ts` core scene skeleton plus a Phaser↔React state bridge for game phase, score/high score, and elapsed survival time updates consumed by overlays [5 pts] (blocked by #3) (B)

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

- [x] (#17) Implement `src/styles/globals.css` neon theme tokens and Tailwind-driven dark-cyberpunk styling (pink/cyan on dark), including visible arena grid lines and responsive layout polish for surrounding UI [5 pts] (blocked by #2) (B)
- [ ] (#18) Add gameplay effects: particle burst on food pickup and subtle screen-shake on collision/death, tuned to remain readable and non-disorienting [5 pts] (blocked by #8, #9, #17)
- [ ] (#19) Execute performance and quality hardening for Phase 1: validate 60 FPS target under normal play, add focused tests for grid/input/storage logic, run end-to-end gameplay QA, and confirm static export output is production-ready [5 pts] (blocked by #12, #16, #18)

## Follow-up tasks (from sprint review)
- [x] (#20) Fix static-export npm scripts in `package.json` by replacing the broken `start` command (`next start` with `output: "export"`) with a static preview command that serves `out/`. (B)
- [x] (#21) Update `README.md` to document the actual static-export workflow and local preview steps (build/export output in `out/` and how to run it). (B)

## Follow-up tasks (from sprint review)
- [x] (#22) Fix global style precedence in `src/styles/globals.css` by removing/reworking the hard-coded `body` `font-family`/`background`/`color` rule so `src/app/layout.tsx` Tailwind classes (`font-sans`, `bg-black`, `text-white`) actually apply. (B)

## Follow-up tasks (from sprint review)
- [x] (#23) Replace source-text regex checks in `tests/game-component.test.mjs` with behavioral tests that mount `<Game />`, mock Phaser, and verify single-instance creation plus `destroy(true)` and DOM cleanup on unmount. (A)
- [x] (#24) Add a regression test that ensures `src/styles/globals.css` does not set `body` `background`, `color`, or `font-family`, so layout utility classes keep precedence after the global-style fix. (B)

## Follow-up tasks (from sprint review)
- [x] (#25) Wire the real `MainScene` class into `src/game/config.ts` (`scene: [BootScene, MainScene]`) and remove the `MAIN_SCENE_PLACEHOLDER` so `BootScene` starts the implemented scene logic. (C)
- [x] (#26) Update `tests/game-config-boot.test.mjs` to assert `GAME_CONFIG` registers the `MainScene` class (not a key-only placeholder) to prevent this wiring regression. (C)

## Follow-up tasks (from sprint review)
- [ ] (#27) Replace `tests/start-screen-component.test.mjs` source-regex assertions with behavioral tests that render `StartScreen`, mock the `MainScene` bridge, and verify high-score rendering plus visibility changes between `start` and non-`start` phases.
- [ ] (#28) Update `src/game/entities/Snake.ts` keyboard handling to call `preventDefault()` for any mapped direction key (including rejected opposite/duplicate/full-buffer inputs), and add regression coverage for rejected-key events.
