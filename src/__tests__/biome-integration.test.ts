import { describe, it, expect, vi, beforeEach } from "vitest";
import { gameBridge } from "@/game/bridge";
import { Biome, BIOME_DURATION_MS } from "@/game/systems/BiomeManager";

// ── Phaser mock ──────────────────────────────────────────────────
const mockDestroy = vi.fn();
const mockSetPosition = vi.fn();

function createMockSprite() {
  return {
    destroy: mockDestroy,
    setPosition: mockSetPosition,
    setTexture: vi.fn(),
    x: 0,
    y: 0,
  };
}

vi.mock("phaser", () => {
  class MockScene {
    scene = { start: vi.fn() };
    add = {
      graphics: () => ({
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
      }),
      sprite: vi.fn(() => createMockSprite()),
      particles: vi.fn(() => ({
        explode: vi.fn(),
        destroy: vi.fn(),
      })),
    };
    input = {
      keyboard: {
        on: vi.fn(),
        off: vi.fn(),
      },
    };
    cameras = {
      main: {
        shake: vi.fn(),
        setBackgroundColor: vi.fn(),
      },
    };
    textures = {
      exists: vi.fn().mockReturnValue(true),
    };
    time = {
      delayedCall: vi.fn(),
    };
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

// Spy on bridge methods
const spySetBiome = vi.spyOn(gameBridge, "setBiome");
const spySetBiomeTimeRemaining = vi.spyOn(gameBridge, "setBiomeTimeRemaining");
const spySetBiomeVisitStats = vi.spyOn(gameBridge, "setBiomeVisitStats");

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

beforeEach(() => {
  vi.clearAllMocks();
  resetBridge();
});

// ── BiomeManager integration with MainScene ─────────────────────

describe("MainScene – BiomeManager integration", () => {
  it("exposes a BiomeManager via getBiomeManager()", () => {
    const scene = new MainScene();
    expect(scene.getBiomeManager()).toBeDefined();
  });

  it("starts BiomeManager when entering 'playing' phase", () => {
    const scene = new MainScene();
    scene.create();
    expect(scene.getBiomeManager().isRunning()).toBe(false);

    scene.enterPhase("playing");
    expect(scene.getBiomeManager().isRunning()).toBe(true);
  });

  it("syncs initial biome state to bridge on startRun", () => {
    const scene = new MainScene();
    scene.create();
    spySetBiome.mockClear();
    spySetBiomeTimeRemaining.mockClear();
    spySetBiomeVisitStats.mockClear();

    scene.enterPhase("playing");

    expect(spySetBiome).toHaveBeenCalledWith(Biome.NeonCity);
    expect(spySetBiomeTimeRemaining).toHaveBeenCalledWith(BIOME_DURATION_MS);
    expect(spySetBiomeVisitStats).toHaveBeenCalled();

    // Bridge state should reflect initial biome
    const state = gameBridge.getState();
    expect(state.currentBiome).toBe(Biome.NeonCity);
    expect(state.biomeTimeRemaining).toBe(BIOME_DURATION_MS);
    expect(state.biomeVisitStats.uniqueCount).toBe(1);
    expect(state.biomeVisitStats.visits[Biome.NeonCity]).toBe(1);
  });

  it("resets BiomeManager between runs", () => {
    const scene = new MainScene();
    scene.create();

    // First run
    scene.enterPhase("playing");
    // Advance partway into the run
    scene.update(0, 10000);
    scene.endRun();

    // Second run
    scene.enterPhase("playing");
    expect(scene.getBiomeManager().getCurrentBiome()).toBe(Biome.NeonCity);
    expect(scene.getBiomeManager().getTimeRemaining()).toBe(BIOME_DURATION_MS);
  });

  it("advances biome timer during update loop", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    // Advance 10 seconds
    scene.update(0, 10000);

    const remaining = gameBridge.getState().biomeTimeRemaining;
    expect(remaining).toBe(BIOME_DURATION_MS - 10000);
  });

  it("does not advance biome timer when phase is not 'playing'", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.endRun();

    spySetBiomeTimeRemaining.mockClear();
    scene.update(0, 5000);

    expect(spySetBiomeTimeRemaining).not.toHaveBeenCalled();
  });

  it("transitions biome after 45 seconds", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    // Move snake to center with length 1 to avoid collision during the long update
    const snake = scene.getSnake()!;
    snake.reset({ col: 15, row: 15 }, "right", 1);

    // Advance exactly 45 seconds — this should trigger a biome transition
    scene.update(0, BIOME_DURATION_MS);

    expect(gameBridge.getState().currentBiome).toBe(Biome.IceCavern);
  });

  it("cycles through all four biomes", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;

    // We need to avoid wall collision, so reset to center before each big time advance
    const biomeOrder = [
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.MoltenCore,
      Biome.VoidRift,
      Biome.NeonCity, // wraps around
    ];

    expect(gameBridge.getState().currentBiome).toBe(biomeOrder[0]);

    for (let i = 1; i < biomeOrder.length; i++) {
      // Reset snake to center to avoid out-of-bounds death
      snake.reset({ col: 15, row: 15 }, "right", 1);
      scene.update(0, BIOME_DURATION_MS);

      if (gameBridge.getState().phase !== "playing") break;
      expect(gameBridge.getState().currentBiome).toBe(biomeOrder[i]);
    }
  });

  it("emits biomeChange event to bridge on transition", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.reset({ col: 15, row: 15 }, "right", 1);

    spySetBiome.mockClear();
    scene.update(0, BIOME_DURATION_MS);

    // Should have been called at least once with IceCavern
    expect(spySetBiome).toHaveBeenCalledWith(Biome.IceCavern);
  });
});

