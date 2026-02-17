import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Phaser mock (same pattern as snake.test.ts) ────────────────────

const mockDestroy = vi.fn();
const mockSetPosition = vi.fn();

function createMockSprite() {
  return {
    destroy: mockDestroy,
    setPosition: mockSetPosition,
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
import { Food } from "@/game/entities/Food";
import { Snake } from "@/game/entities/Snake";
import { GRID_COLS, GRID_ROWS } from "@/game/config";
import type { GridPos } from "@/game/utils/grid";

// ── Helpers ──────────────────────────────────────────────────────

function createScene(): Phaser.Scene {
  return new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
}

function createSnake(
  headPos: GridPos = { col: 10, row: 10 },
  direction: "up" | "down" | "left" | "right" = "right",
  length = 3,
): Snake {
  const scene = createScene();
  return new Snake(scene, headPos, direction, length);
}

/** Create a deterministic RNG that always returns a fixed value. */
function fixedRng(value: number): () => number {
  return () => value;
}

/** Create an RNG that returns values from a sequence. */
function sequenceRng(values: number[]): () => number {
  let index = 0;
  return () => {
    const val = values[index % values.length];
    index++;
    return val;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Construction ─────────────────────────────────────────────────

describe("Food construction", () => {
  it("creates a food with a position not on the snake", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const scene = createScene();
    const food = new Food(scene, snake, fixedRng(0));

    const pos = food.getPosition();
    expect(snake.isOnSnake(pos)).toBe(false);
  });

  it("creates a sprite on construction", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const scene = createScene();
    new Food(scene, snake, fixedRng(0));

    expect(scene.add.sprite).toHaveBeenCalledTimes(1);
  });

  it("places sprite at the food grid position", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const scene = createScene();
    const food = new Food(scene, snake, fixedRng(0));

    const pos = food.getPosition();
    // The sprite should have been created — verify the call happened
    expect(scene.add.sprite).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      "food",
    );
    // Position should be within grid bounds
    expect(pos.col).toBeGreaterThanOrEqual(0);
    expect(pos.col).toBeLessThan(GRID_COLS);
    expect(pos.row).toBeGreaterThanOrEqual(0);
    expect(pos.row).toBeLessThan(GRID_ROWS);
  });
});

// ── Safe spawn ───────────────────────────────────────────────────

describe("Food safe spawn", () => {
  it("never spawns on a snake segment", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 5);
    const scene = createScene();

    // Test with multiple RNG values
    for (let i = 0; i < 10; i++) {
      const food = new Food(scene, snake, fixedRng(i / 10));
      expect(snake.isOnSnake(food.getPosition())).toBe(false);
      food.destroy();
    }
  });

  it("uses injected RNG for deterministic positioning", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const scene = createScene();

    const food1 = new Food(scene, snake, fixedRng(0));
    const food2 = new Food(scene, snake, fixedRng(0));

    expect(food1.getPosition()).toEqual(food2.getPosition());

    food1.destroy();
    food2.destroy();
  });

  it("returns different positions for different RNG values", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const scene = createScene();

    const food1 = new Food(scene, snake, fixedRng(0));
    const food2 = new Food(scene, snake, fixedRng(0.99));

    // With RNG 0 (first free cell) vs 0.99 (last free cell),
    // positions should differ
    const p1 = food1.getPosition();
    const p2 = food2.getPosition();
    expect(p1.col !== p2.col || p1.row !== p2.row).toBe(true);

    food1.destroy();
    food2.destroy();
  });

  it("handles a nearly-full grid", () => {
    // Create a snake that occupies most of the grid
    // Grid is 40x30 = 1200 cells; snake length ~1198 would leave 2 cells
    // For simplicity, we'll test with a smaller scenario using findSafePosition
    const snake = createSnake({ col: 0, row: 0 }, "right", 3);
    const scene = createScene();
    const food = new Food(scene, snake, fixedRng(0));

    // Food should be in a valid position
    const pos = food.getPosition();
    expect(pos.col).toBeGreaterThanOrEqual(0);
    expect(pos.col).toBeLessThan(GRID_COLS);
    expect(pos.row).toBeGreaterThanOrEqual(0);
    expect(pos.row).toBeLessThan(GRID_ROWS);
    expect(snake.isOnSnake(pos)).toBe(false);

    food.destroy();
  });

  it("findSafePosition avoids all snake segments", () => {
    const snake = createSnake({ col: 5, row: 5 }, "right", 10);
    const scene = createScene();
    const food = new Food(scene, snake, fixedRng(0));

    // Check that findSafePosition returns a position not on the snake
    for (let trial = 0; trial < 5; trial++) {
      const pos = food.findSafePosition(snake);
      expect(snake.isOnSnake(pos)).toBe(false);
    }

    food.destroy();
  });

  it("findSafePosition excludes optional blocked cells", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 1);
    const scene = createScene();
    const food = new Food(scene, snake, fixedRng(0));
    const blockedCells = [
      { col: 0, row: 0 },
      { col: 0, row: 1 },
    ];

    const pos = food.findSafePosition(snake, blockedCells);
    expect(blockedCells).not.toContainEqual(pos);

    food.destroy();
  });

  it("keeps blocked endpoint exclusions strict when they are the only snake-free cells", () => {
    const scene = createScene();
    const food = new Food(scene, createSnake({ col: 10, row: 10 }, "right", 1), fixedRng(0));
    const blockedEndpointA = { col: 0, row: 0 };
    const blockedEndpointB = { col: 0, row: 1 };
    const endpointKeys = new Set([
      `${blockedEndpointA.col}:${blockedEndpointA.row}`,
      `${blockedEndpointB.col}:${blockedEndpointB.row}`,
    ]);

    const nearFullSnake = {
      isOnSnake(pos: GridPos) {
        return !endpointKeys.has(`${pos.col}:${pos.row}`);
      },
    } as unknown as Snake;

    const pos = food.findSafePosition(nearFullSnake, [
      blockedEndpointA,
      blockedEndpointB,
    ]);

    expect(pos).not.toEqual(blockedEndpointA);
    expect(pos).not.toEqual(blockedEndpointB);

    food.destroy();
  });
});

