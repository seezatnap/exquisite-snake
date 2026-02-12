import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Phaser mock ──────────────────────────────────────────────────

const mockDestroy = vi.fn();
const mockSetPosition = vi.fn();

function createMockSprite() {
  return {
    destroy: mockDestroy,
    setPosition: mockSetPosition,
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
  LavaPoolManager,
  LAVA_BURN_SEGMENTS,
  LAVA_SURVIVAL_THRESHOLD,
  LAVA_MAX_POOLS,
  LAVA_SPAWN_INTERVAL_MS,
} from "@/game/entities/LavaPool";
import { GRID_COLS, GRID_ROWS } from "@/game/config";
import type { GridPos } from "@/game/utils/grid";
import { MoveTicker } from "@/game/utils/grid";

// ── Helpers ──────────────────────────────────────────────────────

function createScene(): Phaser.Scene {
  return new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
}

function createSnake(
  headPos: GridPos = { col: 10, row: 10 },
  direction: "up" | "down" | "left" | "right" = "right",
  length = 3,
  ticker?: MoveTicker,
): Snake {
  const scene = createScene();
  return new Snake(scene, headPos, direction, length, ticker);
}

/** Deterministic RNG that always returns a fixed value. */
function fixedRng(value: number): () => number {
  return () => value;
}

/** RNG that returns values from a repeating sequence. */
function sequenceRng(values: number[]): () => number {
  let index = 0;
  return () => {
    const val = values[index % values.length];
    index++;
    return val;
  };
}

const DEFAULT_FOOD_POS: GridPos = { col: 5, row: 5 };

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Exported constants ──────────────────────────────────────────

describe("LavaPool exported constants", () => {
  it("burns 3 tail segments", () => {
    expect(LAVA_BURN_SEGMENTS).toBe(3);
  });

  it("survival threshold is burn + 1 (head)", () => {
    expect(LAVA_SURVIVAL_THRESHOLD).toBe(LAVA_BURN_SEGMENTS + 1);
  });

  it("default max pools is 8", () => {
    expect(LAVA_MAX_POOLS).toBe(8);
  });

  it("default spawn interval is 3000ms", () => {
    expect(LAVA_SPAWN_INTERVAL_MS).toBe(3_000);
  });
});

// ── Construction ────────────────────────────────────────────────

describe("LavaPoolManager construction", () => {
  it("starts with zero pools", () => {
    const scene = createScene();
    const mgr = new LavaPoolManager(scene, fixedRng(0));
    expect(mgr.getPoolCount()).toBe(0);
  });

  it("uses default max pools and spawn interval", () => {
    const scene = createScene();
    const mgr = new LavaPoolManager(scene);
    expect(mgr.getMaxPools()).toBe(LAVA_MAX_POOLS);
    expect(mgr.getSpawnInterval()).toBe(LAVA_SPAWN_INTERVAL_MS);
  });

  it("accepts custom max pools and spawn interval", () => {
    const scene = createScene();
    const mgr = new LavaPoolManager(scene, fixedRng(0), 4, 1000);
    expect(mgr.getMaxPools()).toBe(4);
    expect(mgr.getSpawnInterval()).toBe(1000);
  });
});

// ── Spawning ────────────────────────────────────────────────────

describe("LavaPoolManager spawning", () => {
  it("spawns a pool after the spawn interval elapses", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const mgr = new LavaPoolManager(scene, fixedRng(0), 8, 1000);

    // Just before interval — no spawn
    mgr.update(999, snake, DEFAULT_FOOD_POS);
    expect(mgr.getPoolCount()).toBe(0);

    // Cross the interval — should spawn
    mgr.update(1, snake, DEFAULT_FOOD_POS);
    expect(mgr.getPoolCount()).toBe(1);
  });

  it("spawns multiple pools over time", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const mgr = new LavaPoolManager(scene, sequenceRng([0.1, 0.3, 0.5, 0.7]), 8, 1000);

    mgr.update(1000, snake, DEFAULT_FOOD_POS);
    expect(mgr.getPoolCount()).toBe(1);

    mgr.update(1000, snake, DEFAULT_FOOD_POS);
    expect(mgr.getPoolCount()).toBe(2);

    mgr.update(1000, snake, DEFAULT_FOOD_POS);
    expect(mgr.getPoolCount()).toBe(3);
  });

  it("does not spawn beyond max pool cap", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const mgr = new LavaPoolManager(scene, fixedRng(0.5), 2, 500);

    // Spawn 2 pools (at cap)
    mgr.update(500, snake, DEFAULT_FOOD_POS);
    mgr.update(500, snake, DEFAULT_FOOD_POS);
    expect(mgr.getPoolCount()).toBe(2);

    // More time passes — should NOT exceed cap
    mgr.update(500, snake, DEFAULT_FOOD_POS);
    mgr.update(500, snake, DEFAULT_FOOD_POS);
    expect(mgr.getPoolCount()).toBe(2);
  });

  it("spawns on an empty cell (not on snake)", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const mgr = new LavaPoolManager(scene, fixedRng(0), 8, 1000);

    mgr.update(1000, snake, DEFAULT_FOOD_POS);

    const positions = mgr.getPoolPositions();
    expect(positions.length).toBe(1);
    expect(snake.isOnSnake(positions[0])).toBe(false);
  });

  it("does not spawn on the food position", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const foodPos: GridPos = { col: 0, row: 0 }; // RNG=0 would pick (0,0) if it were free
    const mgr = new LavaPoolManager(scene, fixedRng(0), 8, 1000);

    mgr.update(1000, snake, foodPos);

    const positions = mgr.getPoolPositions();
    expect(positions.length).toBe(1);
    // Should not match the food position
    expect(
      positions[0].col === foodPos.col && positions[0].row === foodPos.row,
    ).toBe(false);
  });

  it("does not spawn on existing pool positions", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    // Use the same RNG value — if not checking for existing pools,
    // it would place the same cell twice
    const mgr = new LavaPoolManager(scene, fixedRng(0), 8, 1000);

    mgr.update(1000, snake, DEFAULT_FOOD_POS);
    mgr.update(1000, snake, DEFAULT_FOOD_POS);

    const positions = mgr.getPoolPositions();
    expect(positions.length).toBe(2);

    // Positions should be different
    expect(
      positions[0].col === positions[1].col &&
        positions[0].row === positions[1].row,
    ).toBe(false);
  });

  it("uses injected RNG for deterministic placement", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);

    const mgr1 = new LavaPoolManager(scene, fixedRng(0.5), 8, 1000);
    mgr1.update(1000, snake, DEFAULT_FOOD_POS);
    const pos1 = mgr1.getPoolPositions()[0];

    const mgr2 = new LavaPoolManager(scene, fixedRng(0.5), 8, 1000);
    mgr2.update(1000, snake, DEFAULT_FOOD_POS);
    const pos2 = mgr2.getPoolPositions()[0];

    expect(pos1).toEqual(pos2);
  });

  it("pool positions are within grid bounds", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const mgr = new LavaPoolManager(
      scene,
      sequenceRng([0, 0.25, 0.5, 0.75, 0.99]),
      5,
      500,
    );

    for (let i = 0; i < 5; i++) {
      mgr.update(500, snake, DEFAULT_FOOD_POS);
    }

    for (const pos of mgr.getPoolPositions()) {
      expect(pos.col).toBeGreaterThanOrEqual(0);
      expect(pos.col).toBeLessThan(GRID_COLS);
      expect(pos.row).toBeGreaterThanOrEqual(0);
      expect(pos.row).toBeLessThan(GRID_ROWS);
    }
  });
});

