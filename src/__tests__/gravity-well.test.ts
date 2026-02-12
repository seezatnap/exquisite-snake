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
  GravityWellManager,
  GRAVITY_PULL_CADENCE,
  GRAVITY_CENTER,
} from "@/game/entities/GravityWell";
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

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Exported constants ──────────────────────────────────────────

describe("GravityWell exported constants", () => {
  it("default pull cadence is 4 steps", () => {
    expect(GRAVITY_PULL_CADENCE).toBe(4);
  });

  it("gravity center is at arena midpoint", () => {
    expect(GRAVITY_CENTER.col).toBe(Math.floor(GRID_COLS / 2));
    expect(GRAVITY_CENTER.row).toBe(Math.floor(GRID_ROWS / 2));
  });
});

// ── Construction ────────────────────────────────────────────────

describe("GravityWellManager construction", () => {
  it("starts with zero step count", () => {
    const mgr = new GravityWellManager();
    expect(mgr.getStepCount()).toBe(0);
  });

  it("uses default cadence and center", () => {
    const mgr = new GravityWellManager();
    expect(mgr.getCadence()).toBe(GRAVITY_PULL_CADENCE);
    expect(mgr.getCenter()).toEqual(GRAVITY_CENTER);
  });

  it("accepts custom cadence", () => {
    const mgr = new GravityWellManager(8);
    expect(mgr.getCadence()).toBe(8);
  });

  it("accepts custom center", () => {
    const center = { col: 5, row: 5 };
    const mgr = new GravityWellManager(4, center);
    expect(mgr.getCenter()).toEqual(center);
  });

  it("getStepsUntilNextPull starts at cadence", () => {
    const mgr = new GravityWellManager(6);
    expect(mgr.getStepsUntilNextPull()).toBe(6);
  });
});

// ── Step counting and cadence ───────────────────────────────────

describe("GravityWellManager step counting", () => {
  it("increments step counter on each onSnakeStep call", () => {
    const mgr = new GravityWellManager(10);
    const snake = createSnake({ col: 0, row: 0 });

    mgr.onSnakeStep(snake);
    expect(mgr.getStepCount()).toBe(1);

    mgr.onSnakeStep(snake);
    expect(mgr.getStepCount()).toBe(2);
  });

  it("does not apply nudge before cadence is reached", () => {
    const mgr = new GravityWellManager(4, { col: 20, row: 15 });
    const snake = createSnake({ col: 10, row: 10 });

    // Steps 1-3 should not nudge
    for (let i = 0; i < 3; i++) {
      const nudged = mgr.onSnakeStep(snake);
      expect(nudged).toBe(false);
    }
    expect(snake.getHeadPosition()).toEqual({ col: 10, row: 10 });
  });

  it("applies nudge exactly when cadence is reached", () => {
    const mgr = new GravityWellManager(4, { col: 20, row: 15 });
    const snake = createSnake({ col: 10, row: 10 });

    // Steps 1-3: no nudge
    for (let i = 0; i < 3; i++) {
      mgr.onSnakeStep(snake);
    }

    // Step 4: nudge occurs
    const nudged = mgr.onSnakeStep(snake);
    expect(nudged).toBe(true);
  });

  it("resets step counter after a nudge", () => {
    const mgr = new GravityWellManager(4, { col: 20, row: 15 });
    const snake = createSnake({ col: 10, row: 10 });

    for (let i = 0; i < 4; i++) {
      mgr.onSnakeStep(snake);
    }

    expect(mgr.getStepCount()).toBe(0);
  });

  it("nudges repeatedly at the cadence interval", () => {
    const mgr = new GravityWellManager(3, { col: 20, row: 15 });
    const snake = createSnake({ col: 10, row: 10 });

    let nudgeCount = 0;
    for (let i = 0; i < 12; i++) {
      if (mgr.onSnakeStep(snake)) nudgeCount++;
    }

    // 12 steps / cadence 3 = 4 nudges
    expect(nudgeCount).toBe(4);
  });

  it("getStepsUntilNextPull decrements correctly", () => {
    const mgr = new GravityWellManager(4);
    const snake = createSnake({ col: 0, row: 0 });

    expect(mgr.getStepsUntilNextPull()).toBe(4);

    mgr.onSnakeStep(snake);
    expect(mgr.getStepsUntilNextPull()).toBe(3);

    mgr.onSnakeStep(snake);
    expect(mgr.getStepsUntilNextPull()).toBe(2);

    mgr.onSnakeStep(snake);
    expect(mgr.getStepsUntilNextPull()).toBe(1);

    mgr.onSnakeStep(snake); // nudge fires, counter resets
    expect(mgr.getStepsUntilNextPull()).toBe(4);
  });
});

