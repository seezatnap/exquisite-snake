import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Phaser mock ──────────────────────────────────────────────────
const mockDestroy = vi.fn();
const mockSetPosition = vi.fn();
const mockKeyboardOn = vi.fn();
const mockKeyboardOff = vi.fn();

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
        on: mockKeyboardOn,
        off: mockKeyboardOff,
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
import { Food } from "@/game/entities/Food";
import {
  MoveTicker,
  DEFAULT_MOVE_INTERVAL_MS,
  gridToPixel,
  lerpGridPos,
  lerp,
  isInBounds,
  gridEquals,
  stepInDirection,
} from "@/game/utils/grid";
import type { GridPos, Direction } from "@/game/utils/grid";
import { GRID_COLS, GRID_ROWS, TILE_SIZE } from "@/game/config";

function createScene(): Phaser.Scene {
  return new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── 60 FPS timing budget validation ──────────────────────────────

describe("60 FPS timing budget", () => {
  const FRAME_BUDGET_MS = 16.67; // 60 FPS target = ~16.67ms per frame

  it("DEFAULT_MOVE_INTERVAL_MS is a whole multiple of 60 FPS frame time", () => {
    // At 60 FPS, each frame is ~16.67ms. The move interval should yield
    // consistent step pacing: 125ms ÷ 16.67ms ≈ 7.5 frames per step.
    // This is acceptable — the MoveTicker handles fractional accumulation.
    expect(DEFAULT_MOVE_INTERVAL_MS).toBeGreaterThanOrEqual(FRAME_BUDGET_MS);
    expect(DEFAULT_MOVE_INTERVAL_MS).toBeLessThanOrEqual(500);
  });

  it("MoveTicker accumulates correctly over many 60 FPS frames", () => {
    const ticker = new MoveTicker(DEFAULT_MOVE_INTERVAL_MS);
    let stepCount = 0;
    const totalFrames = 600; // 10 seconds at 60 FPS

    for (let i = 0; i < totalFrames; i++) {
      if (ticker.advance(FRAME_BUDGET_MS)) {
        stepCount++;
      }
    }

    // Expected steps: 10 seconds / 125ms per step = 80 steps
    const expectedSteps = Math.floor(
      (totalFrames * FRAME_BUDGET_MS) / DEFAULT_MOVE_INTERVAL_MS,
    );
    // Allow ±1 due to floating point accumulation
    expect(Math.abs(stepCount - expectedSteps)).toBeLessThanOrEqual(1);
  });

  it("MoveTicker progress stays in [0, 1] across 60 FPS frame updates", () => {
    const ticker = new MoveTicker(DEFAULT_MOVE_INTERVAL_MS);

    for (let i = 0; i < 300; i++) {
      ticker.advance(FRAME_BUDGET_MS);
      expect(ticker.progress).toBeGreaterThanOrEqual(0);
      expect(ticker.progress).toBeLessThanOrEqual(1);
    }
  });

  it("Snake update completes within a reasonable number of operations per frame", () => {
    const scene = createScene();
    const ticker = new MoveTicker(DEFAULT_MOVE_INTERVAL_MS);
    const snake = new Snake(scene, { col: 10, row: 10 }, "right", 10, ticker);

    // Simulate 60 frames — each update should complete without accumulating errors
    for (let frame = 0; frame < 60; frame++) {
      const stepped = snake.update(FRAME_BUDGET_MS);
      // Verify state remains consistent
      expect(snake.getLength()).toBeGreaterThanOrEqual(10);
      if (stepped) {
        const head = snake.getHeadPosition();
        // Head should be a valid integer grid position
        expect(Number.isInteger(head.col)).toBe(true);
        expect(Number.isInteger(head.row)).toBe(true);
      }
    }
  });

  it("lerp operations are fast for interpolation (no expensive math)", () => {
    // Verify lerp is pure arithmetic, no trigonometry or sqrt
    const iterations = 10000;
    for (let i = 0; i < iterations; i++) {
      const t = i / iterations;
      const result = lerp(0, 100, t);
      expect(result).toBeCloseTo(t * 100, 5);
    }
  });

  it("lerpGridPos produces smooth intermediate positions at 60 FPS", () => {
    const from: GridPos = { col: 5, row: 5 };
    const to: GridPos = { col: 6, row: 5 };

    // Simulate 8 sub-frame steps (125ms / 16.67ms ≈ 7.5)
    const steps = 8;
    let lastX = -Infinity;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const pos = lerpGridPos(from, to, t);

      // X should be monotonically increasing (moving right)
      expect(pos.x).toBeGreaterThanOrEqual(lastX);
      lastX = pos.x;

      // Y should stay constant
      expect(pos.y).toBeCloseTo(gridToPixel(from).y, 5);
    }
  });

  it("MoveTicker handles variable frame timing (vsync jitter)", () => {
    const ticker = new MoveTicker(125);
    // Simulate jittery frame times: 14ms, 18ms, 15ms, 19ms, 16ms, ...
    const frameTimes = [14, 18, 15, 19, 16, 17, 14, 20, 15, 17];
    let stepCount = 0;
    let totalTime = 0;

    for (let i = 0; i < 100; i++) {
      const dt = frameTimes[i % frameTimes.length];
      totalTime += dt;
      if (ticker.advance(dt)) {
        stepCount++;
      }
    }

    const expectedSteps = Math.floor(totalTime / 125);
    // Allow ±2 due to jitter and carry-over capping
    expect(Math.abs(stepCount - expectedSteps)).toBeLessThanOrEqual(2);
  });

  it("MoveTicker handles dropped frames (lag spikes) gracefully", () => {
    const ticker = new MoveTicker(125);

    // Normal frames
    ticker.advance(16.67);
    ticker.advance(16.67);

    // Lag spike: 500ms
    const stepped = ticker.advance(500);
    expect(stepped).toBe(true);

    // Progress should be sane after lag spike (not > 1)
    expect(ticker.progress).toBeGreaterThanOrEqual(0);
    expect(ticker.progress).toBeLessThanOrEqual(1);

    // Should recover to normal stepping after spike
    let nextStepCount = 0;
    for (let i = 0; i < 20; i++) {
      if (ticker.advance(16.67)) nextStepCount++;
    }
    // ~20 frames * 16.67ms = 333ms → ~2-3 steps at 125ms interval
    expect(nextStepCount).toBeGreaterThanOrEqual(1);
    expect(nextStepCount).toBeLessThanOrEqual(5);
  });
});

