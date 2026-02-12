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
import { IceMomentum, ICE_SLIDE_TILES } from "@/game/systems/IceMomentum";
import { MoveTicker } from "@/game/utils/grid";
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

function createSnakeWithIce(
  headPos: GridPos = { col: 10, row: 10 },
  direction: Direction = "right",
  length = 3,
  ticker?: MoveTicker,
): { snake: Snake; ice: IceMomentum } {
  const snake = createSnake(headPos, direction, length, ticker);
  const ice = new IceMomentum();
  ice.setEnabled(true);
  snake.setIceMomentum(ice);
  return { snake, ice };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── IceMomentum unit tests ──────────────────────────────────────

describe("IceMomentum – unit tests", () => {
  describe("initial state", () => {
    it("starts disabled", () => {
      const ice = new IceMomentum();
      expect(ice.isEnabled()).toBe(false);
    });

    it("starts not sliding", () => {
      const ice = new IceMomentum();
      expect(ice.isSliding()).toBe(false);
    });

    it("starts with remaining = 0", () => {
      const ice = new IceMomentum();
      expect(ice.getRemaining()).toBe(0);
    });

    it("starts with no pending direction", () => {
      const ice = new IceMomentum();
      expect(ice.getPendingDirection()).toBeNull();
    });
  });

  describe("setEnabled", () => {
    it("enables ice momentum", () => {
      const ice = new IceMomentum();
      ice.setEnabled(true);
      expect(ice.isEnabled()).toBe(true);
    });

    it("disables ice momentum", () => {
      const ice = new IceMomentum();
      ice.setEnabled(true);
      ice.setEnabled(false);
      expect(ice.isEnabled()).toBe(false);
    });

    it("cancels active slide when disabled", () => {
      const ice = new IceMomentum();
      ice.setEnabled(true);
      ice.beginSlide("up");
      expect(ice.isSliding()).toBe(true);

      ice.setEnabled(false);
      expect(ice.isSliding()).toBe(false);
      expect(ice.getRemaining()).toBe(0);
      expect(ice.getPendingDirection()).toBeNull();
    });
  });

  describe("beginSlide", () => {
    it("returns false when disabled", () => {
      const ice = new IceMomentum();
      expect(ice.beginSlide("up")).toBe(false);
    });

    it("returns true when enabled and starts a slide", () => {
      const ice = new IceMomentum();
      ice.setEnabled(true);
      expect(ice.beginSlide("up")).toBe(true);
      expect(ice.isSliding()).toBe(true);
      // remaining = ICE_SLIDE_TILES - 1 because the calling step counts as tile 1
      expect(ice.getRemaining()).toBe(ICE_SLIDE_TILES - 1);
      expect(ice.getPendingDirection()).toBe("up");
    });

    it("replaces pending direction if already sliding", () => {
      const ice = new IceMomentum();
      ice.setEnabled(true);
      ice.beginSlide("up");
      ice.beginSlide("left");
      expect(ice.getPendingDirection()).toBe("left");
      expect(ice.getRemaining()).toBe(ICE_SLIDE_TILES - 1);
    });
  });

  describe("advanceSlide", () => {
    it("returns null when not sliding", () => {
      const ice = new IceMomentum();
      expect(ice.advanceSlide()).toBeNull();
    });

    it("returns pending direction when slide completes (ICE_SLIDE_TILES=2)", () => {
      const ice = new IceMomentum();
      ice.setEnabled(true);
      ice.beginSlide("up");

      // beginSlide sets remaining = 1 (ICE_SLIDE_TILES - 1)
      // First advance completes the slide
      expect(ice.advanceSlide()).toBe("up");
      expect(ice.isSliding()).toBe(false);
      expect(ice.getPendingDirection()).toBeNull();
    });

    it("completes slide in exactly ICE_SLIDE_TILES - 1 advances", () => {
      const ice = new IceMomentum();
      ice.setEnabled(true);
      ice.beginSlide("down");

      let completedAt = -1;
      for (let i = 0; i < 10; i++) {
        const result = ice.advanceSlide();
        if (result !== null) {
          completedAt = i;
          break;
        }
      }
      // beginSlide step is tile 1, advanceSlide handles remaining tiles
      expect(completedAt).toBe(ICE_SLIDE_TILES - 2);
    });
  });

  describe("reset", () => {
    it("clears slide state but preserves enabled flag", () => {
      const ice = new IceMomentum();
      ice.setEnabled(true);
      ice.beginSlide("up");

      ice.reset();

      expect(ice.isSliding()).toBe(false);
      expect(ice.getRemaining()).toBe(0);
      expect(ice.getPendingDirection()).toBeNull();
      expect(ice.isEnabled()).toBe(true);
    });
  });

  describe("ICE_SLIDE_TILES constant", () => {
    it("equals 2", () => {
      expect(ICE_SLIDE_TILES).toBe(2);
    });
  });
});

// ── Snake + IceMomentum integration ─────────────────────────────

describe("Snake with Ice Cavern momentum", () => {
  describe("basic slide behavior", () => {
    it("slides 2 extra tiles in old direction before turning", () => {
      const ticker = new MoveTicker(100);
      const { snake } = createSnakeWithIce(
        { col: 10, row: 10 },
        "right",
        3,
        ticker,
      );

      // Buffer a turn upward
      snake.bufferDirection("up");

      // Step 1 (extra tile 1): ice captures turn, snake moves right
      snake.update(100);
      expect(snake.getHeadPosition()).toEqual({ col: 11, row: 10 });
      expect(snake.getDirection()).toBe("right"); // still right during slide

      // Step 2 (extra tile 2): slide completes, snake moves right,
      // then direction changes to "up" for NEXT step
      snake.update(100);
      expect(snake.getHeadPosition()).toEqual({ col: 12, row: 10 });
      expect(snake.getDirection()).toBe("up"); // direction changed after movement

      // Step 3: now moving up
      snake.update(100);
      expect(snake.getHeadPosition()).toEqual({ col: 12, row: 9 });
      expect(snake.getDirection()).toBe("up");
    });

    it("moves normally when no turn is buffered", () => {
      const ticker = new MoveTicker(100);
      const { snake } = createSnakeWithIce(
        { col: 10, row: 10 },
        "right",
        3,
        ticker,
      );

      snake.update(100);
      expect(snake.getHeadPosition()).toEqual({ col: 11, row: 10 });

      snake.update(100);
      expect(snake.getHeadPosition()).toEqual({ col: 12, row: 10 });
    });

    it("slides in all four turning directions", () => {
      // Turn from right to down
      const t1 = new MoveTicker(100);
      const { snake: s1 } = createSnakeWithIce(
        { col: 10, row: 10 },
        "right",
        3,
        t1,
      );
      s1.bufferDirection("down");
      s1.update(100); // slide right
      s1.update(100); // slide right, direction -> down
      s1.update(100); // move down
      expect(s1.getHeadPosition()).toEqual({ col: 12, row: 11 });

      // Turn from down to left
      const t2 = new MoveTicker(100);
      const { snake: s2 } = createSnakeWithIce(
        { col: 10, row: 10 },
        "down",
        3,
        t2,
      );
      s2.bufferDirection("left");
      s2.update(100); // slide down
      s2.update(100); // slide down, direction -> left
      s2.update(100); // move left
      expect(s2.getHeadPosition()).toEqual({ col: 9, row: 12 });

      // Turn from left to up
      const t3 = new MoveTicker(100);
      const { snake: s3 } = createSnakeWithIce(
        { col: 10, row: 10 },
        "left",
        3,
        t3,
      );
      s3.bufferDirection("up");
      s3.update(100); // slide left
      s3.update(100); // slide left, direction -> up
      s3.update(100); // move up
      expect(s3.getHeadPosition()).toEqual({ col: 8, row: 9 });

      // Turn from up to right
      const t4 = new MoveTicker(100);
      const { snake: s4 } = createSnakeWithIce(
        { col: 10, row: 10 },
        "up",
        3,
        t4,
      );
      s4.bufferDirection("right");
      s4.update(100); // slide up
      s4.update(100); // slide up, direction -> right
      s4.update(100); // move right
      expect(s4.getHeadPosition()).toEqual({ col: 11, row: 8 });
    });
  });

  describe("direction changes during slide", () => {
    it("input buffered during slide is consumed after slide completes", () => {
      const ticker = new MoveTicker(100);
      const { snake } = createSnakeWithIce(
        { col: 10, row: 10 },
        "right",
        3,
        ticker,
      );

      snake.bufferDirection("up");

      // Step 1: ice captures "up", starts slide in "right"
      snake.update(100);
      expect(snake.getDirection()).toBe("right");
      expect(snake.getHeadPosition()).toEqual({ col: 11, row: 10 });

      // Step 2: slide completes, direction becomes "up"
      snake.update(100);
      expect(snake.getDirection()).toBe("up");
      expect(snake.getHeadPosition()).toEqual({ col: 12, row: 10 });

      // Now buffer "left" (perpendicular to "up") AFTER slide completes
      snake.bufferDirection("left");

      // Step 3: "left" consumed from buffer, ice captures it, slide in "up"
      snake.update(100);
      expect(snake.getDirection()).toBe("up"); // still sliding up
      expect(snake.getHeadPosition()).toEqual({ col: 12, row: 9 });

      // Step 4: slide completes, direction becomes "left"
      snake.update(100);
      expect(snake.getDirection()).toBe("left");
      expect(snake.getHeadPosition()).toEqual({ col: 12, row: 8 });
    });

    it("handles multiple sequential turns with ice momentum", () => {
      const ticker = new MoveTicker(100);
      const { snake } = createSnakeWithIce(
        { col: 10, row: 10 },
        "right",
        3,
        ticker,
      );

      // First turn: up
      snake.bufferDirection("up");

      // Slide 2 tiles right, then direction becomes up
      snake.update(100); // slide 1: head at (11, 10)
      snake.update(100); // slide 2: head at (12, 10), direction → up

      expect(snake.getDirection()).toBe("up");
      expect(snake.getHeadPosition()).toEqual({ col: 12, row: 10 });

      // Second turn: left
      snake.bufferDirection("left");

      // Slide 2 tiles up, then direction becomes left
      snake.update(100); // slide 1: head at (12, 9)
      expect(snake.getHeadPosition()).toEqual({ col: 12, row: 9 });

      snake.update(100); // slide 2: head at (12, 8), direction → left
      expect(snake.getDirection()).toBe("left");
      expect(snake.getHeadPosition()).toEqual({ col: 12, row: 8 });

      // Now moving left
      snake.update(100);
      expect(snake.getHeadPosition()).toEqual({ col: 11, row: 8 });
    });
  });

  describe("ice disabled mid-slide", () => {
    it("cancels slide when ice is disabled", () => {
      const ticker = new MoveTicker(100);
      const { snake, ice } = createSnakeWithIce(
        { col: 10, row: 10 },
        "right",
        3,
        ticker,
      );

      snake.bufferDirection("up");

      // Step 1: slide begins, moving right
      snake.update(100);
      expect(snake.getDirection()).toBe("right");
      expect(snake.getHeadPosition()).toEqual({ col: 11, row: 10 });

      // Disable ice (biome changed)
      ice.setEnabled(false);

      // Step 2: slide was cancelled, no pending direction, no buffer
      // Snake continues right
      snake.update(100);
      expect(snake.getDirection()).toBe("right");
      expect(snake.getHeadPosition()).toEqual({ col: 12, row: 10 });
    });
  });

  describe("normal behavior when ice is disabled", () => {
    it("turns immediately when ice momentum is not enabled", () => {
      const ticker = new MoveTicker(100);
      const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);
      const ice = new IceMomentum();
      snake.setIceMomentum(ice);

      snake.bufferDirection("up");
      snake.update(100);

      expect(snake.getDirection()).toBe("up");
      expect(snake.getHeadPosition()).toEqual({ col: 10, row: 9 });
    });

    it("turns immediately when no ice momentum is attached", () => {
      const ticker = new MoveTicker(100);
      const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);

      snake.bufferDirection("up");
      snake.update(100);

      expect(snake.getDirection()).toBe("up");
      expect(snake.getHeadPosition()).toEqual({ col: 10, row: 9 });
    });
  });

  describe("collision during slide", () => {
    it("wall collision during ice slide is detected (head goes out of bounds)", () => {
      const ticker = new MoveTicker(100);
      // Snake 1 tile from right wall
      const { snake } = createSnakeWithIce(
        { col: 38, row: 10 },
        "right",
        3,
        ticker,
      );

      snake.bufferDirection("up");

      // Step 1: slide right to col 39 (still in bounds)
      snake.update(100);
      expect(snake.getHeadPosition()).toEqual({ col: 39, row: 10 });

      // Step 2: slide right to col 40 (out of bounds!)
      snake.update(100);
      expect(snake.getHeadPosition()).toEqual({ col: 40, row: 10 });
      // MainScene's checkCollisions() will detect this
    });
  });

  describe("growth during ice slide", () => {
    it("snake can grow during an ice slide", () => {
      const ticker = new MoveTicker(100);
      const { snake } = createSnakeWithIce(
        { col: 10, row: 10 },
        "right",
        3,
        ticker,
      );

      snake.bufferDirection("up");
      snake.grow(1);

      // Step 1: slide right + grow
      snake.update(100);
      expect(snake.getLength()).toBe(4);
      expect(snake.getHeadPosition()).toEqual({ col: 11, row: 10 });

      // Step 2: slide completes, direction changes to up
      snake.update(100);
      expect(snake.getHeadPosition()).toEqual({ col: 12, row: 10 });
      expect(snake.getDirection()).toBe("up");

      // Step 3: now moving up
      snake.update(100);
      expect(snake.getHeadPosition()).toEqual({ col: 12, row: 9 });
    });
  });

  describe("ice momentum set/get on Snake", () => {
    it("setIceMomentum / getIceMomentum roundtrip", () => {
      const snake = createSnake();
      const ice = new IceMomentum();

      snake.setIceMomentum(ice);
      expect(snake.getIceMomentum()).toBe(ice);
    });

    it("can set ice momentum to null", () => {
      const snake = createSnake();
      const ice = new IceMomentum();

      snake.setIceMomentum(ice);
      snake.setIceMomentum(null);
      expect(snake.getIceMomentum()).toBeNull();
    });

    it("defaults to null when not set", () => {
      const snake = createSnake();
      expect(snake.getIceMomentum()).toBeNull();
    });
  });

  describe("input buffer interaction with ice", () => {
    it("consumes one buffer entry per slide start", () => {
      const ticker = new MoveTicker(100);
      const { snake } = createSnakeWithIce(
        { col: 10, row: 10 },
        "right",
        3,
        ticker,
      );

      // Buffer two turns
      snake.bufferDirection("up");
      snake.bufferDirection("left");

      // Step 1: "up" consumed from buffer, ice captures it
      snake.update(100);
      expect(snake.getDirection()).toBe("right"); // sliding right

      // Step 2: slide completes, direction becomes "up"
      snake.update(100);
      expect(snake.getDirection()).toBe("up");

      // Step 3: "left" consumed from buffer, ice captures it
      snake.update(100);
      expect(snake.getDirection()).toBe("up"); // sliding up

      // Step 4: slide completes, direction becomes "left"
      snake.update(100);
      expect(snake.getDirection()).toBe("left");
    });
  });

  describe("predictability", () => {
    it("same inputs always produce the same path (deterministic)", () => {
      const makeSnake = () => {
        const ticker = new MoveTicker(100);
        return createSnakeWithIce({ col: 10, row: 10 }, "right", 3, ticker);
      };

      const recordPath = (s: Snake) => {
        const positions: GridPos[] = [];
        s.bufferDirection("up");

        for (let i = 0; i < 5; i++) {
          s.update(100);
          positions.push(s.getHeadPosition());
        }
        return positions;
      };

      const { snake: s1 } = makeSnake();
      const { snake: s2 } = makeSnake();

      const path1 = recordPath(s1);
      const path2 = recordPath(s2);

      expect(path1).toEqual(path2);
    });

    it("slide produces exactly 2 extra tiles in old direction before turning", () => {
      const ticker = new MoveTicker(100);
      const { snake } = createSnakeWithIce(
        { col: 10, row: 10 },
        "right",
        3,
        ticker,
      );

      snake.bufferDirection("down");

      // Track positions: should see 2 rightward moves then downward
      snake.update(100); // extra tile 1: (11, 10)
      expect(snake.getHeadPosition()).toEqual({ col: 11, row: 10 });

      snake.update(100); // extra tile 2: (12, 10), direction → down
      expect(snake.getHeadPosition()).toEqual({ col: 12, row: 10 });
      expect(snake.getDirection()).toBe("down");

      snake.update(100); // now moving down: (12, 11)
      expect(snake.getHeadPosition()).toEqual({ col: 12, row: 11 });
      expect(snake.getDirection()).toBe("down");
    });

    it("snake traverses a right-angle path with correct positions", () => {
      // Full path trace: start right, turn up with ice
      const ticker = new MoveTicker(100);
      const { snake } = createSnakeWithIce(
        { col: 5, row: 15 },
        "right",
        3,
        ticker,
      );

      // Move 2 steps right normally
      snake.update(100); // (6, 15)
      snake.update(100); // (7, 15)

      // Now turn up
      snake.bufferDirection("up");

      snake.update(100); // ice slide 1: (8, 15)
      snake.update(100); // ice slide 2: (9, 15), direction → up

      snake.update(100); // up: (9, 14)
      snake.update(100); // up: (9, 13)

      expect(snake.getHeadPosition()).toEqual({ col: 9, row: 13 });
      expect(snake.getDirection()).toBe("up");
    });
  });

  describe("edge cases", () => {
    it("buffering the same direction as current is still rejected with ice", () => {
      const ticker = new MoveTicker(100);
      const { snake } = createSnakeWithIce(
        { col: 10, row: 10 },
        "right",
        3,
        ticker,
      );

      // "right" is the current direction — should be rejected
      snake.bufferDirection("right");

      snake.update(100);
      // No slide triggered, just normal right movement
      expect(snake.getHeadPosition()).toEqual({ col: 11, row: 10 });
      expect(snake.getDirection()).toBe("right");
    });

    it("buffering opposite direction is still rejected with ice", () => {
      const ticker = new MoveTicker(100);
      const { snake } = createSnakeWithIce(
        { col: 10, row: 10 },
        "right",
        3,
        ticker,
      );

      // "left" is opposite — should be rejected
      snake.bufferDirection("left");

      snake.update(100);
      expect(snake.getHeadPosition()).toEqual({ col: 11, row: 10 });
      expect(snake.getDirection()).toBe("right");
    });

    it("enabling ice mid-game activates momentum for subsequent turns", () => {
      const ticker = new MoveTicker(100);
      const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);
      const ice = new IceMomentum();
      snake.setIceMomentum(ice);

      // Initially disabled — turn should be immediate
      snake.bufferDirection("up");
      snake.update(100);
      expect(snake.getDirection()).toBe("up");
      expect(snake.getHeadPosition()).toEqual({ col: 10, row: 9 });

      // Now enable ice
      ice.setEnabled(true);

      // Next turn should have momentum
      snake.bufferDirection("right");
      snake.update(100); // slide up (extra tile 1)
      expect(snake.getDirection()).toBe("up");
      expect(snake.getHeadPosition()).toEqual({ col: 10, row: 8 });

      snake.update(100); // slide up (extra tile 2), direction → right
      expect(snake.getDirection()).toBe("right");
      expect(snake.getHeadPosition()).toEqual({ col: 10, row: 7 });

      snake.update(100); // now moving right
      expect(snake.getHeadPosition()).toEqual({ col: 11, row: 7 });
    });
  });
});