// ── Nudge direction (computeNudge) ──────────────────────────────

describe("GravityWellManager.computeNudge", () => {
  const center = { col: 20, row: 15 };

  it("nudges right when head is left of center (col-dominant)", () => {
    const nudge = GravityWellManager.computeNudge(
      { col: 10, row: 15 },
      center,
    );
    expect(nudge).toEqual({ col: 1, row: 0 });
  });

  it("nudges left when head is right of center (col-dominant)", () => {
    const nudge = GravityWellManager.computeNudge(
      { col: 30, row: 15 },
      center,
    );
    expect(nudge).toEqual({ col: -1, row: 0 });
  });

  it("nudges down when head is above center (row-dominant)", () => {
    const nudge = GravityWellManager.computeNudge(
      { col: 20, row: 5 },
      center,
    );
    expect(nudge).toEqual({ col: 0, row: 1 });
  });

  it("nudges up when head is below center (row-dominant)", () => {
    const nudge = GravityWellManager.computeNudge(
      { col: 20, row: 25 },
      center,
    );
    expect(nudge).toEqual({ col: 0, row: -1 });
  });

  it("returns {0,0} when head is at center", () => {
    const nudge = GravityWellManager.computeNudge(center, center);
    expect(nudge).toEqual({ col: 0, row: 0 });
  });

  it("prefers col axis on tie (deterministic)", () => {
    // Distance: col=5, row=5 → col wins tie
    const nudge = GravityWellManager.computeNudge(
      { col: 15, row: 10 },
      center,
    );
    expect(nudge).toEqual({ col: 1, row: 0 });
  });

  it("nudges row when row distance is strictly larger", () => {
    // Distance: col=2, row=10
    const nudge = GravityWellManager.computeNudge(
      { col: 18, row: 5 },
      center,
    );
    expect(nudge).toEqual({ col: 0, row: 1 });
  });

  it("handles diagonal offset with col dominant", () => {
    // col diff = 10, row diff = 5 → col wins
    const nudge = GravityWellManager.computeNudge(
      { col: 10, row: 10 },
      center,
    );
    expect(nudge).toEqual({ col: 1, row: 0 });
  });

  it("handles head one tile away on col axis", () => {
    const nudge = GravityWellManager.computeNudge(
      { col: 19, row: 15 },
      center,
    );
    expect(nudge).toEqual({ col: 1, row: 0 });
  });

  it("handles head one tile away on row axis", () => {
    const nudge = GravityWellManager.computeNudge(
      { col: 20, row: 14 },
      center,
    );
    expect(nudge).toEqual({ col: 0, row: 1 });
  });
});

// ── Nudge application on snake ──────────────────────────────────