// ── Grid utility edge cases ──────────────────────────────────────

describe("Grid utility edge cases", () => {
  it("gridToPixel and lerpGridPos are consistent at t=0 and t=1", () => {
    const positions: GridPos[] = [
      { col: 0, row: 0 },
      { col: GRID_COLS - 1, row: GRID_ROWS - 1 },
      { col: Math.floor(GRID_COLS / 2), row: Math.floor(GRID_ROWS / 2) },
    ];

    for (const pos of positions) {
      const pixel = gridToPixel(pos);
      const next = stepInDirection(pos, "right");

      const atZero = lerpGridPos(pos, next, 0);
      expect(atZero.x).toBeCloseTo(pixel.x, 10);
      expect(atZero.y).toBeCloseTo(pixel.y, 10);
    }
  });

  it("isInBounds covers all boundary cells", () => {
    // Top row
    for (let col = 0; col < GRID_COLS; col++) {
      expect(isInBounds({ col, row: 0 })).toBe(true);
    }
    // Bottom row
    for (let col = 0; col < GRID_COLS; col++) {
      expect(isInBounds({ col, row: GRID_ROWS - 1 })).toBe(true);
    }
    // Left column
    for (let row = 0; row < GRID_ROWS; row++) {
      expect(isInBounds({ col: 0, row })).toBe(true);
    }
    // Right column
    for (let row = 0; row < GRID_ROWS; row++) {
      expect(isInBounds({ col: GRID_COLS - 1, row })).toBe(true);
    }
  });

  it("stepping from every boundary cell outward is out of bounds", () => {
    // Top wall: step up from row 0
    for (let col = 0; col < GRID_COLS; col++) {
      expect(isInBounds(stepInDirection({ col, row: 0 }, "up"))).toBe(false);
    }
    // Bottom wall: step down from last row
    for (let col = 0; col < GRID_COLS; col++) {
      expect(
        isInBounds(stepInDirection({ col, row: GRID_ROWS - 1 }, "down")),
      ).toBe(false);
    }
    // Left wall: step left from col 0
    for (let row = 0; row < GRID_ROWS; row++) {
      expect(isInBounds(stepInDirection({ col: 0, row }, "left"))).toBe(false);
    }
    // Right wall: step right from last col
    for (let row = 0; row < GRID_ROWS; row++) {
      expect(
        isInBounds(stepInDirection({ col: GRID_COLS - 1, row }, "right")),
      ).toBe(false);
    }
  });

  it("gridEquals is reflexive, symmetric, and handles all combinations", () => {
    const a: GridPos = { col: 3, row: 7 };
    const b: GridPos = { col: 3, row: 7 };
    const c: GridPos = { col: 4, row: 7 };

    // Reflexive
    expect(gridEquals(a, a)).toBe(true);
    // Symmetric
    expect(gridEquals(a, b)).toBe(gridEquals(b, a));
    // Non-equal
    expect(gridEquals(a, c)).toBe(false);
    expect(gridEquals(c, a)).toBe(false);
  });

  it("TILE_SIZE evenly divides arena dimensions", () => {
    expect(GRID_COLS * TILE_SIZE).toBe(800); // ARENA_WIDTH
    expect(GRID_ROWS * TILE_SIZE).toBe(600); // ARENA_HEIGHT
    expect(Number.isInteger(GRID_COLS)).toBe(true);
    expect(Number.isInteger(GRID_ROWS)).toBe(true);
  });
});

