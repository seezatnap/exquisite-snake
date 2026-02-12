# Tasks

## Core Systems

- [x] (#1) Create `src/game/systems/BiomeManager.ts` with biome enum/config, a 45-second timer, deterministic cycle order (Neon City → Ice Cavern → Molten Core → Void Rift → repeat), and clean start/reset behavior per run [5 pts] (A)
- [x] (#2) Integrate BiomeManager into the main game loop/state flow so biome enter/exit events trigger mechanics and visual changes, and biome-visit stats are tracked during the run [5 pts] (blocked by #1) (A)

## Biome Mechanics

- [ ] (#3) Implement Ice Cavern momentum so each turn applies only after 2 extra tiles in the previous direction, with predictable input handling and correct collision resolution [5 pts] (blocked by #2)
- [ ] (#4) Implement Molten Core lava pools: random spawn on empty cells with tunable frequency/caps, collision handling that burns 3 tail segments (or kills if too short), and full cleanup when biome changes [5 pts] (blocked by #2)
- [ ] (#5) Implement Void Rift gravity well at arena center that nudges movement toward center by 1 tile on a configurable cadence while keeping movement fair and deterministic [5 pts] (blocked by #2)
- [ ] (#6) Add shared biome-mechanic balancing/config support (constants, edge-case handling, deterministic randomness hooks) across Ice, Molten, and Void behaviors [5 pts] (blocked by #3, #4, #5)

## Visuals & Transitions

- [ ] (#7) Implement biome-specific visual themes (palette/tilemap/background) for Neon City, Ice Cavern, Molten Core, and Void Rift, wired to biome state changes [5 pts] (blocked by #2)
- [ ] (#8) Build biome transition effects (radial-wipe or dissolve plus subtle screen-shake) with synchronized palette/tilemap swap timing and no gameplay desync [5 pts] (blocked by #7)
- [ ] (#9) Add mechanic-linked visual elements (Molten lava pool visuals and Void center vortex) with proper render layering relative to snake, food, and arena tiles [5 pts] (blocked by #4, #5, #7)

## HUD & Game Over

- [ ] (#10) Update HUD biome indicator to show current biome name and icon, refreshing on each transition for all four biome states [5 pts] (blocked by #2, #7)
- [ ] (#11) Extend Game Over stats to include biomes visited from BiomeManager run data, including correct reset behavior between games [5 pts] (blocked by #2)

## Testing & QA

- [ ] (#12) Add automated tests for biome cycle timing/order, Ice momentum rules, Molten burn/despawn behavior, Void pull cadence, and biome-visit stat tracking [5 pts] (blocked by #3, #4, #5, #11)
- [ ] (#13) Execute end-to-end QA across multiple 45-second biome cycles to validate transitions, mechanics, HUD updates, and performance; capture and triage release-blocking defects [5 pts] (blocked by #8, #9, #10, #12)

## Follow-up tasks (from sprint review)
- [ ] (#14) Add GameOver component rendering test to verify the biomes-visited stat displays the correct count from bridge state (blocked by #11)
- [ ] (#15) Mark task #11 as complete — biomes-visited GameOver stat, bridge wiring, and reset behavior are fully implemented by sprint 2
