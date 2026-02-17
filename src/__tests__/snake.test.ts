import { describe, it, expect, beforeEach, vi } from "vitest";

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
import { MoveTicker, gridToPixel } from "@/game/utils/grid";
import type { GridPos, Direction } from "@/game/utils/grid";

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

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Construction ─────────────────────────────────────────────────

describe("Snake construction", () => {
  it("creates a snake with correct head position", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    expect(snake.getHeadPosition()).toEqual({ col: 10, row: 10 });
  });

  it("creates body segments trailing opposite to direction", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const segments = snake.getSegments();
    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ col: 10, row: 10 }); // head
    expect(segments[1]).toEqual({ col: 9, row: 10 }); // body
    expect(segments[2]).toEqual({ col: 8, row: 10 }); // tail
  });

  it("creates body trailing upward when direction is down", () => {
    const snake = createSnake({ col: 5, row: 5 }, "down", 3);
    const segments = snake.getSegments();
    expect(segments[0]).toEqual({ col: 5, row: 5 });
    expect(segments[1]).toEqual({ col: 5, row: 4 });
    expect(segments[2]).toEqual({ col: 5, row: 3 });
  });

  it("creates body trailing downward when direction is up", () => {
    const snake = createSnake({ col: 5, row: 5 }, "up", 3);
    const segments = snake.getSegments();
    expect(segments[0]).toEqual({ col: 5, row: 5 });
    expect(segments[1]).toEqual({ col: 5, row: 6 });
    expect(segments[2]).toEqual({ col: 5, row: 7 });
  });

  it("creates body trailing right when direction is left", () => {
    const snake = createSnake({ col: 5, row: 5 }, "left", 3);
    const segments = snake.getSegments();
    expect(segments[0]).toEqual({ col: 5, row: 5 });
    expect(segments[1]).toEqual({ col: 6, row: 5 });
    expect(segments[2]).toEqual({ col: 7, row: 5 });
  });

  it("defaults to length 3 and direction right", () => {
    const scene = createScene();
    const snake = new Snake(scene, { col: 10, row: 10 });
    expect(snake.getLength()).toBe(3);
    expect(snake.getDirection()).toBe("right");
  });

  it("creates sprites for each segment", () => {
    const scene = createScene();
    new Snake(scene, { col: 10, row: 10 }, "right", 4);
    expect(scene.add.sprite).toHaveBeenCalledTimes(4);
  });

  it("starts alive", () => {
    const snake = createSnake();
    expect(snake.isAlive()).toBe(true);
  });
});

// ── Movement ─────────────────────────────────────────────────────

describe("Snake movement", () => {
  it("moves right by default after one full tick", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.update(100); // full tick

    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 10 });
  });

  it("does not move before tick interval elapses", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.update(50);

    expect(snake.getHeadPosition()).toEqual({ col: 10, row: 10 });
  });

  it("body follows the head after moving", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.update(100);

    const segments = snake.getSegments();
    expect(segments[0]).toEqual({ col: 11, row: 10 }); // new head
    expect(segments[1]).toEqual({ col: 10, row: 10 }); // old head is body
    expect(segments[2]).toEqual({ col: 9, row: 10 }); // old body
  });

  it("maintains length after moving (no growth)", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.update(100);
    snake.update(100);

    expect(snake.getLength()).toBe(3);
  });

  it("moves in all four directions", () => {
    const directions: Direction[] = ["up", "down", "left", "right"];
    const expectedDeltas: Record<Direction, [number, number]> = {
      up: [0, -1],
      down: [0, 1],
      left: [-1, 0],
      right: [1, 0],
    };

    for (const dir of directions) {
      const ticker = new MoveTicker(100);
      const snake = createSnake({ col: 10, row: 10 }, dir, 3, ticker);
      snake.update(100);

      const head = snake.getHeadPosition();
      const [dc, dr] = expectedDeltas[dir];
      expect(head).toEqual({ col: 10 + dc, row: 10 + dr });
    }
  });

  it("returns true when a step occurs", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    expect(snake.update(100)).toBe(true);
  });

  it("returns false when no step occurs", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    expect(snake.update(50)).toBe(false);
  });

  it("does not move when dead", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.kill();
    const result = snake.update(100);

    expect(result).toBe(false);
    expect(snake.getHeadPosition()).toEqual({ col: 10, row: 10 });
  });
});

