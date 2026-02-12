# Tasks

## Project Setup & Architecture

- [ ] (#1) Initialize a Next.js 14+ App Router project with TypeScript strict mode, Tailwind CSS, npm scripts, and static-export-ready configuration (`next build && next export`) with no backend/server features [5 pts]
- [ ] (#2) Configure `src/app/layout.tsx` and global styles with `next/font`, dark-neon theme tokens, and anti-aliased text defaults for all game UI surfaces [5 pts] (blocked by #1)
- [ ] (#3) Build `components/Game.tsx` as a client-only Phaser mount using `dynamic()` with `ssr: false`, including clean mount/unmount lifecycle and typed React↔Phaser event plumbing [5 pts] (blocked by #1)
- [ ] (#4) Establish `src/game` architecture (`config`, `scenes`, `entities`, `systems`, `utils`) with shared TypeScript models for score/state, biomes, parasites, portals, and run stats [5 pts] (blocked by #1)

## Core Gameplay Engine

- [ ] (#5) Implement `Boot` and `MainScene` foundations with grid setup, deterministic update loop, and smooth interpolated movement rendering between tile steps [5 pts] (blocked by #3, #4)
- [ ] (#6) Implement snake movement and controls (Arrow keys + WASD), input buffering, and anti-180-degree turn constraints [5 pts] (blocked by #5)
- [ ] (#7) Implement food spawning on valid cells, food consumption, and snake growth behavior [5 pts] (blocked by #6)
- [ ] (#8) Implement wall/self-collision detection, game-over trigger, and subtle collision screen-shake feedback [5 pts] (blocked by #6)
- [ ] (#9) Implement score tracking, local high-score persistence via `localStorage`, and clean reset/restart state handling [5 pts] (blocked by #7, #8)
- [ ] (#10) Add mobile-friendly touch/swipe controls and responsive canvas scaling to viewport across phone/tablet/desktop [5 pts] (blocked by #2, #5)

## UI & Game Flow

- [ ] (#11) Build `StartScreen` with animated snake logo, “Press any key” prompt, and persisted high-score display [5 pts] (blocked by #2, #9)
- [ ] (#12) Build `HUD` top bar showing score, high score, current biome indicator, rewind cooldown bar slot, and parasite inventory slots [5 pts] (blocked by #2, #9)
- [ ] (#13) Build `GameOver` overlay with final score, high score, Play Again action, and stats (time survived, biomes visited, parasites collected, rewinds used) [5 pts] (blocked by #2, #9)
- [ ] (#14) Wire full front-end game flow (start → playing → game over → replay) and responsive Tailwind layout around canvas and overlays [5 pts] (blocked by #11, #12, #13)

## Biome Shifting

- [ ] (#15) Implement `BiomeManager` to trigger biome shifts every 45 seconds and track biome-visit stats/events [5 pts] (blocked by #5)
- [ ] (#16) Implement runtime biome visual profiles (Neon City, Ice Cavern, Molten Core, Void Rift) with palette/tilemap/theme switching hooks [5 pts] (blocked by #15)
- [ ] (#17) Implement biome transition effects (radial wipe or dissolve shader) with smooth handoff and subtle shift screen-shake [5 pts] (blocked by #16)
- [ ] (#18) Implement Ice Cavern mechanic where turns produce momentum slides (2 extra tiles) while preserving control predictability [5 pts] (blocked by #6, #15)
- [ ] (#19) Implement Molten Core mechanic: random lava pool spawning and contact penalty that burns off 3 tail segments [5 pts] (blocked by #7, #15)
- [ ] (#20) Implement Void Rift mechanic: center-pull gravity well behavior influencing movement in a fair, readable way [5 pts] (blocked by #6, #15)

## Echo Ghost

- [ ] (#21) Implement `EchoGhost` path recording and delayed replay (5-second lag) with dashed outline, 40% opacity, trailing particles, and lifecycle fade-out [5 pts] (blocked by #6)
- [ ] (#22) Implement echo gameplay interactions: ghost collision causes death, plus delayed ghost-food burst VFX at historical food-eat positions [5 pts] (blocked by #7, #21)

## Symbiotic Parasites

- [ ] (#23) Implement parasite pickup spawning/collection with attachment rules, max 3 parasite segments, FIFO shedding on 4th pickup, and distinct pulsing/icon visuals [5 pts] (blocked by #7, #12)
- [ ] (#24) Implement Magnet parasite behavior: attract nearby food within 2-tile radius and apply +10% snake speed per magnet segment [5 pts] (blocked by #7, #23)
- [ ] (#25) Implement Shield parasite behavior: absorb one wall/self collision then detach, and force next food pickup to be blocked [5 pts] (blocked by #8, #23)
- [ ] (#26) Implement Splitter parasite behavior: apply x1.5 score multiplier while attached and spawn stationary obstacles every 10 seconds [5 pts] (blocked by #9, #23)

## Dimensional Rift Portals

- [ ] (#27) Implement `PortalManager` for linked portal pair spawns (~30s cadence), vortex animation, nearby barrel-distortion effect, and 8-second collapse timing [5 pts] (blocked by #5, #17)
- [ ] (#28) Implement portal traversal so snake head exits linked portal preserving direction while body segments thread through smoothly [5 pts] (blocked by #6, #27)
- [ ] (#29) Implement portal collapse mid-transit behavior: instant remaining-body teleport with flash and temporary collision disable for fairness [5 pts] (blocked by #28)

## Temporal Rewind

- [ ] (#30) Implement `RewindManager` snapshot ring buffer capturing ~3 seconds of full mutable game state (snake, food, score, biome state, obstacles, parasites, portals) [5 pts] (blocked by #19, #20, #22, #26, #29)
- [ ] (#31) Implement rewind activation from `R` key and HUD button with smooth VCR-style scrub playback plus scanline/chromatic-aberration flash [5 pts] (blocked by #12, #30)
- [ ] (#32) Implement rewind rule enforcement: 20% score cost (min 10), remove last 2 tail segments, 8-second cooldown bar behavior, and rewind stat tracking [5 pts] (blocked by #12, #13, #31)

## Audio, Accessibility, Performance & QA

- [ ] (#33) Add optional sound system (off by default) with toggle and SFX hooks for eat, rewind whoosh, biome transition chime, portal warp, and death [5 pts] (blocked by #17, #22, #29, #32)
- [ ] (#34) Complete accessibility pass: keyboard-only navigable menus/overlays, visible focus states, and color-blind-friendly palette option toggle [5 pts] (blocked by #11, #12, #13, #16)
- [ ] (#35) Run performance optimization/profiling to hit 60 FPS and eliminate jank during biome transitions, portal teleports, particles, and post-processing [5 pts] (blocked by #20, #26, #29, #32, #33)
- [ ] (#36) Build test suite and QA plan: unit tests for core managers/utils, integration tests for feature interactions, and manual desktop/mobile regression checklist [5 pts] (blocked by #35)

## Release

- [ ] (#37) Finalize static deployment readiness by validating `next build && next export`, confirming artifact behavior, and documenting run/build/deploy workflow [5 pts] (blocked by #1, #36)
