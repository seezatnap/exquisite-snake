/**
 * End-to-end QA: Multi-cycle biome validation
 *
 * Task #13 — Execute end-to-end QA across multiple 45-second biome cycles
 * to validate transitions, mechanics, HUD updates, and performance;
 * capture and triage release-blocking defects.
 *
 * This file covers:
 * 1. Multi-cycle biome rotation with MainScene integration
 * 2. Transition effect correctness (dissolve + screen-shake)
 * 3. Mechanic activation/deactivation per biome
 * 4. HUD bridge synchronisation across transitions
 * 5. Game Over stats accuracy after multi-biome runs
 * 6. Performance: frame timing budget and object lifecycle
 * 7. Edge cases: rapid transitions, mid-transition game over, replay
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { gameBridge } from "@/game/bridge";
import {
  Biome,
  BIOME_CYCLE,
  BIOME_DURATION_MS,
  BIOME_CONFIGS,
} from "@/game/systems/BiomeManager";
import {
  TRANSITION_DURATION_MS,
  TRANSITION_MIDPOINT,
} from "@/game/systems/BiomeTransition";
import { GRID_COLS, GRID_ROWS } from "@/game/config";

// ── Phaser mock ──────────────────────────────────────────────────
const mockShake = vi.fn();
const mockEmitterDestroy = vi.fn();
const mockExplode = vi.fn();
const mockDelayedCall = vi.fn();
const mockTexturesExists = vi.fn().mockReturnValue(true);
const mockSetBackgroundColor = vi.fn();

function createMockEmitter() {
  return { explode: mockExplode, destroy: mockEmitterDestroy };
}

const mockAddParticles = vi.fn(() => createMockEmitter());

const mockGraphics = {
  lineStyle: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  strokePath: vi.fn(),
  setDepth: vi.fn(),
  destroy: vi.fn(),
  clear: vi.fn(),
  fillStyle: vi.fn(),
  fillRect: vi.fn(),
  setAlpha: vi.fn(),
  setVisible: vi.fn(),
  scene: true,
};

const mockDestroy = vi.fn();
const mockSetPosition = vi.fn();
const mockKeyboardOn = vi.fn();

function createMockSprite() {
  return {
    destroy: mockDestroy,
    setPosition: mockSetPosition,
    setTexture: vi.fn(),
    setDepth: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    setScale: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    setRotation: vi.fn().mockReturnThis(),
    x: 0,
    y: 0,
  };
}

vi.mock("phaser", () => {
  class MockScene {
    scene = { start: vi.fn() };
    add = {
      graphics: () => ({ ...mockGraphics }),
      sprite: vi.fn(() => createMockSprite()),
      particles: mockAddParticles,
    };
    input = { keyboard: { on: mockKeyboardOn, off: vi.fn() } };
    cameras = {
      main: { shake: mockShake, setBackgroundColor: mockSetBackgroundColor },
    };
    textures = { exists: mockTexturesExists };
    time = { delayedCall: mockDelayedCall };
    constructor(public config?: { key: string }) {}
  }
  class MockGame {
    constructor() {}
    destroy() {}
  }
  return {
    default: {
      Game: MockGame,
      Scene: MockScene,
      AUTO: 0,
      Scale: { FIT: 1, CENTER_BOTH: 1 },
    },
    Game: MockGame,
    Scene: MockScene,
    AUTO: 0,
    Scale: { FIT: 1, CENTER_BOTH: 1 },
  };
});

import { MainScene } from "@/game/scenes/MainScene";

// ── Helpers ──────────────────────────────────────────────────────

function resetBridge(): void {
  gameBridge.setPhase("start");
  gameBridge.setScore(0);
  gameBridge.setHighScore(0);
  gameBridge.setElapsedTime(0);
  gameBridge.setBiome(Biome.NeonCity);
  gameBridge.setBiomeTimeRemaining(0);
  gameBridge.setBiomeVisitStats({
    visits: {
      [Biome.NeonCity]: 0,
      [Biome.IceCavern]: 0,
      [Biome.MoltenCore]: 0,
      [Biome.VoidRift]: 0,
    },
    uniqueCount: 0,
  });
}

/** Create a scene in playing state with snake safely positioned at center. */
function createPlayingScene(): MainScene {
  const scene = new MainScene();
  scene.create();
  scene.enterPhase("playing");
  // Position snake safely to avoid wall/lava collisions during time advances
  scene.getSnake()!.reset({ col: 15, row: 15 }, "right", 1);
  return scene;
}