describe("Snake external nudges", () => {
  it("applies a one-tile nudge without changing the facing direction", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);

    snake.applyExternalNudge("down");

    expect(snake.getHeadPosition()).toEqual({ col: 10, row: 11 });
    expect(snake.getDirection()).toBe("right");
  });

  it("shifts body segments while preserving length", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);

    snake.applyExternalNudge("down");

    expect(snake.getSegments()).toEqual([
      { col: 10, row: 11 },
      { col: 10, row: 10 },
      { col: 9, row: 10 },
    ]);
    expect(snake.getLength()).toBe(3);
  });
});

describe("Snake portal traversal", () => {
  it("teleports the head without changing direction, length, or body order", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);

    snake.teleportHeadTo({ col: 3, row: 4 });

    expect(snake.getDirection()).toBe("right");
    expect(snake.getLength()).toBe(3);
    expect(snake.getSegments()).toEqual([
      { col: 3, row: 4 },
      { col: 9, row: 10 },
      { col: 8, row: 10 },
    ]);
  });

  it("ignores portal head teleport requests after death", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    snake.kill();

    snake.teleportHeadTo({ col: 3, row: 4 });

    expect(snake.getHeadPosition()).toEqual({ col: 10, row: 10 });
  });

  it("threads body segments through the portal one-by-one in order", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 4, ticker);

    snake.update(100); // head -> entry cell (11,10)
    snake.beginPortalTraversal({ col: 11, row: 10 }, { col: 3, row: 4 });

    expect(snake.getSegments()).toEqual([
      { col: 3, row: 4 },
      { col: 10, row: 10 },
      { col: 9, row: 10 },
      { col: 8, row: 10 },
    ]);
    expect(snake.isPortalThreadingActive()).toBe(true);
    expect(snake.getPortalTraversalSnapshots()).toEqual([
      {
        entry: { col: 11, row: 10 },
        exit: { col: 3, row: 4 },
        stepsElapsed: 0,
        remainingBodySegments: 3,
      },
    ]);

    snake.update(100); // segment #1 threads
    expect(snake.getSegments()).toEqual([
      { col: 4, row: 4 },
      { col: 3, row: 4 },
      { col: 10, row: 10 },
      { col: 9, row: 10 },
    ]);

    snake.update(100); // segment #2 threads
    expect(snake.getSegments()).toEqual([
      { col: 5, row: 4 },
      { col: 4, row: 4 },
      { col: 3, row: 4 },
      { col: 10, row: 10 },
    ]);
    expect(snake.getPortalTraversalSnapshots()).toEqual([
      {
        entry: { col: 11, row: 10 },
        exit: { col: 3, row: 4 },
        stepsElapsed: 2,
        remainingBodySegments: 1,
      },
    ]);

    snake.update(100); // segment #3 threads (complete)
    expect(snake.getSegments()).toEqual([
      { col: 6, row: 4 },
      { col: 5, row: 4 },
      { col: 4, row: 4 },
      { col: 3, row: 4 },
    ]);
    expect(snake.isPortalThreadingActive()).toBe(false);
    expect(snake.getPortalTraversalSnapshots()).toEqual([]);
  });

  it("keeps threaded body interpolation anchored at the portal exit", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 4, ticker);

    snake.update(100); // head -> entry
    snake.beginPortalTraversal({ col: 11, row: 10 }, { col: 3, row: 4 });
    snake.update(100); // first body segment threads to exit

    mockSetPosition.mockClear();
    snake.update(50); // interpolation-only frame

    const frameCalls = mockSetPosition.mock.calls.slice(-snake.getLength());
    const firstBodyFramePos = frameCalls[1];
    const portalExitPixel = gridToPixel({ col: 3, row: 4 });

    expect(firstBodyFramePos).toEqual([portalExitPixel.x, portalExitPixel.y]);
  });
});

// ── Direction input buffering ────────────────────────────────────