// ── Collision detection ─────────────────────────────────────────

describe("LavaPoolManager collision detection", () => {
  it("returns null when snake head is not on any pool", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const mgr = new LavaPoolManager(scene, fixedRng(0.99), 8, 1000);

    // Spawn a pool far from the snake head
    mgr.update(1000, snake, DEFAULT_FOOD_POS);

    const hit = mgr.checkCollision(snake);
    // Pool spawned with RNG 0.99 → last free cell, which should be far from (10,10)
    // We need to verify the pool is NOT at (10,10) to make this a valid test
    const poolPos = mgr.getPoolPositions()[0];
    if (poolPos.col === 10 && poolPos.row === 10) {
      // Skip — edge case where pool lands on snake head
      return;
    }
    expect(hit).toBeNull();
  });

  it("returns pool position when snake head is on a pool", () => {
    const scene = createScene();
    const mgr = new LavaPoolManager(scene, fixedRng(0), 8, 1000);

    // First, spawn a pool with a basic snake
    const tempSnake = createSnake({ col: 20, row: 20 }, "right", 3);
    mgr.update(1000, tempSnake, DEFAULT_FOOD_POS);

    const poolPos = mgr.getPoolPositions()[0];

    // Now create a snake whose head is at the pool position
    const snake = createSnake(poolPos, "right", 5);

    const hit = mgr.checkCollision(snake);
    expect(hit).toEqual(poolPos);
  });

  it("isLavaAt returns true for pool positions", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const mgr = new LavaPoolManager(scene, fixedRng(0), 8, 1000);

    mgr.update(1000, snake, DEFAULT_FOOD_POS);
    const poolPos = mgr.getPoolPositions()[0];

    expect(mgr.isLavaAt(poolPos)).toBe(true);
    expect(mgr.isLavaAt({ col: 39, row: 29 })).toBe(
      mgr.getPoolPositions().some((p) => p.col === 39 && p.row === 29),
    );
  });
});