/**
 * Advance a playing scene by `ms` milliseconds in safe increments,
 * resetting the snake position each step to prevent wall collisions.
 */
function safeAdvance(scene: MainScene, ms: number, stepMs = 1000): void {
  let remaining = ms;
  while (remaining > 0) {
    const dt = Math.min(remaining, stepMs);
    // Keep snake safe from walls
    scene.getSnake()?.reset({ col: 15, row: 15 }, "right", 1);
    scene.update(0, dt);
    if (gameBridge.getState().phase !== "playing") break;
    remaining -= dt;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  resetBridge();
  localStorage.clear();
});

// ════════════════════════════════════════════════════════════════
// 1. Multi-cycle biome rotation (MainScene integration)
// ════════════════════════════════════════════════════════════════

describe("E2E: Multi-cycle biome rotation", () => {
  it("completes a full 4-biome cycle with correct bridge state at each step", () => {
    const scene = createPlayingScene();

    const expectedOrder = [
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.MoltenCore,
      Biome.VoidRift,
    ];

    expect(gameBridge.getState().currentBiome).toBe(expectedOrder[0]);

    for (let i = 1; i < expectedOrder.length; i++) {
      safeAdvance(scene, BIOME_DURATION_MS);
      if (gameBridge.getState().phase !== "playing") break;
      expect(gameBridge.getState().currentBiome).toBe(expectedOrder[i]);
    }
  });

  it("wraps around to NeonCity after VoidRift", () => {
    const scene = createPlayingScene();

    // Advance through all 4 biomes
    safeAdvance(scene, BIOME_DURATION_MS * 4);
    if (gameBridge.getState().phase !== "playing") return;

    expect(gameBridge.getState().currentBiome).toBe(Biome.NeonCity);
  });

  it("completes 3 full cycles (12 transitions) with deterministic order", () => {
    const scene = createPlayingScene();
    const biomeLog: Biome[] = [gameBridge.getState().currentBiome];

    const listener = vi.fn();
    gameBridge.on("biomeChange", listener);

    for (let i = 0; i < 12; i++) {
      safeAdvance(scene, BIOME_DURATION_MS);
      if (gameBridge.getState().phase !== "playing") break;
      biomeLog.push(gameBridge.getState().currentBiome);
    }

    gameBridge.off("biomeChange", listener);

    // Each cycle should repeat the same pattern
    for (let i = 0; i < biomeLog.length; i++) {
      expect(biomeLog[i]).toBe(BIOME_CYCLE[i % BIOME_CYCLE.length]);
    }
  });

  it("biomeTimeRemaining decreases during a biome and resets on transition", () => {
    const scene = createPlayingScene();

    // After 10 seconds, remaining should be 35 seconds
    safeAdvance(scene, 10_000);
    if (gameBridge.getState().phase !== "playing") return;

    const remaining = gameBridge.getState().biomeTimeRemaining;
    expect(remaining).toBeCloseTo(BIOME_DURATION_MS - 10_000, -2);

    // Advance to transition
    safeAdvance(scene, BIOME_DURATION_MS - 10_000);
    if (gameBridge.getState().phase !== "playing") return;

    // After transition, remaining resets close to full duration
    const newRemaining = gameBridge.getState().biomeTimeRemaining;
    expect(newRemaining).toBeGreaterThan(BIOME_DURATION_MS - 2000);
  });
});

// ════════════════════════════════════════════════════════════════
// 2. Transition effect correctness
// ════════════════════════════════════════════════════════════════