describe("GravityWellManager nudge application", () => {
  it("moves snake head 1 tile toward center on nudge", () => {
    const center = { col: 20, row: 15 };
    const mgr = new GravityWellManager(1, center); // cadence 1 = every step
    const snake = createSnake({ col: 10, row: 15 });

    mgr.onSnakeStep(snake);
    // Head should be nudged 1 tile right (toward col 20)
    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 15 });
  });

  it("does not nudge when head is at center", () => {
    const center = { col: 20, row: 15 };
    const mgr = new GravityWellManager(1, center);
    const snake = createSnake(center);

    const nudged = mgr.onSnakeStep(snake);
    expect(nudged).toBe(false);
    expect(snake.getHeadPosition()).toEqual(center);
  });

  it("cumulative nudges move head progressively toward center", () => {
    const center = { col: 15, row: 15 };
    const mgr = new GravityWellManager(1, center); // every step
    const snake = createSnake({ col: 10, row: 15 });

    // 5 nudges should move head from col 10 → col 15
    for (let i = 0; i < 5; i++) {
      mgr.onSnakeStep(snake);
    }

    expect(snake.getHeadPosition()).toEqual(center);
  });

  it("nudge only affects head, not body segments", () => {
    const center = { col: 20, row: 15 };
    const mgr = new GravityWellManager(1, center);
    const snake = createSnake({ col: 10, row: 15 }, "right", 5);

    const bodyBefore = snake.getSegments().slice(1).map((s) => ({ ...s }));

    mgr.onSnakeStep(snake);

    const bodyAfter = snake.getSegments().slice(1);
    expect(bodyAfter).toEqual(bodyBefore);
  });
});

// ── Reset ────────────────────────────────────────────────────────

describe("GravityWellManager reset", () => {
  it("resets step counter to zero", () => {
    const mgr = new GravityWellManager(10);
    const snake = createSnake({ col: 0, row: 0 });

    mgr.onSnakeStep(snake);
    mgr.onSnakeStep(snake);
    expect(mgr.getStepCount()).toBe(2);

    mgr.reset();
    expect(mgr.getStepCount()).toBe(0);
  });

  it("after reset, full cadence is needed before next nudge", () => {
    const center = { col: 20, row: 15 };
    const mgr = new GravityWellManager(4, center);
    const snake = createSnake({ col: 10, row: 15 });

    // Advance 3 steps
    for (let i = 0; i < 3; i++) {
      mgr.onSnakeStep(snake);
    }
    expect(mgr.getStepCount()).toBe(3);

    mgr.reset();

    // Now need 4 more steps to nudge, not 1
    let nudged = false;
    for (let i = 0; i < 3; i++) {
      nudged = mgr.onSnakeStep(snake);
    }
    expect(nudged).toBe(false);

    nudged = mgr.onSnakeStep(snake);
    expect(nudged).toBe(true);
  });
});

// ── Destroy ──────────────────────────────────────────────────────

describe("GravityWellManager destroy", () => {
  it("resets state on destroy", () => {
    const mgr = new GravityWellManager(10);
    const snake = createSnake({ col: 0, row: 0 });

    mgr.onSnakeStep(snake);
    mgr.onSnakeStep(snake);

    mgr.destroy();
    expect(mgr.getStepCount()).toBe(0);
  });
});

// ── Snake.applyPositionNudge ────────────────────────────────────

describe("Snake applyPositionNudge", () => {
  it("shifts head by the given delta", () => {
    const snake = createSnake({ col: 10, row: 10 });
    snake.applyPositionNudge({ col: 1, row: 0 });
    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 10 });
  });

  it("can apply negative deltas", () => {
    const snake = createSnake({ col: 10, row: 10 });
    snake.applyPositionNudge({ col: -1, row: 0 });
    expect(snake.getHeadPosition()).toEqual({ col: 9, row: 10 });
  });

  it("can nudge on row axis", () => {
    const snake = createSnake({ col: 10, row: 10 });
    snake.applyPositionNudge({ col: 0, row: -1 });
    expect(snake.getHeadPosition()).toEqual({ col: 10, row: 9 });
  });

  it("zero delta is a no-op", () => {
    const snake = createSnake({ col: 10, row: 10 });
    snake.applyPositionNudge({ col: 0, row: 0 });
    expect(snake.getHeadPosition()).toEqual({ col: 10, row: 10 });
  });

  it("does not affect body segments", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 5);
    const bodyBefore = snake.getSegments().slice(1).map((s) => ({ ...s }));

    snake.applyPositionNudge({ col: 1, row: 0 });

    const bodyAfter = snake.getSegments().slice(1);
    expect(bodyAfter).toEqual(bodyBefore);
  });

  it("head position is correct after multiple nudges", () => {
    const snake = createSnake({ col: 10, row: 10 });

    snake.applyPositionNudge({ col: 1, row: 0 });
    snake.applyPositionNudge({ col: 0, row: -1 });
    snake.applyPositionNudge({ col: -1, row: 0 });

    expect(snake.getHeadPosition()).toEqual({ col: 10, row: 9 });
  });
});