describe("Snake input buffering", () => {
  it("buffers a valid perpendicular direction", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.bufferDirection("up");
    snake.update(100);

    expect(snake.getDirection()).toBe("up");
    expect(snake.getHeadPosition()).toEqual({ col: 10, row: 9 });
  });

  it("consumes buffered directions one per step", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.bufferDirection("up");
    snake.bufferDirection("left");

    snake.update(100); // consumes "up"
    expect(snake.getDirection()).toBe("up");

    snake.update(100); // consumes "left"
    expect(snake.getDirection()).toBe("left");
  });

  it("limits buffer to 2 entries", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.bufferDirection("up");
    snake.bufferDirection("left");
    snake.bufferDirection("down"); // should be rejected (buffer full)

    snake.update(100);
    expect(snake.getDirection()).toBe("up");

    snake.update(100);
    expect(snake.getDirection()).toBe("left");

    snake.update(100); // no more buffered, keeps "left"
    expect(snake.getDirection()).toBe("left");
  });

  it("continues in current direction when buffer is empty", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.update(100);
    snake.update(100);

    expect(snake.getHeadPosition()).toEqual({ col: 12, row: 10 });
  });

  it("reports queued directions while inputs are buffered", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.bufferDirection("up");
    expect(snake.hasQueuedDirection("up")).toBe(true);
    expect(snake.hasQueuedDirection("left")).toBe(false);

    snake.update(100); // consumes "up"
    expect(snake.hasQueuedDirection("up")).toBe(false);
  });

  it("supports a direction guard that can reject biome-specific inputs", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);
    snake.setDirectionInputGuard((dir) => dir !== "up");

    snake.bufferDirection("up"); // rejected by guard
    snake.update(100);

    expect(snake.getDirection()).toBe("right");
    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 10 });
  });

  it("marks guard-rejected inputs as protected no-ops", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    snake.setDirectionInputGuard(() => false);

    snake.bufferDirection("up");

    expect(snake.consumeRejectedOppositeDirectionInput()).toBe(true);
    expect(snake.consumeRejectedOppositeDirectionInput()).toBe(false);
  });
});

// ── Ice Cavern turn momentum ─────────────────────────────────────

describe("Snake turn momentum", () => {
  it("applies a buffered turn only after 2 extra tiles when momentum is enabled", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);
    snake.setTurnMomentumTiles(2);

    snake.bufferDirection("up");

    snake.update(100); // extra slide tile 1
    expect(snake.getDirection()).toBe("right");
    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 10 });

    snake.update(100); // extra slide tile 2
    expect(snake.getDirection()).toBe("right");
    expect(snake.getHeadPosition()).toEqual({ col: 12, row: 10 });

    snake.update(100); // delayed turn applies now
    expect(snake.getDirection()).toBe("up");
    expect(snake.getHeadPosition()).toEqual({ col: 12, row: 9 });
  });

  it("buffers follow-up input against the pending delayed turn direction", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);
    snake.setTurnMomentumTiles(2);

    snake.bufferDirection("up");
    snake.update(100); // pending turn is "up"; still sliding right

    // Must be accepted as a follow-up to "up" (valid), not rejected as opposite of current "right".
    snake.bufferDirection("left");

    snake.update(100); // second slide tile before turning up
    snake.update(100); // turn to up
    snake.update(100); // slide up 1 before turning left
    snake.update(100); // slide up 2 before turning left
    snake.update(100); // turn to left

    expect(snake.getDirection()).toBe("left");
    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 7 });
  });

  it("applies pending delayed turns immediately after momentum is disabled", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);
    snake.setTurnMomentumTiles(2);

    snake.bufferDirection("up");
    snake.update(100); // still sliding right
    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 10 });

    snake.setTurnMomentumTiles(0);
    snake.update(100); // pending turn applies without extra slide

    expect(snake.getDirection()).toBe("up");
    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 9 });
  });
});

// ── Anti-180-degree turn rules ───────────────────────────────────