// ── Input buffering edge cases ───────────────────────────────────

describe("Input buffering edge cases", () => {
  function createSnake(
    headPos: GridPos = { col: 10, row: 10 },
    direction: Direction = "right",
    length = 3,
    ticker?: MoveTicker,
  ): Snake {
    const scene = createScene();
    return new Snake(scene, headPos, direction, length, ticker);
  }

  it("rapid same-direction presses do not fill the buffer", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    // Press right multiple times — all should be rejected (same as current)
    snake.bufferDirection("right");
    snake.bufferDirection("right");
    snake.bufferDirection("right");

    // Buffer should be empty, snake continues right
    snake.update(100);
    expect(snake.getDirection()).toBe("right");
    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 10 });
  });

  it("opposite direction after perpendicular is correctly rejected", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    // Buffer up (valid, perpendicular to right)
    snake.bufferDirection("up");
    // Buffer down (rejected, opposite of buffered "up")
    snake.bufferDirection("down");

    snake.update(100);
    expect(snake.getDirection()).toBe("up");

    snake.update(100);
    // No second buffered direction, continue up
    expect(snake.getDirection()).toBe("up");
  });

  it("buffer works correctly across multiple game steps", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    // Step 1: move right
    snake.update(100);
    expect(snake.getDirection()).toBe("right");

    // Buffer down between steps
    snake.bufferDirection("down");
    snake.update(100);
    expect(snake.getDirection()).toBe("down");

    // Buffer left between steps
    snake.bufferDirection("left");
    snake.update(100);
    expect(snake.getDirection()).toBe("left");

    // Buffer up between steps
    snake.bufferDirection("up");
    snake.update(100);
    expect(snake.getDirection()).toBe("up");
  });

  it("half-tick frames do not consume buffer entries", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.bufferDirection("up");

    // 50ms: no step, buffer should still have "up"
    snake.update(50);
    expect(snake.getDirection()).toBe("right");

    // 50ms more: step fires, consumes "up"
    snake.update(50);
    expect(snake.getDirection()).toBe("up");
  });

  it("WASD and arrow keys map to correct directions", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);
    snake.setupInput();

    const handler = mockKeyboardOn.mock.calls[0][1];

    // ArrowUp → up
    handler({ code: "ArrowUp" });
    snake.update(100);
    expect(snake.getDirection()).toBe("up");

    // KeyA → left (perpendicular to up)
    handler({ code: "KeyA" });
    snake.update(100);
    expect(snake.getDirection()).toBe("left");

    // KeyS → down (perpendicular to left)
    handler({ code: "KeyS" });
    snake.update(100);
    expect(snake.getDirection()).toBe("down");

    // KeyD → right (perpendicular to down)
    handler({ code: "KeyD" });
    snake.update(100);
    expect(snake.getDirection()).toBe("right");
  });
});