// ── Determinism ─────────────────────────────────────────────────

describe("GravityWellManager determinism", () => {
  it("same initial conditions produce identical nudge sequences", () => {
    const center = { col: 20, row: 15 };

    // Run 1
    const mgr1 = new GravityWellManager(3, center);
    const snake1 = createSnake({ col: 5, row: 5 });
    const positions1: GridPos[] = [];
    for (let i = 0; i < 12; i++) {
      mgr1.onSnakeStep(snake1);
      positions1.push(snake1.getHeadPosition());
    }

    // Run 2
    const mgr2 = new GravityWellManager(3, center);
    const snake2 = createSnake({ col: 5, row: 5 });
    const positions2: GridPos[] = [];
    for (let i = 0; i < 12; i++) {
      mgr2.onSnakeStep(snake2);
      positions2.push(snake2.getHeadPosition());
    }

    expect(positions1).toEqual(positions2);
  });
});

// ── Edge cases ──────────────────────────────────────────────────

describe("GravityWellManager edge cases", () => {
  it("nudge near arena edge can push head out of bounds", () => {
    // The gravity well can push the snake into a wall — this is by design.
    // The game loop's collision detection will catch it.
    const center = { col: 20, row: 15 };
    const mgr = new GravityWellManager(1, center);
    const snake = createSnake({ col: 0, row: 15 });

    // Snake at col=0, center at col=20, so nudge is +1 col (toward center)
    mgr.onSnakeStep(snake);
    expect(snake.getHeadPosition().col).toBe(1);
  });

  it("handles cadence of 1 (every step nudges)", () => {
    const center = { col: 20, row: 15 };
    const mgr = new GravityWellManager(1, center);
    const snake = createSnake({ col: 15, row: 15 });

    let nudgeCount = 0;
    for (let i = 0; i < 5; i++) {
      if (mgr.onSnakeStep(snake)) nudgeCount++;
    }

    // 5 steps, cadence 1, all 5 should nudge
    expect(nudgeCount).toBe(5);
    expect(snake.getHeadPosition()).toEqual({ col: 20, row: 15 });
  });

  it("stops nudging once head reaches center", () => {
    const center = { col: 12, row: 15 };
    const mgr = new GravityWellManager(1, center);
    const snake = createSnake({ col: 10, row: 15 });

    // 2 nudges to reach center
    mgr.onSnakeStep(snake);
    mgr.onSnakeStep(snake);
    expect(snake.getHeadPosition()).toEqual(center);

    // Further steps should not nudge
    const nudged = mgr.onSnakeStep(snake);
    expect(nudged).toBe(false);
    expect(snake.getHeadPosition()).toEqual(center);
  });

  it("switches nudge axis as snake crosses center on one axis", () => {
    const center = { col: 15, row: 15 };
    const mgr = new GravityWellManager(1, center);
    // Head at same row as center, only col differs
    const snake = createSnake({ col: 10, row: 15 });

    // col diff = 5, row diff = 0 → nudge on col axis
    mgr.onSnakeStep(snake);
    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 15 });

    // Now head at (11, 15): col diff = 4, row diff = 0 → still col
    mgr.onSnakeStep(snake);
    expect(snake.getHeadPosition()).toEqual({ col: 12, row: 15 });
  });
});