describe("Snake anti-180-degree turn", () => {
  it("rejects opposite direction (moving right, buffer left)", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.bufferDirection("left");
    snake.update(100);

    // Should continue right, not left
    expect(snake.getDirection()).toBe("right");
    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 10 });
  });

  it("rejects opposite direction (moving up, buffer down)", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "up", 3, ticker);

    snake.bufferDirection("down");
    snake.update(100);

    expect(snake.getDirection()).toBe("up");
  });

  it("rejects opposite direction (moving down, buffer up)", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "down", 3, ticker);

    snake.bufferDirection("up");
    snake.update(100);

    expect(snake.getDirection()).toBe("down");
  });

  it("rejects opposite direction (moving left, buffer right)", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "left", 3, ticker);

    snake.bufferDirection("right");
    snake.update(100);

    expect(snake.getDirection()).toBe("left");
  });

  it("rejects same direction as current", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.bufferDirection("right");
    // Buffer should be empty since same dir is rejected
    snake.bufferDirection("up"); // this should succeed
    snake.update(100);

    expect(snake.getDirection()).toBe("up");
  });

  it("anti-180 checks against last buffered direction, not current", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.bufferDirection("up"); // valid: perpendicular to "right"
    snake.bufferDirection("down"); // rejected: opposite of buffered "up"

    snake.update(100);
    expect(snake.getDirection()).toBe("up");

    snake.update(100); // no more buffer, continues "up"
    expect(snake.getDirection()).toBe("up");
  });

  it("anti-180 allows valid second buffer entry", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.bufferDirection("up"); // valid
    snake.bufferDirection("left"); // valid: perpendicular to "up"

    snake.update(100);
    expect(snake.getDirection()).toBe("up");

    snake.update(100);
    expect(snake.getDirection()).toBe("left");
  });

  it("records and consumes rejected opposite-direction input flags", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.bufferDirection("left"); // rejected opposite
    expect(snake.consumeRejectedOppositeDirectionInput()).toBe(true);
    expect(snake.consumeRejectedOppositeDirectionInput()).toBe(false);

    snake.bufferDirection("up"); // accepted
    expect(snake.consumeRejectedOppositeDirectionInput()).toBe(false);
  });
});

// ── Growth ───────────────────────────────────────────────────────

describe("Snake growth", () => {
  it("grows by 1 segment when grow() is called", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.grow();
    snake.update(100); // grow happens on next step

    expect(snake.getLength()).toBe(4);
  });

  it("grows by multiple segments over multiple steps", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.grow(3);
    snake.update(100);
    expect(snake.getLength()).toBe(4);
    snake.update(100);
    expect(snake.getLength()).toBe(5);
    snake.update(100);
    expect(snake.getLength()).toBe(6);
    snake.update(100); // no more growth
    expect(snake.getLength()).toBe(6);
  });

  it("tail stays in place during growth", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);
    const tailBefore = snake.getSegments()[2]; // { col: 8, row: 10 }

    snake.grow();
    snake.update(100);

    const segments = snake.getSegments();
    // After growth: head at 11, old head at 10, old body at 9, old tail at 8
    expect(segments[segments.length - 1]).toEqual(tailBefore);
  });

  it("creates new sprite when growing", () => {
    const scene = createScene();
    const ticker = new MoveTicker(100);
    const snake = new Snake(scene, { col: 10, row: 10 }, "right", 3, ticker);

    vi.clearAllMocks();
    snake.grow();
    snake.update(100);

    expect(scene.add.sprite).toHaveBeenCalledTimes(1);
  });
});

// ── Tail burn (Molten Core) ──────────────────────────────────────

describe("Snake tail burn", () => {
  it("burnTailSegments removes tail segments and their sprites", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 6);
    mockDestroy.mockClear();

    expect(snake.burnTailSegments(3)).toBe(true);
    expect(snake.getLength()).toBe(3);
    expect(mockDestroy).toHaveBeenCalledTimes(3);
  });

  it("burnTailSegments fails when burn would consume the head", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const before = snake.getSegments().map((segment) => ({ ...segment }));

    expect(snake.burnTailSegments(3)).toBe(false);
    expect(snake.getLength()).toBe(3);
    expect(snake.getSegments()).toEqual(before);
  });

  it("burnTailSegments treats non-positive burns as a no-op", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 4);

    expect(snake.burnTailSegments(0)).toBe(true);
    expect(snake.getLength()).toBe(4);
  });
});

// ── Collision detection ──────────────────────────────────────────

describe("Snake collision detection", () => {
  it("isOnBody returns false for head position", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    expect(snake.isOnBody({ col: 10, row: 10 })).toBe(false);
  });

  it("isOnBody returns true for a body segment", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    expect(snake.isOnBody({ col: 9, row: 10 })).toBe(true);
    expect(snake.isOnBody({ col: 8, row: 10 })).toBe(true);
  });

  it("isOnBody returns false for position not on snake", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    expect(snake.isOnBody({ col: 15, row: 15 })).toBe(false);
  });

  it("isOnSnake returns true for head", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    expect(snake.isOnSnake({ col: 10, row: 10 })).toBe(true);
  });

  it("isOnSnake returns true for body", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    expect(snake.isOnSnake({ col: 9, row: 10 })).toBe(true);
  });

  it("isOnSnake returns false for empty position", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    expect(snake.isOnSnake({ col: 0, row: 0 })).toBe(false);
  });

  it("hasSelfCollision returns false initially", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    expect(snake.hasSelfCollision()).toBe(false);
  });
});