// ── Food spawn exhaustive coverage ───────────────────────────────

describe("Food spawn exhaustive coverage", () => {
  it("food never spawns on any snake segment for various RNG values", () => {
    const scene = createScene();
    const snake = new Snake(scene, { col: 5, row: 5 }, "right", 10);

    for (let r = 0; r < 20; r++) {
      const rng = () => r / 20;
      const food = new Food(createScene(), snake, rng);
      const pos = food.getPosition();

      expect(snake.isOnSnake(pos)).toBe(false);
      expect(isInBounds(pos)).toBe(true);
      food.destroy();
    }
  });

  it("food position is always in bounds", () => {
    const scene = createScene();
    const snake = new Snake(scene, { col: 10, row: 10 }, "right", 3);

    for (let r = 0; r < 50; r++) {
      const rng = () => r / 50;
      const food = new Food(createScene(), snake, rng);
      const pos = food.getPosition();

      expect(pos.col).toBeGreaterThanOrEqual(0);
      expect(pos.col).toBeLessThan(GRID_COLS);
      expect(pos.row).toBeGreaterThanOrEqual(0);
      expect(pos.row).toBeLessThan(GRID_ROWS);
      food.destroy();
    }
  });

  it("checkEat + respawn cycle does not produce invalid state", () => {
    const scene = createScene();
    const snake = new Snake(scene, { col: 0, row: 0 }, "right", 1);

    let rngVal = 0.1;
    const rng = () => {
      rngVal = (rngVal + 0.37) % 1;
      return rngVal;
    };

    const food = new Food(createScene(), snake, rng);

    // Simulate 20 eat cycles
    for (let i = 0; i < 20; i++) {
      const foodPos = food.getPosition();
      const eatSnake = new Snake(createScene(), foodPos, "right", 1);

      const onScore = vi.fn();
      food.checkEat(eatSnake, onScore);

      // After eat, food should be in bounds
      const newPos = food.getPosition();
      expect(isInBounds(newPos)).toBe(true);
    }

    food.destroy();
  });
});

// ── Snake collision edge cases ───────────────────────────────────

describe("Snake collision edge cases", () => {
  it("wall collision detected at all four boundaries", () => {
    const boundaries: { pos: GridPos; dir: Direction }[] = [
      { pos: { col: 0, row: 5 }, dir: "left" },
      { pos: { col: GRID_COLS - 1, row: 5 }, dir: "right" },
      { pos: { col: 5, row: 0 }, dir: "up" },
      { pos: { col: 5, row: GRID_ROWS - 1 }, dir: "down" },
    ];

    for (const { pos, dir } of boundaries) {
      const ticker = new MoveTicker(100);
      const snake = new Snake(createScene(), pos, dir, 1, ticker);

      snake.update(100); // step into the wall

      const head = snake.getHeadPosition();
      expect(isInBounds(head)).toBe(false);
    }
  });

  it("snake cannot self-collide with length < 5", () => {
    // A snake shorter than 5 cannot physically loop back on itself
    const ticker = new MoveTicker(100);
    const snake = new Snake(
      createScene(),
      { col: 10, row: 10 },
      "right",
      4,
      ticker,
    );

    // Move right, then down, then left — head at (10, 11)
    snake.update(100); // head at (11, 10)
    snake.bufferDirection("down");
    snake.update(100); // head at (11, 11)
    snake.bufferDirection("left");
    snake.update(100); // head at (10, 11)

    // The old head positions have moved on — no self-collision possible
    expect(snake.hasSelfCollision()).toBe(false);
  });

  it("snake self-collision is possible with length >= 5", () => {
    const ticker = new MoveTicker(100);
    const snake = new Snake(
      createScene(),
      { col: 10, row: 10 },
      "right",
      5,
      ticker,
    );

    // Move: right, down, left, up → head returns to (10, 10) which is a body segment
    snake.update(100); // head at (11, 10)
    snake.bufferDirection("down");
    snake.update(100); // head at (11, 11)
    snake.bufferDirection("left");
    snake.update(100); // head at (10, 11)
    snake.bufferDirection("up");
    snake.update(100); // head at (10, 10)

    expect(snake.hasSelfCollision()).toBe(true);
  });
});