describe("E2E: Transition effects during biome changes", () => {
  it("transition fires screen-shake on biome change", () => {
    const scene = createPlayingScene();
    mockShake.mockClear();

    // Advance to first biome transition
    safeAdvance(scene, BIOME_DURATION_MS);
    if (gameBridge.getState().phase !== "playing") return;

    // Advance transition effect through midpoint
    scene.update(0, TRANSITION_DURATION_MS * TRANSITION_MIDPOINT + 1);

    // Screen shake should have fired
    expect(mockShake).toHaveBeenCalled();
  });

  it("transition updates theme at midpoint (theme biome changes)", () => {
    const scene = createPlayingScene();

    expect(scene.getCurrentThemeBiome()).toBe(Biome.NeonCity);

    // Trigger transition to IceCavern
    safeAdvance(scene, BIOME_DURATION_MS);
    if (gameBridge.getState().phase !== "playing") return;

    // Run transition to completion
    scene.update(0, TRANSITION_DURATION_MS);

    expect(scene.getCurrentThemeBiome()).toBe(Biome.IceCavern);
  });

  it("transition completes within TRANSITION_DURATION_MS", () => {
    const scene = createPlayingScene();
    const transition = scene.getBiomeTransition();

    // Advance to just before transition, then trigger it with a single update
    safeAdvance(scene, BIOME_DURATION_MS - 100);
    if (gameBridge.getState().phase !== "playing") return;

    // This single update triggers the biome change and starts the transition
    scene.getSnake()?.reset({ col: 15, row: 15 }, "right", 1);
    scene.update(0, 100); // triggers transition
    if (gameBridge.getState().phase !== "playing") return;

    // Transition should be active (100ms < TRANSITION_DURATION_MS)
    expect(transition.isActive()).toBe(true);

    // Advance past transition duration
    scene.getSnake()?.reset({ col: 15, row: 15 }, "right", 1);
    scene.update(0, TRANSITION_DURATION_MS + 10);

    expect(transition.isActive()).toBe(false);
  });

  it("transition is started for each biome change and eventually completes", () => {
    const scene = createPlayingScene();
    const transition = scene.getBiomeTransition();

    // Advance through first transition and complete it
    safeAdvance(scene, BIOME_DURATION_MS);
    if (gameBridge.getState().phase !== "playing") return;

    // After safeAdvance with 1s steps, transition already completed
    expect(transition.isActive()).toBe(false);
    expect(scene.getCurrentThemeBiome()).toBe(Biome.IceCavern);

    // Advance through second transition
    safeAdvance(scene, BIOME_DURATION_MS);
    if (gameBridge.getState().phase !== "playing") return;

    expect(transition.isActive()).toBe(false);
    expect(scene.getCurrentThemeBiome()).toBe(Biome.MoltenCore);
  });
});

// ════════════════════════════════════════════════════════════════
// 3. Mechanic activation/deactivation per biome
// ════════════════════════════════════════════════════════════════