// ── Biome visit stats tracking ──────────────────────────────────

describe("MainScene – biome visit stats", () => {
  it("starts with 1 unique biome visited (NeonCity)", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const stats = gameBridge.getState().biomeVisitStats;
    expect(stats.uniqueCount).toBe(1);
    expect(stats.visits[Biome.NeonCity]).toBe(1);
  });

  it("increments visit count on biome transition", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.reset({ col: 15, row: 15 }, "right", 1);

    scene.update(0, BIOME_DURATION_MS);

    if (gameBridge.getState().phase === "playing") {
      const stats = gameBridge.getState().biomeVisitStats;
      expect(stats.uniqueCount).toBe(2);
      expect(stats.visits[Biome.IceCavern]).toBe(1);
    }
  });

  it("preserves final stats snapshot at endRun", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.reset({ col: 15, row: 15 }, "right", 1);
    scene.update(0, BIOME_DURATION_MS);

    if (gameBridge.getState().phase === "playing") {
      scene.endRun();

      const stats = gameBridge.getState().biomeVisitStats;
      expect(stats.uniqueCount).toBeGreaterThanOrEqual(2);
    }
  });

  it("resets stats between runs", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.reset({ col: 15, row: 15 }, "right", 1);
    scene.update(0, BIOME_DURATION_MS);

    if (gameBridge.getState().phase === "playing") {
      scene.endRun();
    }

    // Start a new run
    scene.enterPhase("playing");
    const stats = gameBridge.getState().biomeVisitStats;
    expect(stats.uniqueCount).toBe(1);
    expect(stats.visits[Biome.NeonCity]).toBe(1);
    expect(stats.visits[Biome.IceCavern]).toBe(0);
  });
});

// ── Bridge biome state ──────────────────────────────────────────

describe("GameBridge – biome state", () => {
  it("initial state includes biome fields", () => {
    const bridge = gameBridge;
    const state = bridge.getState();
    expect(state.currentBiome).toBe(Biome.NeonCity);
    expect(state.biomeTimeRemaining).toBe(0);
    expect(state.biomeVisitStats).toBeDefined();
  });

  it("setBiome updates state and emits event", () => {
    const listener = vi.fn();
    gameBridge.on("biomeChange", listener);
    gameBridge.setBiome(Biome.IceCavern);

    expect(gameBridge.getState().currentBiome).toBe(Biome.IceCavern);
    expect(listener).toHaveBeenCalledWith(Biome.IceCavern);

    gameBridge.off("biomeChange", listener);
  });

  it("setBiomeTimeRemaining updates state and emits event", () => {
    const listener = vi.fn();
    gameBridge.on("biomeTimeRemainingChange", listener);
    gameBridge.setBiomeTimeRemaining(30000);

    expect(gameBridge.getState().biomeTimeRemaining).toBe(30000);
    expect(listener).toHaveBeenCalledWith(30000);

    gameBridge.off("biomeTimeRemainingChange", listener);
  });

  it("setBiomeVisitStats updates state and emits event", () => {
    const listener = vi.fn();
    gameBridge.on("biomeVisitStatsChange", listener);
    const stats = {
      visits: {
        [Biome.NeonCity]: 2,
        [Biome.IceCavern]: 1,
        [Biome.MoltenCore]: 0,
        [Biome.VoidRift]: 0,
      },
      uniqueCount: 2,
    };
    gameBridge.setBiomeVisitStats(stats);

    expect(gameBridge.getState().biomeVisitStats).toEqual(stats);
    expect(listener).toHaveBeenCalledWith(stats);

    gameBridge.off("biomeVisitStatsChange", listener);
  });

  it("resetRun resets biome state", () => {
    gameBridge.setBiome(Biome.MoltenCore);
    gameBridge.setBiomeTimeRemaining(20000);
    gameBridge.setBiomeVisitStats({
      visits: {
        [Biome.NeonCity]: 1,
        [Biome.IceCavern]: 1,
        [Biome.MoltenCore]: 1,
        [Biome.VoidRift]: 0,
      },
      uniqueCount: 3,
    });

    gameBridge.resetRun();

    const state = gameBridge.getState();
    expect(state.currentBiome).toBe(Biome.NeonCity);
    expect(state.biomeTimeRemaining).toBe(0);
    expect(state.biomeVisitStats.uniqueCount).toBe(0);
  });

  it("resetRun emits biome events", () => {
    const biomeListener = vi.fn();
    const timeListener = vi.fn();
    const statsListener = vi.fn();

    gameBridge.on("biomeChange", biomeListener);
    gameBridge.on("biomeTimeRemainingChange", timeListener);
    gameBridge.on("biomeVisitStatsChange", statsListener);

    gameBridge.setBiome(Biome.VoidRift);
    biomeListener.mockClear();
    timeListener.mockClear();
    statsListener.mockClear();

    gameBridge.resetRun();

    expect(biomeListener).toHaveBeenCalledWith(Biome.NeonCity);
    expect(timeListener).toHaveBeenCalledWith(0);
    expect(statsListener).toHaveBeenCalled();

    gameBridge.off("biomeChange", biomeListener);
    gameBridge.off("biomeTimeRemainingChange", timeListener);
    gameBridge.off("biomeVisitStatsChange", statsListener);
  });
});

// ── MainScene shutdown cleanup ──────────────────────────────────

describe("MainScene – shutdown cleanup", () => {
  it("resets BiomeManager on shutdown", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    expect(scene.getBiomeManager().isRunning()).toBe(true);

    scene.shutdown();
    expect(scene.getBiomeManager().isRunning()).toBe(false);
  });
});