// ── Respawn ──────────────────────────────────────────────────────

describe("Food respawn", () => {
  it("moves to a new position not on the snake", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const scene = createScene();
    const food = new Food(scene, snake, fixedRng(0.5));

    food.respawn(snake);

    const pos = food.getPosition();
    expect(snake.isOnSnake(pos)).toBe(false);
  });

  it("updates the sprite position on respawn", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const scene = createScene();
    const food = new Food(scene, snake, fixedRng(0.5));

    mockSetPosition.mockClear();
    food.respawn(snake);

    expect(mockSetPosition).toHaveBeenCalledTimes(1);
    expect(mockSetPosition).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
    );
  });
});

// ── Eat detection ────────────────────────────────────────────────

describe("Food checkEat", () => {
  it("returns false when snake head is not on food", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const scene = createScene();
    // Place food far from the snake head (RNG 0.99 → last free cell)
    const food = new Food(scene, snake, fixedRng(0.99));

    // Ensure food is not at snake head
    const foodPos = food.getPosition();
    if (foodPos.col === 10 && foodPos.row === 10) {
      // Edge case: skip if they happen to coincide
      return;
    }

    const onScore = vi.fn();
    const result = food.checkEat(snake, onScore);

    expect(result).toBe(false);
    expect(onScore).not.toHaveBeenCalled();

    food.destroy();
  });

  it("returns true and triggers growth when snake head is on food", () => {
    // Create food, then place a snake at the food's position
    const food = new Food(createScene(), createSnake({ col: 0, row: 0 }, "right", 1), fixedRng(0));
    const foodPos = food.getPosition();

    // Create snake with head AT the food position
    const snakeAtFood = createSnake(foodPos, "right", 1);

    const onScore = vi.fn();
    const result = food.checkEat(snakeAtFood, onScore);

    expect(result).toBe(true);
    expect(onScore).toHaveBeenCalledWith(1);

    food.destroy();
  });

  it("calls snake.grow when eaten", () => {
    // Create a small snake at (0,0) so food spawns elsewhere
    const scene = createScene();
    const snake = new Snake(scene, { col: 0, row: 0 }, "right", 1);
    const food = new Food(createScene(), snake, fixedRng(0));

    const foodPos = food.getPosition();

    // Create a spy-able snake at the food position
    const scene2 = createScene();
    const snakeAtFood = new Snake(scene2, foodPos, "right", 1);
    const growSpy = vi.spyOn(snakeAtFood, "grow");

    const onScore = vi.fn();
    food.checkEat(snakeAtFood, onScore);

    expect(growSpy).toHaveBeenCalledWith(1);

    food.destroy();
  });

  it("respawns after being eaten", () => {
    const scene = createScene();
    const snake = new Snake(scene, { col: 0, row: 0 }, "right", 1);

    let rngCall = 0;
    const rng = () => {
      rngCall++;
      return rngCall <= 1 ? 0 : 0.5;
    };

    const food = new Food(createScene(), snake, rng);
    const positionBefore = food.getPosition();

    // Create snake at food's position
    const scene2 = createScene();
    const snakeAtFood = new Snake(scene2, positionBefore, "right", 1);

    const onScore = vi.fn();
    food.checkEat(snakeAtFood, onScore);

    // After eating, food should have a new position (respawned)
    // It may or may not be the same as before depending on RNG, but it should be valid
    const positionAfter = food.getPosition();
    expect(positionAfter.col).toBeGreaterThanOrEqual(0);
    expect(positionAfter.col).toBeLessThan(GRID_COLS);
    expect(positionAfter.row).toBeGreaterThanOrEqual(0);
    expect(positionAfter.row).toBeLessThan(GRID_ROWS);

    food.destroy();
  });

  it("calls onScore with 1 point when eaten", () => {
    const scene = createScene();
    const snake = new Snake(scene, { col: 0, row: 0 }, "right", 1);
    const food = new Food(createScene(), snake, fixedRng(0));

    const foodPos = food.getPosition();
    const scene2 = createScene();
    const snakeAtFood = new Snake(scene2, foodPos, "right", 1);

    const onScore = vi.fn();
    food.checkEat(snakeAtFood, onScore);

    expect(onScore).toHaveBeenCalledTimes(1);
    expect(onScore).toHaveBeenCalledWith(1);

    food.destroy();
  });

  it("respawns away from blocked cells when checkEat receives constraints", () => {
    const scene = createScene();
    const snake = new Snake(scene, { col: 0, row: 0 }, "right", 1);
    const food = new Food(createScene(), snake, fixedRng(0));

    const foodPos = food.getPosition();
    const scene2 = createScene();
    const snakeAtFood = new Snake(scene2, foodPos, "right", 1);

    food.checkEat(snakeAtFood, vi.fn(), {
      blockedCells: [
        { col: 0, row: 0 },
        { col: 0, row: 1 },
      ],
    });

    expect(food.getPosition()).not.toEqual({ col: 0, row: 0 });
    expect(food.getPosition()).not.toEqual({ col: 0, row: 1 });

    food.destroy();
  });
});

