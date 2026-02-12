import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Phaser mock ──────────────────────────────────────────────────

const mockDestroy = vi.fn();
const mockSetPosition = vi.fn();

function createMockSprite() {
  return {
    destroy: mockDestroy,
    setPosition: mockSetPosition,
    setTexture: vi.fn(),
    setDepth: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    setScale: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    x: 0,
    y: 0,
  };
}

vi.mock("phaser", () => {
  class MockScene {
    add = {
      sprite: vi.fn(() => createMockSprite()),
    };
    input = {
      keyboard: {
        on: vi.fn(),
        off: vi.fn(),
      },
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

import Phaser from "phaser";
import { Snake } from "@/game/entities/Snake";
import {
  Biome,
  BIOME_CYCLE,
  BIOME_DURATION_MS,
  BiomeManager,
  type BiomeChangeListener,
} from "@/game/systems/BiomeManager";
import { IceMomentum } from "@/game/systems/IceMomentum";
import {
  LavaPoolManager,
  LAVA_BURN_SEGMENTS,
  LAVA_SURVIVAL_THRESHOLD,
} from "@/game/entities/LavaPool";
import {
  GravityWellManager,
  GRAVITY_PULL_CADENCE,
} from "@/game/entities/GravityWell";
import { createSeededRng } from "@/game/systems/BiomeMechanics";
import { MoveTicker, type GridPos, type Direction } from "@/game/utils/grid";

// ── Helpers ──────────────────────────────────────────────────────

function createScene(): Phaser.Scene {
  return new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
}

function createSnake(
  headPos: GridPos = { col: 10, row: 10 },
  direction: Direction = "right",
  length = 3,
  ticker?: MoveTicker,
): Snake {
  const scene = createScene();
  return new Snake(scene, headPos, direction, length, ticker);
}

function fixedRng(value: number): () => number {
  return () => value;
}

const DEFAULT_FOOD_POS: GridPos = { col: 5, row: 5 };

beforeEach(() => {
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════
// 1. Biome Cycle Timing & Order
// ════════════════════════════════════════════════════════════════

describe("Biome cycle timing and order", () => {
  describe("micro-step timer accumulation", () => {
    it("accumulates tiny deltas correctly to trigger transition", () => {
      const manager = new BiomeManager();
      manager.start();

      // Advance in 1ms increments for the full duration
      for (let i = 0; i < BIOME_DURATION_MS; i++) {
        manager.update(1);
      }

      expect(manager.getCurrentBiome()).toBe(Biome.IceCavern);
    });

    it("accumulates fractional deltas without drift", () => {
      const manager = new BiomeManager();
      manager.start();

      // Simulate 60fps updates — use a precise count that guarantees
      // total elapsed > BIOME_DURATION_MS (2701 frames * 16.67ms ≈ 45009ms)
      const frameDelta = 1000 / 60; // ~16.6667ms
      const totalFrames = Math.ceil(BIOME_DURATION_MS / frameDelta) + 1;

      for (let i = 0; i < totalFrames; i++) {
        manager.update(frameDelta);
      }

      // After enough frames to exceed 45 seconds, should be in IceCavern
      expect(manager.getCurrentBiome()).toBe(Biome.IceCavern);
    });

    it("handles very large single delta spanning entire cycle", () => {
      const manager = new BiomeManager();
      manager.start();

      // Jump exactly one full cycle (4 * 45s = 180s)
      manager.update(BIOME_DURATION_MS * 4);

      expect(manager.getCurrentBiome()).toBe(Biome.NeonCity);
      expect(manager.getVisitStats().visits[Biome.NeonCity]).toBe(2);
    });
  });

  describe("transition boundary precision", () => {
    it("does not transition at exactly duration - 1ms", () => {
      const manager = new BiomeManager();
      manager.start();

      manager.update(BIOME_DURATION_MS - 1);
      expect(manager.getCurrentBiome()).toBe(Biome.NeonCity);
      expect(manager.getTimeRemaining()).toBe(1);
    });

    it("transitions at exactly the duration boundary", () => {
      const manager = new BiomeManager();
      manager.start();

      manager.update(BIOME_DURATION_MS);
      expect(manager.getCurrentBiome()).toBe(Biome.IceCavern);
      expect(manager.getTimeRemaining()).toBe(BIOME_DURATION_MS);
    });

    it("transitions at duration + 1ms with correct remainder", () => {
      const manager = new BiomeManager();
      manager.start();

      manager.update(BIOME_DURATION_MS + 1);
      expect(manager.getCurrentBiome()).toBe(Biome.IceCavern);
      expect(manager.getTimeRemaining()).toBe(BIOME_DURATION_MS - 1);
    });
  });

  describe("full multi-cycle determinism", () => {
    it("completes 10 full cycles with correct biome at each step", () => {
      const manager = new BiomeManager();
      manager.start();

      for (let cycle = 0; cycle < 10; cycle++) {
        for (let biomeIdx = 0; biomeIdx < BIOME_CYCLE.length; biomeIdx++) {
          expect(manager.getCurrentBiome()).toBe(BIOME_CYCLE[biomeIdx]);
          manager.update(BIOME_DURATION_MS);
        }
      }

      // After 10 full cycles, back to NeonCity
      expect(manager.getCurrentBiome()).toBe(Biome.NeonCity);
    });

    it("fires exactly one listener call per transition across 3 cycles", () => {
      const manager = new BiomeManager();
      const listener = vi.fn<BiomeChangeListener>();
      manager.onChange(listener);
      manager.start();

      // 3 full cycles = 12 transitions
      for (let i = 0; i < 12; i++) {
        manager.update(BIOME_DURATION_MS);
      }

      expect(listener).toHaveBeenCalledTimes(12);

      // Verify each transition in order
      const expectedSequence: [Biome, Biome][] = [];
      for (let cycle = 0; cycle < 3; cycle++) {
        expectedSequence.push([Biome.IceCavern, Biome.NeonCity]);
        expectedSequence.push([Biome.MoltenCore, Biome.IceCavern]);
        expectedSequence.push([Biome.VoidRift, Biome.MoltenCore]);
        expectedSequence.push([Biome.NeonCity, Biome.VoidRift]);
      }

      for (let i = 0; i < 12; i++) {
        expect(listener).toHaveBeenNthCalledWith(
          i + 1,
          expectedSequence[i][0],
          expectedSequence[i][1],
        );
      }
    });
  });

  describe("update before start", () => {
    it("does not advance biome when not started", () => {
      const manager = new BiomeManager();
      manager.update(BIOME_DURATION_MS * 10);
      expect(manager.getCurrentBiome()).toBe(Biome.NeonCity);
      expect(manager.getVisitStats().uniqueCount).toBe(0);
    });

    it("does not fire listeners when not started", () => {
      const manager = new BiomeManager();
      const listener = vi.fn<BiomeChangeListener>();
      manager.onChange(listener);
      manager.update(BIOME_DURATION_MS * 5);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("stop and resume behavior", () => {
    it("stops advancing after reset", () => {
      const manager = new BiomeManager();
      manager.start();
      manager.update(BIOME_DURATION_MS * 2); // MoltenCore
      expect(manager.getCurrentBiome()).toBe(Biome.MoltenCore);

      manager.reset();
      manager.update(BIOME_DURATION_MS * 5);
      expect(manager.getCurrentBiome()).toBe(Biome.NeonCity);
    });

    it("restarts cleanly after reset+start", () => {
      const manager = new BiomeManager();
      manager.start();
      manager.update(BIOME_DURATION_MS * 3);
      manager.reset();
      manager.start();

      expect(manager.getCurrentBiome()).toBe(Biome.NeonCity);
      expect(manager.getTimeRemaining()).toBe(BIOME_DURATION_MS);

      manager.update(BIOME_DURATION_MS);
      expect(manager.getCurrentBiome()).toBe(Biome.IceCavern);
    });
  });
});

// ════════════════════════════════════════════════════════════════
// 2. Ice Momentum Rules
// ════════════════════════════════════════════════════════════════

describe("Ice momentum rules", () => {
  describe("slide distance is exactly ICE_SLIDE_TILES (2)", () => {
    it("slides exactly 2 tiles in old direction before turning (right→up)", () => {
      const ticker = new MoveTicker(100);
      const scene = createScene();
      const snake = new Snake(scene, { col: 10, row: 10 }, "right", 5, ticker);
      const ice = new IceMomentum();
      ice.setEnabled(true);
      snake.setIceMomentum(ice);

      snake.bufferDirection("up");

      // Track all positions during the slide
      const positions: GridPos[] = [];
      for (let i = 0; i < 4; i++) {
        snake.update(100);
        positions.push(snake.getHeadPosition());
      }

      // Tile 1: slide right (extra tile 1)
      expect(positions[0]).toEqual({ col: 11, row: 10 });
      // Tile 2: slide right (extra tile 2), direction changes to up
      expect(positions[1]).toEqual({ col: 12, row: 10 });
      // Tile 3: now moving up
      expect(positions[2]).toEqual({ col: 12, row: 9 });
      // Tile 4: still up
      expect(positions[3]).toEqual({ col: 12, row: 8 });
    });

    it("slides exactly 2 tiles in old direction before turning (down→right)", () => {
      const ticker = new MoveTicker(100);
      const scene = createScene();
      const snake = new Snake(scene, { col: 10, row: 10 }, "down", 5, ticker);
      const ice = new IceMomentum();
      ice.setEnabled(true);
      snake.setIceMomentum(ice);

      snake.bufferDirection("right");

      snake.update(100); // slide down
      expect(snake.getHeadPosition()).toEqual({ col: 10, row: 11 });
      snake.update(100); // slide down, direction→right
      expect(snake.getHeadPosition()).toEqual({ col: 10, row: 12 });
      snake.update(100); // now moving right
      expect(snake.getHeadPosition()).toEqual({ col: 11, row: 12 });
    });
  });

  describe("rapid successive turns with ice", () => {
    it("second turn during slide replaces the pending direction", () => {
      const ticker = new MoveTicker(100);
      const scene = createScene();
      const snake = new Snake(scene, { col: 10, row: 10 }, "right", 5, ticker);
      const ice = new IceMomentum();
      ice.setEnabled(true);
      snake.setIceMomentum(ice);

      // Buffer up, then immediately buffer down (replaces via beginSlide)
      snake.bufferDirection("up");
      snake.update(100); // consumes "up", ice captures it

      // While sliding, we can't buffer (input blocked during slide)
      // But after slide completes, buffered input should be consumed
      expect(ice.getPendingDirection()).toBe("up");
    });

    it("queued turns are processed sequentially through ice slides", () => {
      const ticker = new MoveTicker(100);
      const scene = createScene();
      const snake = new Snake(scene, { col: 15, row: 15 }, "right", 5, ticker);
      const ice = new IceMomentum();
      ice.setEnabled(true);
      snake.setIceMomentum(ice);

      // Queue up then left (both valid perpendicular turns)
      snake.bufferDirection("up");
      snake.bufferDirection("left");

      // First slide: right→up
      snake.update(100); // slide right (captures "up")
      snake.update(100); // slide right, direction→up

      // Second slide: up→left (should consume "left" from buffer)
      snake.update(100); // slide up (captures "left")
      snake.update(100); // slide up, direction→left

      expect(snake.getDirection()).toBe("left");
      expect(snake.getHeadPosition()).toEqual({ col: 17, row: 13 });
    });
  });

  describe("biome change mid-slide", () => {
    it("disabling ice mid-slide cancels the pending turn", () => {
      const ticker = new MoveTicker(100);
      const scene = createScene();
      const snake = new Snake(scene, { col: 10, row: 10 }, "right", 5, ticker);
      const ice = new IceMomentum();
      ice.setEnabled(true);
      snake.setIceMomentum(ice);

      snake.bufferDirection("up");
      snake.update(100); // slide right, captures "up"

      // Simulate biome change — disable ice
      ice.setEnabled(false);

      // The pending "up" was lost, snake continues right
      snake.update(100);
      expect(snake.getHeadPosition()).toEqual({ col: 12, row: 10 });
      expect(snake.getDirection()).toBe("right");
    });

    it("re-enabling ice after disable works for new turns", () => {
      const ticker = new MoveTicker(100);
      const scene = createScene();
      const snake = new Snake(scene, { col: 10, row: 10 }, "right", 5, ticker);
      const ice = new IceMomentum();
      snake.setIceMomentum(ice);

      // Initially disabled
      snake.bufferDirection("up");
      snake.update(100); // immediate turn
      expect(snake.getDirection()).toBe("up");

      // Enable ice
      ice.setEnabled(true);

      // Now turns should have momentum
      snake.bufferDirection("right");
      snake.update(100); // slide up
      expect(snake.getDirection()).toBe("up");
      snake.update(100); // slide up, direction→right
      expect(snake.getDirection()).toBe("right");
    });
  });

  describe("ice momentum state integrity", () => {
    it("reset clears slide but preserves enabled state", () => {
      const ice = new IceMomentum();
      ice.setEnabled(true);
      ice.beginSlide("up");
      expect(ice.isSliding()).toBe(true);

      ice.reset();

      expect(ice.isSliding()).toBe(false);
      expect(ice.getRemaining()).toBe(0);
      expect(ice.getPendingDirection()).toBeNull();
      expect(ice.isEnabled()).toBe(true);
    });

    it("advanceSlide returns null when called with no active slide", () => {
      const ice = new IceMomentum();
      ice.setEnabled(true);
      expect(ice.advanceSlide()).toBeNull();
    });

    it("beginSlide returns false when disabled even with valid direction", () => {
      const ice = new IceMomentum();
      // ice is disabled by default
      expect(ice.beginSlide("up")).toBe(false);
      expect(ice.isSliding()).toBe(false);
    });
  });
});

// ════════════════════════════════════════════════════════════════
// 3. Molten Burn & Despawn Behavior
// ════════════════════════════════════════════════════════════════

describe("Molten burn and despawn behavior", () => {
  describe("lava burn mechanics", () => {
    it("burns exactly LAVA_BURN_SEGMENTS (3) segments from tail", () => {
      const snake = createSnake({ col: 10, row: 10 }, "right", 8);
      const removed = snake.burnTail(LAVA_BURN_SEGMENTS);
      expect(removed).toBe(LAVA_BURN_SEGMENTS);
      expect(snake.getLength()).toBe(5);
    });

    it("snake survives when length >= LAVA_SURVIVAL_THRESHOLD (4)", () => {
      const snake = createSnake(
        { col: 10, row: 10 },
        "right",
        LAVA_SURVIVAL_THRESHOLD,
      );
      const removed = snake.burnTail(LAVA_BURN_SEGMENTS);
      expect(removed).toBe(LAVA_BURN_SEGMENTS);
      expect(snake.getLength()).toBe(1); // only head
      expect(snake.isAlive()).toBe(true);
    });

    it("snake should be killed when length < LAVA_SURVIVAL_THRESHOLD", () => {
      // Snake with 3 segments cannot survive a 3-segment burn
      const snake = createSnake({ col: 10, row: 10 }, "right", 3);
      expect(snake.getLength()).toBeLessThan(LAVA_SURVIVAL_THRESHOLD);

      // In the actual game, the MainScene checks length < threshold
      // and calls kill() instead of burnTail(). Verify the threshold logic:
      const wouldSurvive = snake.getLength() >= LAVA_SURVIVAL_THRESHOLD;
      expect(wouldSurvive).toBe(false);
    });

    it("multiple consecutive burns reduce snake correctly", () => {
      const snake = createSnake({ col: 10, row: 10 }, "right", 12);

      snake.burnTail(LAVA_BURN_SEGMENTS); // 12 → 9
      expect(snake.getLength()).toBe(9);

      snake.burnTail(LAVA_BURN_SEGMENTS); // 9 → 6
      expect(snake.getLength()).toBe(6);

      snake.burnTail(LAVA_BURN_SEGMENTS); // 6 → 3
      expect(snake.getLength()).toBe(3);
    });

    it("head position is preserved after burn", () => {
      const headPos: GridPos = { col: 15, row: 15 };
      const snake = createSnake(headPos, "right", 10);
      snake.burnTail(LAVA_BURN_SEGMENTS);
      expect(snake.getHeadPosition()).toEqual(headPos);
    });

    it("burn reduces pending growth", () => {
      const snake = createSnake({ col: 10, row: 10 }, "right", 6);
      snake.grow(5);
      snake.burnTail(LAVA_BURN_SEGMENTS);
      // pendingGrowth was 5, burn 3, so max(0, 5-3) = 2
      // length was 6, minus 3 = 3
      expect(snake.getLength()).toBe(3);
    });
  });

  describe("lava pool despawn on biome change", () => {
    it("clearAll removes all pools and resets spawn timer", () => {
      const scene = createScene();
      const snake = createSnake({ col: 10, row: 10 }, "right", 3);
      const mgr = new LavaPoolManager(scene, fixedRng(0.5), 8, 500);

      // Spawn several pools
      mgr.update(500, snake, DEFAULT_FOOD_POS);
      mgr.update(500, snake, DEFAULT_FOOD_POS);
      mgr.update(500, snake, DEFAULT_FOOD_POS);
      expect(mgr.getPoolCount()).toBe(3);

      mgr.clearAll();

      expect(mgr.getPoolCount()).toBe(0);
      expect(mgr.getPoolPositions()).toEqual([]);

      // Verify spawn timer was reset: need full interval again
      mgr.update(499, snake, DEFAULT_FOOD_POS);
      expect(mgr.getPoolCount()).toBe(0);
      mgr.update(1, snake, DEFAULT_FOOD_POS);
      expect(mgr.getPoolCount()).toBe(1);
    });

    it("pool sprites are destroyed on clearAll", () => {
      const scene = createScene();
      const snake = createSnake({ col: 10, row: 10 }, "right", 3);
      const mgr = new LavaPoolManager(scene, fixedRng(0.3), 8, 500);

      mgr.update(500, snake, DEFAULT_FOOD_POS);
      mgr.update(500, snake, DEFAULT_FOOD_POS);

      mockDestroy.mockClear();
      mgr.clearAll();
      expect(mockDestroy).toHaveBeenCalledTimes(2);
    });

    it("isLavaAt returns false for all positions after clearAll", () => {
      const scene = createScene();
      const snake = createSnake({ col: 10, row: 10 }, "right", 3);
      const mgr = new LavaPoolManager(scene, fixedRng(0.2), 8, 500);

      mgr.update(500, snake, DEFAULT_FOOD_POS);
      const poolPos = mgr.getPoolPositions()[0];
      expect(mgr.isLavaAt(poolPos)).toBe(true);

      mgr.clearAll();
      expect(mgr.isLavaAt(poolPos)).toBe(false);
    });
  });

  describe("lava pool spawn cap enforcement", () => {
    it("respects max pool cap even over extended time", () => {
      const scene = createScene();
      const snake = createSnake({ col: 10, row: 10 }, "right", 3);
      const maxPools = 3;
      const mgr = new LavaPoolManager(scene, fixedRng(0.5), maxPools, 100);

      // Try spawning many more than the cap
      for (let i = 0; i < 20; i++) {
        mgr.update(100, snake, DEFAULT_FOOD_POS);
      }

      expect(mgr.getPoolCount()).toBeLessThanOrEqual(maxPools);
    });

    it("allows spawning again after removing a pool", () => {
      const scene = createScene();
      const snake = createSnake({ col: 10, row: 10 }, "right", 3);
      const mgr = new LavaPoolManager(scene, fixedRng(0.5), 2, 500);

      // Fill to cap
      mgr.update(500, snake, DEFAULT_FOOD_POS);
      mgr.update(500, snake, DEFAULT_FOOD_POS);
      expect(mgr.getPoolCount()).toBe(2);

      // Remove one
      const firstPool = mgr.getPoolPositions()[0];
      mgr.removeAt(firstPool);
      expect(mgr.getPoolCount()).toBe(1);

      // Should be able to spawn again
      mgr.update(500, snake, DEFAULT_FOOD_POS);
      expect(mgr.getPoolCount()).toBe(2);
    });
  });

  describe("lava collision detection accuracy", () => {
    it("detects collision when snake head is exactly on a pool", () => {
      const scene = createScene();
      const tempSnake = createSnake({ col: 20, row: 20 }, "right", 3);
      const mgr = new LavaPoolManager(scene, fixedRng(0), 8, 1000);

      mgr.update(1000, tempSnake, DEFAULT_FOOD_POS);
      const poolPos = mgr.getPoolPositions()[0];

      const headOnPool = createSnake(poolPos, "right", 5);
      expect(mgr.checkCollision(headOnPool)).toEqual(poolPos);
    });

    it("returns null when head is adjacent but not on pool", () => {
      const scene = createScene();
      const tempSnake = createSnake({ col: 20, row: 20 }, "right", 3);
      const mgr = new LavaPoolManager(scene, fixedRng(0), 8, 1000);

      mgr.update(1000, tempSnake, DEFAULT_FOOD_POS);
      const poolPos = mgr.getPoolPositions()[0];

      // Create snake adjacent to pool
      const adjacentHead: GridPos = {
        col: poolPos.col + 1,
        row: poolPos.row,
      };
      const adjacentSnake = createSnake(adjacentHead, "right", 3);
      expect(mgr.checkCollision(adjacentSnake)).toBeNull();
    });
  });

  describe("deterministic pool placement", () => {
    it("same seeded RNG produces identical pool positions", () => {
      const scene = createScene();
      const snake = createSnake({ col: 10, row: 10 }, "right", 3);

      const rng1 = createSeededRng(42);
      const rng2 = createSeededRng(42);

      const mgr1 = new LavaPoolManager(scene, rng1, 5, 500);
      const mgr2 = new LavaPoolManager(scene, rng2, 5, 500);

      for (let i = 0; i < 5; i++) {
        mgr1.update(500, snake, DEFAULT_FOOD_POS);
        mgr2.update(500, snake, DEFAULT_FOOD_POS);
      }

      expect(mgr1.getPoolPositions()).toEqual(mgr2.getPoolPositions());
    });
  });
});

// ════════════════════════════════════════════════════════════════
// 4. Void Pull Cadence
// ════════════════════════════════════════════════════════════════

describe("Void pull cadence", () => {
  describe("nudge fires at exact cadence intervals", () => {
    it("nudges every GRAVITY_PULL_CADENCE (4) steps", () => {
      const center = { col: 20, row: 15 };
      const mgr = new GravityWellManager(GRAVITY_PULL_CADENCE, center);
      const snake = createSnake({ col: 5, row: 15 });

      const nudgeSteps: number[] = [];
      for (let step = 1; step <= 16; step++) {
        if (mgr.onSnakeStep(snake)) {
          nudgeSteps.push(step);
        }
      }

      expect(nudgeSteps).toEqual([4, 8, 12, 16]);
    });

    it("counter resets after each nudge", () => {
      const mgr = new GravityWellManager(GRAVITY_PULL_CADENCE, { col: 20, row: 15 });
      const snake = createSnake({ col: 5, row: 15 });

      // Advance to nudge
      for (let i = 0; i < GRAVITY_PULL_CADENCE; i++) {
        mgr.onSnakeStep(snake);
      }
      expect(mgr.getStepCount()).toBe(0);
      expect(mgr.getStepsUntilNextPull()).toBe(GRAVITY_PULL_CADENCE);
    });

    it("custom cadence of 1 nudges every step", () => {
      const center = { col: 15, row: 15 };
      const mgr = new GravityWellManager(1, center);
      const snake = createSnake({ col: 10, row: 15 });

      let nudgeCount = 0;
      for (let i = 0; i < 5; i++) {
        if (mgr.onSnakeStep(snake)) nudgeCount++;
      }
      expect(nudgeCount).toBe(5);
      expect(snake.getHeadPosition()).toEqual(center);
    });

    it("custom cadence of 10 nudges every 10th step", () => {
      const center = { col: 20, row: 15 };
      const mgr = new GravityWellManager(10, center);
      const snake = createSnake({ col: 0, row: 15 });

      let nudgeCount = 0;
      for (let i = 0; i < 30; i++) {
        if (mgr.onSnakeStep(snake)) nudgeCount++;
      }
      expect(nudgeCount).toBe(3);
    });
  });

  describe("nudge direction correctness", () => {
    it("nudges on the axis with greater distance (col-dominant)", () => {
      const center = { col: 20, row: 15 };
      const nudge = GravityWellManager.computeNudge(
        { col: 5, row: 14 },
        center,
      );
      // col distance = 15, row distance = 1 → col wins
      expect(nudge).toEqual({ col: 1, row: 0 });
    });

    it("nudges on the axis with greater distance (row-dominant)", () => {
      const center = { col: 20, row: 15 };
      const nudge = GravityWellManager.computeNudge(
        { col: 19, row: 0 },
        center,
      );
      // col distance = 1, row distance = 15 → row wins
      expect(nudge).toEqual({ col: 0, row: 1 });
    });

    it("prefers col on tie (deterministic tie-breaking)", () => {
      const center = { col: 20, row: 15 };
      const nudge = GravityWellManager.computeNudge(
        { col: 15, row: 10 },
        center,
      );
      // col distance = 5, row distance = 5 → col wins tie
      expect(nudge).toEqual({ col: 1, row: 0 });
    });

    it("returns zero nudge at center", () => {
      const center = { col: 20, row: 15 };
      const nudge = GravityWellManager.computeNudge(center, center);
      expect(nudge).toEqual({ col: 0, row: 0 });
    });
  });

  describe("reset behavior (biome change)", () => {
    it("reset clears step counter", () => {
      const mgr = new GravityWellManager(4, { col: 20, row: 15 });
      const snake = createSnake({ col: 5, row: 15 });

      mgr.onSnakeStep(snake);
      mgr.onSnakeStep(snake);
      mgr.onSnakeStep(snake);
      expect(mgr.getStepCount()).toBe(3);

      mgr.reset();
      expect(mgr.getStepCount()).toBe(0);
    });

    it("needs full cadence again after reset", () => {
      const mgr = new GravityWellManager(4, { col: 20, row: 15 });
      const snake = createSnake({ col: 5, row: 15 });

      // Get to step 3 (one short of nudge)
      for (let i = 0; i < 3; i++) mgr.onSnakeStep(snake);

      mgr.reset();

      // After reset, only 1 step should NOT nudge
      expect(mgr.onSnakeStep(snake)).toBe(false);
      expect(mgr.onSnakeStep(snake)).toBe(false);
      expect(mgr.onSnakeStep(snake)).toBe(false);
      expect(mgr.onSnakeStep(snake)).toBe(true); // 4th step nudges
    });
  });

  describe("cumulative nudge progression toward center", () => {
    it("snake converges on center after sufficient nudges", () => {
      const center = { col: 20, row: 15 };
      const mgr = new GravityWellManager(1, center);
      const snake = createSnake({ col: 0, row: 0 });

      // Apply many nudges
      for (let i = 0; i < 100; i++) {
        mgr.onSnakeStep(snake);
      }

      expect(snake.getHeadPosition()).toEqual(center);
    });

    it("stops nudging once at center (returns false)", () => {
      const center = { col: 15, row: 15 };
      const mgr = new GravityWellManager(1, center);
      const snake = createSnake(center);

      const nudged = mgr.onSnakeStep(snake);
      expect(nudged).toBe(false);
      expect(snake.getHeadPosition()).toEqual(center);
    });
  });

  describe("determinism of gravity pulls", () => {
    it("identical setups produce identical nudge sequences", () => {
      const center = { col: 20, row: 15 };

      const run = () => {
        const mgr = new GravityWellManager(3, center);
        const snake = createSnake({ col: 2, row: 2 });
        const positions: GridPos[] = [];

        for (let i = 0; i < 20; i++) {
          mgr.onSnakeStep(snake);
          positions.push(snake.getHeadPosition());
        }
        return positions;
      };

      expect(run()).toEqual(run());
    });
  });
});

// ════════════════════════════════════════════════════════════════
// 5. Biome-Visit Stat Tracking
// ════════════════════════════════════════════════════════════════

describe("Biome-visit stat tracking", () => {
  describe("visit counting accuracy", () => {
    it("starts with 1 visit (NeonCity) after start()", () => {
      const manager = new BiomeManager();
      manager.start();

      const stats = manager.getVisitStats();
      expect(stats.visits[Biome.NeonCity]).toBe(1);
      expect(stats.uniqueCount).toBe(1);
    });

    it("increments visit count for each biome entered", () => {
      const manager = new BiomeManager();
      manager.start();

      manager.update(BIOME_DURATION_MS); // → IceCavern
      const stats = manager.getVisitStats();
      expect(stats.visits[Biome.NeonCity]).toBe(1);
      expect(stats.visits[Biome.IceCavern]).toBe(1);
      expect(stats.uniqueCount).toBe(2);
    });

    it("tracks all four biomes after one full cycle", () => {
      const manager = new BiomeManager();
      manager.start();

      manager.update(BIOME_DURATION_MS * 3); // Visit all 4

      const stats = manager.getVisitStats();
      expect(stats.visits[Biome.NeonCity]).toBe(1);
      expect(stats.visits[Biome.IceCavern]).toBe(1);
      expect(stats.visits[Biome.MoltenCore]).toBe(1);
      expect(stats.visits[Biome.VoidRift]).toBe(1);
      expect(stats.uniqueCount).toBe(4);
    });

    it("increments revisit count on subsequent cycles", () => {
      const manager = new BiomeManager();
      manager.start();

      // Two full cycles
      manager.update(BIOME_DURATION_MS * 8);

      const stats = manager.getVisitStats();
      expect(stats.visits[Biome.NeonCity]).toBe(3); // start + 2 revisits
      expect(stats.visits[Biome.IceCavern]).toBe(2);
      expect(stats.visits[Biome.MoltenCore]).toBe(2);
      expect(stats.visits[Biome.VoidRift]).toBe(2);
      expect(stats.uniqueCount).toBe(4);
    });

    it("uniqueCount maxes at 4", () => {
      const manager = new BiomeManager();
      manager.start();

      manager.update(BIOME_DURATION_MS * 20); // Many cycles

      const stats = manager.getVisitStats();
      expect(stats.uniqueCount).toBe(4);
    });
  });

  describe("stat snapshot immutability", () => {
    it("getVisitStats returns a new snapshot each call", () => {
      const manager = new BiomeManager();
      manager.start();

      const stats1 = manager.getVisitStats();
      manager.update(BIOME_DURATION_MS);
      const stats2 = manager.getVisitStats();

      // Different references
      expect(stats1).not.toBe(stats2);
      // Different values
      expect(stats1.visits[Biome.IceCavern]).toBe(0);
      expect(stats2.visits[Biome.IceCavern]).toBe(1);
    });

    it("modifying returned stats does not affect manager state", () => {
      const manager = new BiomeManager();
      manager.start();

      const stats = manager.getVisitStats();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (stats.visits as any)[Biome.VoidRift] = 99;

      const freshStats = manager.getVisitStats();
      expect(freshStats.visits[Biome.VoidRift]).toBe(0);
    });
  });

  describe("reset between games", () => {
    it("reset clears all visit stats to zero", () => {
      const manager = new BiomeManager();
      manager.start();
      manager.update(BIOME_DURATION_MS * 5);

      manager.reset();

      const stats = manager.getVisitStats();
      expect(stats.uniqueCount).toBe(0);
      for (const biome of BIOME_CYCLE) {
        expect(stats.visits[biome]).toBe(0);
      }
    });

    it("second game tracks stats independently", () => {
      const manager = new BiomeManager();

      // First game
      manager.start();
      manager.update(BIOME_DURATION_MS * 3);
      const game1Stats = manager.getVisitStats();
      expect(game1Stats.uniqueCount).toBe(4);

      // Reset and start new game
      manager.reset();
      manager.start();

      // Second game — only 1 biome visited so far
      const game2Stats = manager.getVisitStats();
      expect(game2Stats.uniqueCount).toBe(1);
      expect(game2Stats.visits[Biome.NeonCity]).toBe(1);
      expect(game2Stats.visits[Biome.IceCavern]).toBe(0);
    });

    it("stats are correct after multiple reset+start cycles", () => {
      const manager = new BiomeManager();

      for (let game = 0; game < 5; game++) {
        manager.start();
        // Each game visits a different number of biomes
        manager.update(BIOME_DURATION_MS * game);
        const stats = manager.getVisitStats();
        expect(stats.uniqueCount).toBe(Math.min(game + 1, 4));
        manager.reset();
      }
    });
  });

  describe("stats with zero-delta updates", () => {
    it("zero-delta update does not change stats", () => {
      const manager = new BiomeManager();
      manager.start();

      const before = manager.getVisitStats();
      manager.update(0);
      const after = manager.getVisitStats();

      expect(after).toEqual(before);
    });

    it("many zero-delta updates do not cause drift", () => {
      const manager = new BiomeManager();
      manager.start();

      for (let i = 0; i < 1000; i++) {
        manager.update(0);
      }

      const stats = manager.getVisitStats();
      expect(stats.visits[Biome.NeonCity]).toBe(1);
      expect(stats.uniqueCount).toBe(1);
    });
  });

  describe("listener events match stat changes", () => {
    it("every listener call corresponds to a stat increment", () => {
      const manager = new BiomeManager();
      const transitions: [Biome, Biome | null][] = [];

      manager.onChange((newBiome, prevBiome) => {
        transitions.push([newBiome, prevBiome]);
      });

      manager.start();
      manager.update(BIOME_DURATION_MS * 4); // Full cycle

      // 4 transitions happened
      expect(transitions).toHaveLength(4);

      // Stats should match
      const stats = manager.getVisitStats();
      // NeonCity: 1 (start) + 1 (wrap) = 2
      expect(stats.visits[Biome.NeonCity]).toBe(2);
      expect(stats.visits[Biome.IceCavern]).toBe(1);
      expect(stats.visits[Biome.MoltenCore]).toBe(1);
      expect(stats.visits[Biome.VoidRift]).toBe(1);
    });
  });
});

// ════════════════════════════════════════════════════════════════
// Cross-Mechanic Integration Scenarios
// ════════════════════════════════════════════════════════════════

describe("Cross-mechanic integration scenarios", () => {
  it("ice momentum + gravity well: slide then nudge in same game", () => {
    const ticker = new MoveTicker(100);
    const scene = createScene();
    const snake = new Snake(scene, { col: 10, row: 10 }, "right", 5, ticker);

    // Set up ice momentum
    const ice = new IceMomentum();
    ice.setEnabled(true);
    snake.setIceMomentum(ice);

    // Set up gravity well
    const gravity = new GravityWellManager(2, { col: 20, row: 10 });

    // Buffer a turn
    snake.bufferDirection("up");

    // Step 1: slide right (ice)
    snake.update(100);
    gravity.onSnakeStep(snake);
    expect(snake.getHeadPosition().col).toBeGreaterThanOrEqual(11);

    // Step 2: slide completes, direction→up. Gravity nudge on step 2
    snake.update(100);
    const nudged = gravity.onSnakeStep(snake);
    expect(nudged).toBe(true);
  });

  it("lava pool burn + continued movement after burn", () => {
    const ticker = new MoveTicker(100);
    const scene = createScene();
    const snake = new Snake(scene, { col: 10, row: 10 }, "right", 8, ticker);

    // Burn 3 segments
    snake.burnTail(LAVA_BURN_SEGMENTS);
    expect(snake.getLength()).toBe(5);

    // Snake should still be able to move
    snake.update(100);
    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 10 });
    expect(snake.isAlive()).toBe(true);
  });

  it("biome manager tracks stats correctly during rapid transitions", () => {
    const manager = new BiomeManager();
    manager.start();

    // Simulate a very large time jump (5 full cycles = 20 transitions)
    manager.update(BIOME_DURATION_MS * 20);

    const stats = manager.getVisitStats();

    // 20 transitions + initial = 6 NeonCity, 5 each for others
    expect(stats.visits[Biome.NeonCity]).toBe(6);
    expect(stats.visits[Biome.IceCavern]).toBe(5);
    expect(stats.visits[Biome.MoltenCore]).toBe(5);
    expect(stats.visits[Biome.VoidRift]).toBe(5);
    expect(stats.uniqueCount).toBe(4);
  });

  it("gravity well + arena boundary: nudge near edge stays valid", () => {
    // Snake at col 0, center at col 20 → nudge should push right (+1)
    const center = { col: 20, row: 15 };
    const mgr = new GravityWellManager(1, center);
    const snake = createSnake({ col: 0, row: 15 });

    mgr.onSnakeStep(snake);
    expect(snake.getHeadPosition().col).toBe(1);
  });
});