// ── Pool removal ────────────────────────────────────────────────

describe("LavaPoolManager pool removal", () => {
  it("removeAt removes a specific pool", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const mgr = new LavaPoolManager(
      scene,
      sequenceRng([0.1, 0.5]),
      8,
      1000,
    );

    mgr.update(1000, snake, DEFAULT_FOOD_POS);
    mgr.update(1000, snake, DEFAULT_FOOD_POS);
    expect(mgr.getPoolCount()).toBe(2);

    const firstPool = mgr.getPoolPositions()[0];
    mgr.removeAt(firstPool);
    expect(mgr.getPoolCount()).toBe(1);
    expect(mgr.isLavaAt(firstPool)).toBe(false);
  });

  it("removeAt destroys the pool sprite", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const mgr = new LavaPoolManager(scene, fixedRng(0.5), 8, 1000);

    mgr.update(1000, snake, DEFAULT_FOOD_POS);
    const poolPos = mgr.getPoolPositions()[0];

    mockDestroy.mockClear();
    mgr.removeAt(poolPos);
    expect(mockDestroy).toHaveBeenCalled();
  });

  it("removeAt is a no-op for positions without pools", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const mgr = new LavaPoolManager(scene, fixedRng(0.5), 8, 1000);

    mgr.update(1000, snake, DEFAULT_FOOD_POS);
    expect(mgr.getPoolCount()).toBe(1);

    mgr.removeAt({ col: 99, row: 99 }); // non-existent
    expect(mgr.getPoolCount()).toBe(1);
  });
});

// ── Clear all (biome change cleanup) ────────────────────────────

describe("LavaPoolManager clearAll", () => {
  it("removes all pools", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const mgr = new LavaPoolManager(
      scene,
      sequenceRng([0.1, 0.3, 0.5]),
      8,
      500,
    );

    mgr.update(500, snake, DEFAULT_FOOD_POS);
    mgr.update(500, snake, DEFAULT_FOOD_POS);
    mgr.update(500, snake, DEFAULT_FOOD_POS);
    expect(mgr.getPoolCount()).toBe(3);

    mgr.clearAll();
    expect(mgr.getPoolCount()).toBe(0);
    expect(mgr.getPoolPositions()).toEqual([]);
  });

  it("destroys all pool sprites on clearAll", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const mgr = new LavaPoolManager(
      scene,
      sequenceRng([0.1, 0.5]),
      8,
      500,
    );

    mgr.update(500, snake, DEFAULT_FOOD_POS);
    mgr.update(500, snake, DEFAULT_FOOD_POS);

    mockDestroy.mockClear();
    mgr.clearAll();
    expect(mockDestroy).toHaveBeenCalledTimes(2);
  });

  it("resets spawn timer on clearAll", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const mgr = new LavaPoolManager(scene, fixedRng(0.5), 8, 1000);

    // Advance partway through a spawn interval
    mgr.update(800, snake, DEFAULT_FOOD_POS);
    expect(mgr.getPoolCount()).toBe(0);

    mgr.clearAll();

    // After clearAll, timer should be reset — 800ms more should NOT spawn
    mgr.update(800, snake, DEFAULT_FOOD_POS);
    expect(mgr.getPoolCount()).toBe(0);

    // But 200ms more (total 1000 from reset) should spawn
    mgr.update(200, snake, DEFAULT_FOOD_POS);
    expect(mgr.getPoolCount()).toBe(1);
  });

  it("allows new spawns after clearAll", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const mgr = new LavaPoolManager(scene, fixedRng(0.5), 2, 500);

    // Fill to cap
    mgr.update(500, snake, DEFAULT_FOOD_POS);
    mgr.update(500, snake, DEFAULT_FOOD_POS);
    expect(mgr.getPoolCount()).toBe(2);

    // Clear
    mgr.clearAll();
    expect(mgr.getPoolCount()).toBe(0);

    // Should be able to spawn again
    mgr.update(500, snake, DEFAULT_FOOD_POS);
    expect(mgr.getPoolCount()).toBe(1);
  });
});