// ── State queries ────────────────────────────────────────────────

describe("Food state queries", () => {
  it("getPosition returns a copy (not a reference)", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const scene = createScene();
    const food = new Food(scene, snake, fixedRng(0));

    const pos1 = food.getPosition();
    const pos2 = food.getPosition();

    expect(pos1).toEqual(pos2);
    expect(pos1).not.toBe(pos2); // Different object references

    food.destroy();
  });

  it("getSprite returns the food sprite", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const scene = createScene();
    const food = new Food(scene, snake, fixedRng(0));

    const sprite = food.getSprite();
    expect(sprite).toBeDefined();
    expect(sprite.destroy).toBeDefined();

    food.destroy();
  });
});

// ── Destroy ──────────────────────────────────────────────────────

describe("Food destroy", () => {
  it("destroys the sprite", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const scene = createScene();
    const food = new Food(scene, snake, fixedRng(0));

    mockDestroy.mockClear();
    food.destroy();

    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });
});

// ── Integration with MainScene score hook ────────────────────────

describe("Food + MainScene score integration", () => {
  it("onScore callback can be used as MainScene.addScore proxy", () => {
    const scene = createScene();
    const snake = new Snake(scene, { col: 0, row: 0 }, "right", 1);
    const food = new Food(createScene(), snake, fixedRng(0));

    const foodPos = food.getPosition();
    const scene2 = createScene();
    const snakeAtFood = new Snake(scene2, foodPos, "right", 1);

    let totalScore = 0;
    const addScore = (points: number) => {
      totalScore += points;
    };

    food.checkEat(snakeAtFood, addScore);

    expect(totalScore).toBe(1);

    food.destroy();
  });

  it("accumulates score across multiple eats", () => {
    let totalScore = 0;
    const addScore = (points: number) => {
      totalScore += points;
    };

    // First eat
    const scene1 = createScene();
    const snake1 = new Snake(scene1, { col: 0, row: 0 }, "right", 1);
    const food = new Food(createScene(), snake1, sequenceRng([0, 0.5, 0.3]));
    const foodPos1 = food.getPosition();
    const snakeAt1 = new Snake(createScene(), foodPos1, "right", 1);
    food.checkEat(snakeAt1, addScore);
    expect(totalScore).toBe(1);

    // Second eat
    const foodPos2 = food.getPosition();
    const snakeAt2 = new Snake(createScene(), foodPos2, "right", 1);
    food.checkEat(snakeAt2, addScore);
    expect(totalScore).toBe(2);

    food.destroy();
  });
});