// ── Kill / Alive ─────────────────────────────────────────────────

describe("Snake kill/alive", () => {
  it("kill sets alive to false", () => {
    const snake = createSnake();
    expect(snake.isAlive()).toBe(true);
    snake.kill();
    expect(snake.isAlive()).toBe(false);
  });

  it("update returns false after kill", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);
    snake.kill();
    expect(snake.update(100)).toBe(false);
  });
});

// ── Sprite interpolation ─────────────────────────────────────────

describe("Snake sprite interpolation", () => {
  it("updates sprite positions on update", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    mockSetPosition.mockClear();
    snake.update(50); // half-step, should trigger interpolation

    // setPosition should be called for each segment
    expect(mockSetPosition).toHaveBeenCalled();
  });

  it("calls setPosition for all segments", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 4, ticker);

    mockSetPosition.mockClear();
    snake.update(50);

    // 4 segments = 4 setPosition calls
    expect(mockSetPosition).toHaveBeenCalledTimes(4);
  });
});

// ── Input setup ──────────────────────────────────────────────────

describe("Snake input setup", () => {
  it("registers a keydown listener via setupInput", () => {
    const scene = createScene();
    const snake = new Snake(scene, { col: 10, row: 10 }, "right", 3);

    snake.setupInput();

    expect(mockKeyboardOn).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("keyboard handler maps arrow keys to directions", () => {
    const scene = createScene();
    const ticker = new MoveTicker(100);
    const snake = new Snake(scene, { col: 10, row: 10 }, "right", 3, ticker);

    snake.setupInput();

    // Get the registered handler
    const handler = mockKeyboardOn.mock.calls[0][1];

    // Simulate ArrowUp key
    handler({ code: "ArrowUp" });
    snake.update(100);
    expect(snake.getDirection()).toBe("up");
  });

  it("keyboard handler maps WASD keys to directions", () => {
    const scene = createScene();
    const ticker = new MoveTicker(100);
    const snake = new Snake(scene, { col: 10, row: 10 }, "right", 3, ticker);

    snake.setupInput();
    const handler = mockKeyboardOn.mock.calls[0][1];

    handler({ code: "KeyW" });
    snake.update(100);
    expect(snake.getDirection()).toBe("up");
  });

  it("keyboard handler ignores unmapped keys", () => {
    const scene = createScene();
    const ticker = new MoveTicker(100);
    const snake = new Snake(scene, { col: 10, row: 10 }, "right", 3, ticker);

    snake.setupInput();
    const handler = mockKeyboardOn.mock.calls[0][1];

    handler({ code: "Space" });
    snake.update(100);
    // Should still be moving right
    expect(snake.getDirection()).toBe("right");
  });

  it("handles missing keyboard gracefully", () => {
    const scene = createScene();
    (scene as unknown as { input: null }).input = null;
    const snake = new Snake(scene, { col: 10, row: 10 }, "right", 3);

    expect(() => snake.setupInput()).not.toThrow();
  });
});

// ── Destroy ──────────────────────────────────────────────────────

describe("Snake destroy", () => {
  it("destroys all sprites", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);

    mockDestroy.mockClear();
    snake.destroy();

    expect(mockDestroy).toHaveBeenCalledTimes(3);
  });

  it("sets alive to false", () => {
    const snake = createSnake();
    snake.destroy();
    expect(snake.isAlive()).toBe(false);
  });

  it("removes the keyboard keydown listener on destroy", () => {
    const scene = createScene();
    const snake = new Snake(scene, { col: 10, row: 10 }, "right", 3);

    snake.setupInput();

    // Capture the handler that was registered
    const handler = mockKeyboardOn.mock.calls[mockKeyboardOn.mock.calls.length - 1][1];

    mockKeyboardOff.mockClear();
    snake.destroy();

    expect(mockKeyboardOff).toHaveBeenCalledWith("keydown", handler);
  });

  it("does not call keyboard.off if setupInput was never called", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);

    mockKeyboardOff.mockClear();
    snake.destroy();

    expect(mockKeyboardOff).not.toHaveBeenCalled();
  });

  it("handles missing keyboard gracefully on destroy", () => {
    const scene = createScene();
    const snake = new Snake(scene, { col: 10, row: 10 }, "right", 3);

    snake.setupInput();

    // Remove keyboard before destroy
    (scene as unknown as { input: { keyboard: null } }).input = { keyboard: null };

    expect(() => snake.destroy()).not.toThrow();
  });

  it("prevents duplicate handlers across replay cycles", () => {
    const scene = createScene();

    // Simulate two replay cycles: create snake, setup, destroy, repeat
    const snake1 = new Snake(scene, { col: 10, row: 10 }, "right", 3);
    snake1.setupInput();
    const handler1 = mockKeyboardOn.mock.calls[mockKeyboardOn.mock.calls.length - 1][1];

    mockKeyboardOff.mockClear();
    snake1.destroy();
    expect(mockKeyboardOff).toHaveBeenCalledWith("keydown", handler1);

    // Second snake on the same scene
    const snake2 = new Snake(scene, { col: 10, row: 10 }, "right", 3);
    snake2.setupInput();
    const handler2 = mockKeyboardOn.mock.calls[mockKeyboardOn.mock.calls.length - 1][1];

    mockKeyboardOff.mockClear();
    snake2.destroy();
    expect(mockKeyboardOff).toHaveBeenCalledWith("keydown", handler2);

    // Each snake registered and removed its own unique handler
    expect(handler1).not.toBe(handler2);
  });
});