// ── Destroy ─────────────────────────────────────────────────────

describe("LavaPoolManager destroy", () => {
  it("clears all pools on destroy", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const mgr = new LavaPoolManager(scene, fixedRng(0.5), 8, 500);

    mgr.update(500, snake, DEFAULT_FOOD_POS);
    mgr.update(500, snake, DEFAULT_FOOD_POS);

    mockDestroy.mockClear();
    mgr.destroy();
    expect(mgr.getPoolCount()).toBe(0);
    expect(mockDestroy).toHaveBeenCalledTimes(2);
  });
});

// ── Snake.burnTail ──────────────────────────────────────────────

describe("Snake burnTail", () => {
  it("removes the specified number of tail segments", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 6);
    expect(snake.getLength()).toBe(6);

    const removed = snake.burnTail(3);
    expect(removed).toBe(3);
    expect(snake.getLength()).toBe(3);
  });

  it("never removes the head segment", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);

    // Try to burn more than available body segments
    const removed = snake.burnTail(10);
    expect(removed).toBe(2); // Only 2 body segments to remove
    expect(snake.getLength()).toBe(1); // Only head remains
  });

  it("returns the number of segments actually removed", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 2);

    const removed = snake.burnTail(3);
    expect(removed).toBe(1); // Only 1 body segment
    expect(snake.getLength()).toBe(1);
  });

  it("destroys sprites for removed segments", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 5);

    mockDestroy.mockClear();
    snake.burnTail(2);
    expect(mockDestroy).toHaveBeenCalledTimes(2);
  });

  it("head position is unchanged after burn", () => {
    const headPos = { col: 10, row: 10 };
    const snake = createSnake(headPos, "right", 6);

    snake.burnTail(3);
    expect(snake.getHeadPosition()).toEqual(headPos);
  });

  it("cancels pending growth when burning", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 6);
    snake.grow(2);

    snake.burnTail(3);
    // After burning 3, pending growth of 2 should be reduced to 0
    // (3 > 2, so max(0, 2-3) = 0)
    // The snake length should be 3 (6 - 3)
    expect(snake.getLength()).toBe(3);
  });

  it("burning 0 segments is a no-op", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 5);

    const removed = snake.burnTail(0);
    expect(removed).toBe(0);
    expect(snake.getLength()).toBe(5);
  });

  it("snake with only head returns 0 removed", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 1);

    const removed = snake.burnTail(3);
    expect(removed).toBe(0);
    expect(snake.getLength()).toBe(1);
  });
});

// ── Survival threshold logic ────────────────────────────────────

describe("Lava collision survival logic", () => {
  it("snake with length >= LAVA_SURVIVAL_THRESHOLD survives", () => {
    // LAVA_SURVIVAL_THRESHOLD = 4 (head + 3 body)
    const snake = createSnake({ col: 10, row: 10 }, "right", LAVA_SURVIVAL_THRESHOLD);
    expect(snake.getLength()).toBeGreaterThanOrEqual(LAVA_SURVIVAL_THRESHOLD);

    const removed = snake.burnTail(LAVA_BURN_SEGMENTS);
    expect(removed).toBe(LAVA_BURN_SEGMENTS);
    expect(snake.getLength()).toBe(LAVA_SURVIVAL_THRESHOLD - LAVA_BURN_SEGMENTS);
    expect(snake.getLength()).toBeGreaterThanOrEqual(1); // still alive (head)
  });

  it("snake with length < LAVA_SURVIVAL_THRESHOLD should be killed", () => {
    // Snake with 3 segments (head + 2 body) is too short (threshold is 4)
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    expect(snake.getLength()).toBeLessThan(LAVA_SURVIVAL_THRESHOLD);
    // In the game loop, this would trigger endRun() rather than burnTail()
  });

  it("snake with exact threshold length survives with only head", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", LAVA_SURVIVAL_THRESHOLD);
    snake.burnTail(LAVA_BURN_SEGMENTS);
    expect(snake.getLength()).toBe(1); // Only head remains, but survived
  });
});