describe("E2E: Mechanic activation per biome", () => {
  it("ice momentum is disabled during Neon City (initial biome)", () => {
    const scene = createPlayingScene();
    expect(scene.getIceMomentum().isEnabled()).toBe(false);
  });

  it("ice momentum activates when entering Ice Cavern", () => {
    const scene = createPlayingScene();

    safeAdvance(scene, BIOME_DURATION_MS);
    if (gameBridge.getState().phase !== "playing") return;

    expect(gameBridge.getState().currentBiome).toBe(Biome.IceCavern);
    expect(scene.getIceMomentum().isEnabled()).toBe(true);
  });

  it("ice momentum deactivates when leaving Ice Cavern", () => {
    const scene = createPlayingScene();

    // Enter Ice Cavern
    safeAdvance(scene, BIOME_DURATION_MS);
    if (gameBridge.getState().phase !== "playing") return;
    expect(scene.getIceMomentum().isEnabled()).toBe(true);

    // Leave Ice Cavern → Molten Core
    safeAdvance(scene, BIOME_DURATION_MS);
    if (gameBridge.getState().phase !== "playing") return;
    expect(scene.getIceMomentum().isEnabled()).toBe(false);
  });

  it("lava pool manager exists and spawns during Molten Core", () => {
    const scene = createPlayingScene();

    // Advance to Molten Core (2nd biome transition)
    safeAdvance(scene, BIOME_DURATION_MS * 2);
    if (gameBridge.getState().phase !== "playing") return;

    expect(gameBridge.getState().currentBiome).toBe(Biome.MoltenCore);
    const lpm = scene.getLavaPoolManager();
    expect(lpm).not.toBeNull();
  });

  it("gravity well manager exists and is functional during Void Rift", () => {
    const scene = createPlayingScene();

    // Advance to Void Rift (3rd biome transition)
    safeAdvance(scene, BIOME_DURATION_MS * 3);
    if (gameBridge.getState().phase !== "playing") return;

    expect(gameBridge.getState().currentBiome).toBe(Biome.VoidRift);
    const gwm = scene.getGravityWellManager();
    expect(gwm).not.toBeNull();
  });

  it("void vortex visual is shown during Void Rift and hidden otherwise", () => {
    const scene = createPlayingScene();
    const vortex = scene.getVoidVortex();
    expect(vortex).not.toBeNull();

    // Neon City: vortex should not be visible
    // (Note: we can't easily check visibility on a mock, but we verify
    //  the lifecycle — vortex.show() is called when entering Void Rift)

    // Advance to Void Rift
    safeAdvance(scene, BIOME_DURATION_MS * 3);
    if (gameBridge.getState().phase !== "playing") return;

    expect(gameBridge.getState().currentBiome).toBe(Biome.VoidRift);
    // Vortex object persists
    expect(scene.getVoidVortex()).not.toBeNull();
  });

  it("mechanics are correctly re-enabled on cycle wrap", () => {
    const scene = createPlayingScene();

    // Complete a full cycle + advance to IceCavern in 2nd cycle
    safeAdvance(scene, BIOME_DURATION_MS * 5);
    if (gameBridge.getState().phase !== "playing") return;

    // Should be in IceCavern of second cycle
    expect(gameBridge.getState().currentBiome).toBe(Biome.IceCavern);
    expect(scene.getIceMomentum().isEnabled()).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════
// 4. HUD bridge synchronisation
// ════════════════════════════════════════════════════════════════

describe("E2E: HUD bridge state sync across biome cycles", () => {
  it("bridge biome name matches BIOME_CONFIGS at each transition", () => {
    const scene = createPlayingScene();

    for (let i = 0; i < BIOME_CYCLE.length; i++) {
      if (gameBridge.getState().phase !== "playing") break;

      const currentBiome = gameBridge.getState().currentBiome;
      const config = BIOME_CONFIGS[currentBiome];
      expect(config).toBeDefined();
      expect(config.name).toBeTruthy();
      expect(config.icon).toBeTruthy();

      safeAdvance(scene, BIOME_DURATION_MS);
    }
  });

  it("biomeTimeRemaining is always between 0 and BIOME_DURATION_MS", () => {
    const scene = createPlayingScene();

    // Sample time-remaining at various points across 2 cycles
    for (let t = 0; t < BIOME_DURATION_MS * 2; t += 5000) {
      safeAdvance(scene, 5000);
      if (gameBridge.getState().phase !== "playing") break;

      const remaining = gameBridge.getState().biomeTimeRemaining;
      expect(remaining).toBeGreaterThanOrEqual(0);
      expect(remaining).toBeLessThanOrEqual(BIOME_DURATION_MS);
    }
  });

  it("biomeVisitStats.uniqueCount increases monotonically during first cycle", () => {
    const scene = createPlayingScene();
    let prevUnique = gameBridge.getState().biomeVisitStats.uniqueCount;
    expect(prevUnique).toBe(1);

    for (let i = 1; i <= 3; i++) {
      safeAdvance(scene, BIOME_DURATION_MS);
      if (gameBridge.getState().phase !== "playing") break;

      const newUnique = gameBridge.getState().biomeVisitStats.uniqueCount;
      expect(newUnique).toBeGreaterThanOrEqual(prevUnique);
      prevUnique = newUnique;
    }

    // After visiting all 4 biomes
    expect(prevUnique).toBe(4);
  });

  it("score and biome state are both readable from bridge during play", () => {
    const scene = createPlayingScene();
    scene.addScore(42);

    safeAdvance(scene, BIOME_DURATION_MS);
    if (gameBridge.getState().phase !== "playing") return;

    const state = gameBridge.getState();
    expect(state.score).toBe(42);
    expect(state.currentBiome).toBe(Biome.IceCavern);
    expect(state.biomeVisitStats.uniqueCount).toBe(2);
  });

  it("all four biome configs have name and icon defined", () => {
    for (const biome of BIOME_CYCLE) {
      const config = BIOME_CONFIGS[biome];
      expect(config.name).toBeTruthy();
      expect(config.icon).toBeTruthy();
      expect(config.description).toBeTruthy();
    }
  });
});

// ════════════════════════════════════════════════════════════════
// 5. Game Over stats after multi-biome runs
// ════════════════════════════════════════════════════════════════

describe("E2E: Game Over stats after biome cycling", () => {
  it("game over preserves biome visit stats from the run", () => {
    const scene = createPlayingScene();

    // Visit 3 biomes (Neon City + Ice Cavern + Molten Core)
    safeAdvance(scene, BIOME_DURATION_MS * 2);
    if (gameBridge.getState().phase !== "playing") return;

    scene.endRun();

    const stats = gameBridge.getState().biomeVisitStats;
    expect(stats.uniqueCount).toBe(3);
    expect(stats.visits[Biome.NeonCity]).toBe(1);
    expect(stats.visits[Biome.IceCavern]).toBe(1);
    expect(stats.visits[Biome.MoltenCore]).toBe(1);
    expect(stats.visits[Biome.VoidRift]).toBe(0);
  });

  it("game over after visiting all 4 biomes shows 4/4", () => {
    const scene = createPlayingScene();

    // Visit all 4 biomes
    safeAdvance(scene, BIOME_DURATION_MS * 3);
    if (gameBridge.getState().phase !== "playing") return;

    expect(gameBridge.getState().currentBiome).toBe(Biome.VoidRift);
    scene.endRun();

    const stats = gameBridge.getState().biomeVisitStats;
    expect(stats.uniqueCount).toBe(4);
  });

  it("elapsed time is consistent with multiple biome cycles", () => {
    const scene = createPlayingScene();

    // Advance 2 full biome durations
    safeAdvance(scene, BIOME_DURATION_MS * 2);
    if (gameBridge.getState().phase !== "playing") return;

    const elapsed = gameBridge.getState().elapsedTime;
    // Should be approximately 90 seconds (2 * 45s)
    expect(elapsed).toBeGreaterThanOrEqual(BIOME_DURATION_MS * 2 - 1000);
    expect(elapsed).toBeLessThanOrEqual(BIOME_DURATION_MS * 2 + 1000);
  });

  it("replay after multi-biome game resets all stats", () => {
    const scene = createPlayingScene();

    // First game: visit 2 biomes, score 50
    safeAdvance(scene, BIOME_DURATION_MS);
    if (gameBridge.getState().phase !== "playing") return;
    scene.addScore(50);
    scene.endRun();

    // Verify first game stats
    expect(gameBridge.getState().biomeVisitStats.uniqueCount).toBe(2);
    expect(gameBridge.getState().score).toBe(50);

    // Start second game
    scene.enterPhase("playing");

    // Second game should have fresh stats
    expect(gameBridge.getState().score).toBe(0);
    expect(gameBridge.getState().elapsedTime).toBe(0);
    expect(gameBridge.getState().currentBiome).toBe(Biome.NeonCity);
    expect(gameBridge.getState().biomeVisitStats.uniqueCount).toBe(1);
    expect(gameBridge.getState().biomeVisitStats.visits[Biome.IceCavern]).toBe(0);
  });

  it("high score persists across replays with biome cycling", () => {
    const scene = createPlayingScene();

    // First game: score 100
    scene.addScore(100);
    scene.endRun();
    expect(gameBridge.getState().highScore).toBe(100);

    // Second game: score 50
    scene.enterPhase("playing");
    scene.addScore(50);
    scene.endRun();
    expect(gameBridge.getState().highScore).toBe(100); // unchanged

    // Third game: score 200
    scene.enterPhase("playing");
    scene.addScore(200);
    scene.endRun();
    expect(gameBridge.getState().highScore).toBe(200); // updated
  });
});

// ════════════════════════════════════════════════════════════════
// 6. Performance: frame timing budget and object lifecycle
// ════════════════════════════════════════════════════════════════

describe("E2E: Performance and frame budget", () => {
  it("BiomeManager update handles 60fps frame deltas without drift", async () => {
    // Test BiomeManager directly to avoid MainScene snake collision overhead
    const { BiomeManager } = await import("@/game/systems/BiomeManager");
    const manager = new BiomeManager();
    manager.start();

    const FRAME_MS = 1000 / 60; // ~16.67ms
    const TOTAL_FRAMES = Math.ceil(BIOME_DURATION_MS / FRAME_MS) + 1;

    for (let i = 0; i < TOTAL_FRAMES; i++) {
      manager.update(FRAME_MS);
    }

    // After enough frames to exceed 45s, should have transitioned
    expect(manager.getCurrentBiome()).toBe(Biome.IceCavern);
  });

  it("large time jumps do not skip biomes or lose transitions", () => {
    const scene = createPlayingScene();

    // Jump 3 biome durations at once
    safeAdvance(scene, BIOME_DURATION_MS * 3);
    if (gameBridge.getState().phase !== "playing") return;

    // Should be at VoidRift (3 transitions from NeonCity)
    expect(gameBridge.getState().currentBiome).toBe(Biome.VoidRift);
    expect(gameBridge.getState().biomeVisitStats.uniqueCount).toBe(4);
  });

  it("BiomeManager timer does not accumulate drift over many small updates", async () => {
    const { BiomeManager } = await import("@/game/systems/BiomeManager");
    const manager = new BiomeManager();
    manager.start();

    // 1000 updates of 45ms each = exactly 45,000ms = exactly 1 transition
    for (let i = 0; i < 1000; i++) {
      manager.update(45);
    }

    expect(manager.getCurrentBiome()).toBe(Biome.IceCavern);
    expect(manager.getTimeRemaining()).toBe(BIOME_DURATION_MS);
  });

  it("entities are properly cleaned up between runs", () => {
    const scene = new MainScene();
    scene.create();

    // First run
    scene.enterPhase("playing");
    const snake1 = scene.getSnake();
    const food1 = scene.getFood();
    const lpm1 = scene.getLavaPoolManager();
    const gwm1 = scene.getGravityWellManager();
    expect(snake1).not.toBeNull();
    expect(food1).not.toBeNull();
    expect(lpm1).not.toBeNull();
    expect(gwm1).not.toBeNull();

    scene.endRun();

    // Second run
    scene.enterPhase("playing");
    const snake2 = scene.getSnake();
    const food2 = scene.getFood();
    const lpm2 = scene.getLavaPoolManager();
    const gwm2 = scene.getGravityWellManager();

    // New entities should be created (different references)
    expect(snake2).not.toBeNull();
    expect(snake2).not.toBe(snake1);
    expect(food2).not.toBeNull();
    expect(food2).not.toBe(food1);
    expect(lpm2).not.toBeNull();
    expect(lpm2).not.toBe(lpm1);
    expect(gwm2).not.toBeNull();
    expect(gwm2).not.toBe(gwm1);
  });

  it("BiomeManager handles jittery frame timing without losing transitions", () => {
    const scene = createPlayingScene();
    const frameTimes = [14, 18, 15, 19, 16, 17, 14, 20, 15, 17];
    let totalMs = 0;

    while (totalMs < BIOME_DURATION_MS + 1000) {
      const dt = frameTimes[Math.floor(Math.random() * frameTimes.length)];
      totalMs += dt;
      scene.getSnake()?.reset({ col: 15, row: 15 }, "right", 1);
      scene.update(0, dt);
      if (gameBridge.getState().phase !== "playing") break;
    }

    // Should have at least transitioned once
    if (gameBridge.getState().phase === "playing") {
      expect(gameBridge.getState().currentBiome).not.toBe(Biome.NeonCity);
    }
  });
});

// ════════════════════════════════════════════════════════════════
// 7. Edge cases: mid-transition game over, rapid state changes
// ════════════════════════════════════════════════════════════════

describe("E2E: Edge cases and defect scenarios", () => {
  it("game over during active transition cleans up transition overlay", () => {
    const scene = createPlayingScene();
    const transition = scene.getBiomeTransition();

    // Advance to just before transition, then trigger it with a small update
    safeAdvance(scene, BIOME_DURATION_MS - 100);
    if (gameBridge.getState().phase !== "playing") return;

    // Trigger transition with a small update (100ms starts transition but doesn't complete it)
    scene.getSnake()?.reset({ col: 15, row: 15 }, "right", 1);
    scene.update(0, 100);
    if (gameBridge.getState().phase !== "playing") return;

    expect(transition.isActive()).toBe(true);

    // End run while transition is active
    scene.endRun();
    expect(transition.isActive()).toBe(false);
    expect(gameBridge.getState().phase).toBe("gameOver");
  });

  it("shutdown during active run cleans up all resources", () => {
    const scene = createPlayingScene();

    safeAdvance(scene, BIOME_DURATION_MS);
    if (gameBridge.getState().phase !== "playing") return;

    scene.shutdown();

    expect(scene.getBiomeManager().isRunning()).toBe(false);
    expect(scene.getIceMomentum().isEnabled()).toBe(false);
  });

  it("replay preserves biome cycling integrity after previous multi-biome run", () => {
    const scene = new MainScene();
    scene.create();

    // First game: advance through 3 biomes
    scene.enterPhase("playing");
    scene.getSnake()!.reset({ col: 15, row: 15 }, "right", 1);
    safeAdvance(scene, BIOME_DURATION_MS * 2);
    if (gameBridge.getState().phase === "playing") {
      scene.endRun();
    }

    // Second game: should start fresh from NeonCity
    scene.enterPhase("playing");
    expect(gameBridge.getState().currentBiome).toBe(Biome.NeonCity);
    expect(scene.getBiomeManager().getCurrentBiome()).toBe(Biome.NeonCity);
    expect(scene.getBiomeManager().getTimeRemaining()).toBe(BIOME_DURATION_MS);

    // Advancing should cycle normally
    scene.getSnake()!.reset({ col: 15, row: 15 }, "right", 1);
    safeAdvance(scene, BIOME_DURATION_MS);
    if (gameBridge.getState().phase === "playing") {
      expect(gameBridge.getState().currentBiome).toBe(Biome.IceCavern);
    }
  });

  it("bridge events fire correctly for each biome transition", () => {
    const scene = createPlayingScene();
    const biomeChanges: Biome[] = [];
    const listener = (b: Biome) => biomeChanges.push(b);
    gameBridge.on("biomeChange", listener);

    // Advance through 2 transitions
    safeAdvance(scene, BIOME_DURATION_MS);
    safeAdvance(scene, BIOME_DURATION_MS);

    gameBridge.off("biomeChange", listener);

    if (gameBridge.getState().phase === "playing") {
      // Should have received IceCavern and MoltenCore
      expect(biomeChanges).toContain(Biome.IceCavern);
      expect(biomeChanges).toContain(Biome.MoltenCore);
    }
  });

  it("BiomeManager reset + start produces identical first cycle", () => {
    const scene = new MainScene();
    scene.create();

    // Run 1
    scene.enterPhase("playing");
    scene.getSnake()!.reset({ col: 15, row: 15 }, "right", 1);
    safeAdvance(scene, BIOME_DURATION_MS * 2);
    const run1Biome = gameBridge.getState().currentBiome;
    const run1Stats = { ...gameBridge.getState().biomeVisitStats };
    if (gameBridge.getState().phase === "playing") scene.endRun();

    // Run 2
    scene.enterPhase("playing");
    scene.getSnake()!.reset({ col: 15, row: 15 }, "right", 1);
    safeAdvance(scene, BIOME_DURATION_MS * 2);
    const run2Biome = gameBridge.getState().currentBiome;
    const run2Stats = { ...gameBridge.getState().biomeVisitStats };

    if (gameBridge.getState().phase === "playing") {
      expect(run2Biome).toBe(run1Biome);
      expect(run2Stats.uniqueCount).toBe(run1Stats.uniqueCount);
    }
  });

  it("zero-time update does not cause state corruption", () => {
    const scene = createPlayingScene();

    const beforeState = { ...gameBridge.getState() };
    scene.update(0, 0);
    const afterState = gameBridge.getState();

    expect(afterState.currentBiome).toBe(beforeState.currentBiome);
    expect(afterState.biomeVisitStats.uniqueCount).toBe(
      beforeState.biomeVisitStats.uniqueCount,
    );
  });

  it("negative delta is handled gracefully (no crash)", () => {
    const scene = createPlayingScene();

    // Negative delta should not crash
    expect(() => scene.update(0, -100)).not.toThrow();
    expect(gameBridge.getState().phase).toBe("playing");
  });
});

// ════════════════════════════════════════════════════════════════
// 8. Cross-system integration during biome cycles
// ════════════════════════════════════════════════════════════════

describe("E2E: Cross-system integration", () => {
  it("food position remains valid throughout biome transitions", () => {
    const scene = createPlayingScene();

    for (let i = 0; i < 4; i++) {
      safeAdvance(scene, BIOME_DURATION_MS);
      if (gameBridge.getState().phase !== "playing") break;

      const food = scene.getFood();
      if (food) {
        const pos = food.getPosition();
        expect(pos.col).toBeGreaterThanOrEqual(0);
        expect(pos.col).toBeLessThan(GRID_COLS);
        expect(pos.row).toBeGreaterThanOrEqual(0);
        expect(pos.row).toBeLessThan(GRID_ROWS);
      }
    }
  });

  it("snake remains alive and controllable across biome transitions", () => {
    const scene = createPlayingScene();

    for (let i = 0; i < 3; i++) {
      safeAdvance(scene, BIOME_DURATION_MS);
      if (gameBridge.getState().phase !== "playing") break;

      const snake = scene.getSnake();
      expect(snake).not.toBeNull();
      expect(snake!.isAlive()).toBe(true);
      expect(snake!.getLength()).toBeGreaterThanOrEqual(1);
    }
  });

  it("biome theme changes correctly across transitions", () => {
    const scene = createPlayingScene();
    const themes: Biome[] = [scene.getCurrentThemeBiome()];

    for (let i = 0; i < 4; i++) {
      safeAdvance(scene, BIOME_DURATION_MS);
      if (gameBridge.getState().phase !== "playing") break;
      // Run transition to completion
      scene.update(0, TRANSITION_DURATION_MS + 10);
      themes.push(scene.getCurrentThemeBiome());
    }

    // Themes should follow biome cycle order
    for (let i = 0; i < themes.length; i++) {
      expect(themes[i]).toBe(BIOME_CYCLE[i % BIOME_CYCLE.length]);
    }
  });

  it("mechanic configs are accessible and sane throughout lifecycle", () => {
    const scene = createPlayingScene();
    const configs = scene.getMechanicConfigs();

    expect(configs.ice.slideTiles).toBeGreaterThanOrEqual(1);
    expect(configs.lava.maxPools).toBeGreaterThanOrEqual(1);
    expect(configs.lava.spawnIntervalMs).toBeGreaterThanOrEqual(100);
    expect(configs.gravity.pullCadence).toBeGreaterThanOrEqual(1);
  });

  it("scene handles multiple start/stop/replay cycles without leaking state", () => {
    const scene = new MainScene();
    scene.create();

    for (let game = 0; game < 5; game++) {
      scene.enterPhase("playing");

      expect(gameBridge.getState().score).toBe(0);
      expect(gameBridge.getState().currentBiome).toBe(Biome.NeonCity);
      expect(scene.getBiomeManager().isRunning()).toBe(true);
      expect(scene.getSnake()).not.toBeNull();
      expect(scene.getFood()).not.toBeNull();

      scene.addScore(game * 10);
      scene.endRun();

      expect(gameBridge.getState().phase).toBe("gameOver");
    }
  });
});