// ── Reset ────────────────────────────────────────────────────────

describe("Snake reset", () => {
  it("resets position and direction", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.update(100); // move once
    snake.reset({ col: 5, row: 5 }, "down", 4);

    expect(snake.getHeadPosition()).toEqual({ col: 5, row: 5 });
    expect(snake.getDirection()).toBe("down");
    expect(snake.getLength()).toBe(4);
  });

  it("resets alive state", () => {
    const snake = createSnake();
    snake.kill();
    snake.reset({ col: 5, row: 5 });
    expect(snake.isAlive()).toBe(true);
  });

  it("clears input buffer on reset", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.bufferDirection("up");
    snake.reset({ col: 5, row: 5 }, "right", 3);
    snake.update(100);

    // Buffer should have been cleared, so snake moves right (not up)
    expect(snake.getDirection()).toBe("right");
    expect(snake.getHeadPosition()).toEqual({ col: 6, row: 5 });
  });

  it("destroys old sprites and creates new ones", () => {
    const scene = createScene();
    const snake = new Snake(scene, { col: 10, row: 10 }, "right", 3);

    mockDestroy.mockClear();
    (scene.add.sprite as ReturnType<typeof vi.fn>).mockClear();

    snake.reset({ col: 5, row: 5 }, "down", 4);

    expect(mockDestroy).toHaveBeenCalledTimes(3); // old sprites destroyed
    expect(scene.add.sprite).toHaveBeenCalledTimes(4); // new sprites created
  });

  it("clears pending growth on reset", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.grow(5);
    snake.reset({ col: 5, row: 5 }, "right", 3);
    snake.update(100);

    // Growth should have been cleared
    expect(snake.getLength()).toBe(3);
  });
});

// ── Ticker access ────────────────────────────────────────────────

describe("Snake ticker", () => {
  it("exposes the movement ticker", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);
    expect(snake.getTicker()).toBe(ticker);
  });

  it("creates a default ticker when none provided", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    expect(snake.getTicker()).toBeInstanceOf(MoveTicker);
  });
});

// ── Multi-step integration ───────────────────────────────────────

describe("Snake multi-step integration", () => {
  it("handles rapid direction changes across steps correctly", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    // Buffer up, then left
    snake.bufferDirection("up");
    snake.bufferDirection("left");

    // Step 1: consumes "up"
    snake.update(100);
    expect(snake.getHeadPosition()).toEqual({ col: 10, row: 9 });

    // Step 2: consumes "left"
    snake.update(100);
    expect(snake.getHeadPosition()).toEqual({ col: 9, row: 9 });
  });

  it("snake moves multiple steps continuously", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.update(100);
    snake.update(100);
    snake.update(100);

    expect(snake.getHeadPosition()).toEqual({ col: 13, row: 10 });
    expect(snake.getLength()).toBe(3);
  });

  it("growth + direction change works correctly", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

    snake.grow();
    snake.bufferDirection("down");
    snake.update(100);

    expect(snake.getLength()).toBe(4);
    expect(snake.getHeadPosition()).toEqual({ col: 10, row: 11 });
    expect(snake.getDirection()).toBe("down");
  });
});