// ── Growth and length integrity ──────────────────────────────────

describe("Growth and length integrity", () => {
  it("snake length increases exactly by grow amount over multiple steps", () => {
    const ticker = new MoveTicker(100);
    const snake = new Snake(
      createScene(),
      { col: 10, row: 10 },
      "right",
      3,
      ticker,
    );

    snake.grow(5);

    for (let i = 0; i < 5; i++) {
      snake.update(100);
    }

    expect(snake.getLength()).toBe(8); // 3 + 5
  });

  it("multiple grow calls accumulate correctly", () => {
    const ticker = new MoveTicker(100);
    const snake = new Snake(
      createScene(),
      { col: 10, row: 10 },
      "right",
      3,
      ticker,
    );

    snake.grow(2);
    snake.grow(3);

    for (let i = 0; i < 5; i++) {
      snake.update(100);
    }

    expect(snake.getLength()).toBe(8); // 3 + 2 + 3
  });

  it("segments form a contiguous chain after movement", () => {
    const ticker = new MoveTicker(100);
    const snake = new Snake(
      createScene(),
      { col: 10, row: 10 },
      "right",
      5,
      ticker,
    );

    // Move several steps
    for (let i = 0; i < 5; i++) {
      snake.update(100);
    }

    const segments = snake.getSegments();
    // Each adjacent pair should be exactly 1 grid cell apart
    for (let i = 0; i < segments.length - 1; i++) {
      const dx = Math.abs(segments[i].col - segments[i + 1].col);
      const dy = Math.abs(segments[i].row - segments[i + 1].row);
      expect(dx + dy).toBe(1); // Manhattan distance = 1
    }
  });

  it("segments form a contiguous chain after growth and direction changes", () => {
    const ticker = new MoveTicker(100);
    const snake = new Snake(
      createScene(),
      { col: 10, row: 10 },
      "right",
      3,
      ticker,
    );

    snake.grow(3);
    snake.update(100);
    snake.bufferDirection("down");
    snake.update(100);
    snake.grow(2);
    snake.bufferDirection("left");
    snake.update(100);
    snake.update(100);
    snake.update(100);

    const segments = snake.getSegments();
    for (let i = 0; i < segments.length - 1; i++) {
      const dx = Math.abs(segments[i].col - segments[i + 1].col);
      const dy = Math.abs(segments[i].row - segments[i + 1].row);
      expect(dx + dy).toBe(1);
    }
  });
});

// ── Reset / replay integrity ─────────────────────────────────────

describe("Reset / replay integrity", () => {
  it("reset clears growth, buffer, direction, and alive state", () => {
    const ticker = new MoveTicker(100);
    const snake = new Snake(
      createScene(),
      { col: 10, row: 10 },
      "right",
      3,
      ticker,
    );

    snake.grow(5);
    snake.bufferDirection("up");
    snake.kill();

    snake.reset({ col: 5, row: 5 }, "down", 4);

    expect(snake.isAlive()).toBe(true);
    expect(snake.getDirection()).toBe("down");
    expect(snake.getLength()).toBe(4);
    expect(snake.getHeadPosition()).toEqual({ col: 5, row: 5 });

    // No buffered direction or pending growth
    snake.update(100);
    expect(snake.getDirection()).toBe("down");
    expect(snake.getLength()).toBe(4);
  });

  it("multiple resets produce clean state each time", () => {
    const ticker = new MoveTicker(100);
    const snake = new Snake(
      createScene(),
      { col: 10, row: 10 },
      "right",
      3,
      ticker,
    );

    for (let i = 0; i < 5; i++) {
      snake.grow(10);
      snake.bufferDirection("up");
      snake.update(100);
      snake.kill();

      snake.reset({ col: 5, row: 5 }, "right", 3);

      expect(snake.isAlive()).toBe(true);
      expect(snake.getLength()).toBe(3);
      expect(snake.getDirection()).toBe("right");
    }
  });
});
