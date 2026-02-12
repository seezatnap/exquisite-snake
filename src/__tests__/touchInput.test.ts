import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  TouchInput,
  SWIPE_THRESHOLD_PX,
  SWIPE_DEBOUNCE_MS,
} from "@/game/utils/touchInput";
import type { Direction } from "@/game/utils/grid";

// ── Helpers ──────────────────────────────────────────────────────

/** Mock element with exposed listener map for event simulation. */
interface MockElement extends HTMLElement {
  __listeners: Record<string, EventListenerOrEventListenerObject[]>;
}

/** Create a mock HTMLElement with add/removeEventListener. */
function createMockElement(): MockElement {
  const listeners: Record<string, EventListenerOrEventListenerObject[]> = {};
  return {
    addEventListener: vi.fn((type: string, handler: EventListenerOrEventListenerObject) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    }),
    removeEventListener: vi.fn((type: string, handler: EventListenerOrEventListenerObject) => {
      if (listeners[type]) {
        listeners[type] = listeners[type].filter((h) => h !== handler);
      }
    }),
    __listeners: listeners,
  } as unknown as MockElement;
}

/** Dispatch a simulated touch event on the mock element. */
function fireTouchEvent(
  element: MockElement,
  type: "touchstart" | "touchmove" | "touchend",
  clientX: number,
  clientY: number,
): void {
  const touch = { clientX, clientY };
  const event = {
    preventDefault: vi.fn(),
    touches: type !== "touchend" ? [touch] : [],
    changedTouches: [touch],
  } as unknown as TouchEvent;

  const handlers = element.__listeners[type] || [];
  for (const handler of handlers) {
    if (typeof handler === "function") {
      handler(event);
    }
  }
}

// ── Tests ────────────────────────────────────────────────────────

describe("TouchInput", () => {
  let touchInput: TouchInput;
  let element: ReturnType<typeof createMockElement>;
  let receivedDirs: Direction[];
  let onDirection: (dir: Direction) => void;

  beforeEach(() => {
    vi.useFakeTimers();
    // Advance past 0 so debounce checks work
    vi.advanceTimersByTime(1000);

    touchInput = new TouchInput();
    element = createMockElement();
    receivedDirs = [];
    onDirection = (dir: Direction) => receivedDirs.push(dir);
  });

  afterEach(() => {
    touchInput.detach();
    vi.useRealTimers();
  });

  // ── Construction ────────────────────────────────────────────

  describe("construction", () => {
    it("uses default threshold and debounce", () => {
      expect(touchInput.getThreshold()).toBe(SWIPE_THRESHOLD_PX);
      expect(touchInput.getDebounceMs()).toBe(SWIPE_DEBOUNCE_MS);
    });

    it("accepts custom threshold and debounce", () => {
      const custom = new TouchInput(50, 200);
      expect(custom.getThreshold()).toBe(50);
      expect(custom.getDebounceMs()).toBe(200);
    });
  });

  // ── Attach / Detach ─────────────────────────────────────────

  describe("attach/detach", () => {
    it("registers touchstart, touchmove, touchend listeners", () => {
      touchInput.attach(element, onDirection);
      expect(element.addEventListener).toHaveBeenCalledWith(
        "touchstart",
        expect.any(Function),
        { passive: false },
      );
      expect(element.addEventListener).toHaveBeenCalledWith(
        "touchmove",
        expect.any(Function),
        { passive: false },
      );
      expect(element.addEventListener).toHaveBeenCalledWith(
        "touchend",
        expect.any(Function),
        { passive: false },
      );
    });

    it("removes listeners on detach", () => {
      touchInput.attach(element, onDirection);
      touchInput.detach();
      expect(element.removeEventListener).toHaveBeenCalledWith(
        "touchstart",
        expect.any(Function),
      );
      expect(element.removeEventListener).toHaveBeenCalledWith(
        "touchmove",
        expect.any(Function),
      );
      expect(element.removeEventListener).toHaveBeenCalledWith(
        "touchend",
        expect.any(Function),
      );
    });

    it("detach is safe to call when not attached", () => {
      expect(() => touchInput.detach()).not.toThrow();
    });

    it("re-attach detaches previous element first", () => {
      const element2 = createMockElement();
      touchInput.attach(element, onDirection);
      touchInput.attach(element2, onDirection);

      // First element should have been cleaned up
      expect(element.removeEventListener).toHaveBeenCalled();
    });
  });

  // ── Swipe direction resolution ──────────────────────────────

  describe("resolveDirection", () => {
    it("returns null when below threshold", () => {
      expect(touchInput.resolveDirection(10, 5)).toBeNull();
      expect(touchInput.resolveDirection(0, 0)).toBeNull();
      expect(touchInput.resolveDirection(SWIPE_THRESHOLD_PX - 1, 0)).toBeNull();
    });

    it("returns right for positive horizontal swipe", () => {
      expect(touchInput.resolveDirection(SWIPE_THRESHOLD_PX, 0)).toBe("right");
      expect(touchInput.resolveDirection(100, 10)).toBe("right");
    });

    it("returns left for negative horizontal swipe", () => {
      expect(touchInput.resolveDirection(-SWIPE_THRESHOLD_PX, 0)).toBe("left");
      expect(touchInput.resolveDirection(-100, 10)).toBe("left");
    });

    it("returns down for positive vertical swipe", () => {
      expect(touchInput.resolveDirection(0, SWIPE_THRESHOLD_PX)).toBe("down");
      expect(touchInput.resolveDirection(10, 100)).toBe("down");
    });

    it("returns up for negative vertical swipe", () => {
      expect(touchInput.resolveDirection(0, -SWIPE_THRESHOLD_PX)).toBe("up");
      expect(touchInput.resolveDirection(10, -100)).toBe("up");
    });

    it("uses dominant axis when both exceed threshold", () => {
      // Horizontal dominant
      expect(touchInput.resolveDirection(100, 50)).toBe("right");
      expect(touchInput.resolveDirection(-100, 50)).toBe("left");
      // Vertical dominant
      expect(touchInput.resolveDirection(50, 100)).toBe("down");
      expect(touchInput.resolveDirection(50, -100)).toBe("up");
    });

    it("favors horizontal when both axes are equal", () => {
      // When absDx == absDy, code uses >= so horizontal wins
      expect(touchInput.resolveDirection(50, 50)).toBe("right");
      expect(touchInput.resolveDirection(-50, -50)).toBe("left");
    });
  });

  // ── Swipe via touchstart + touchend ─────────────────────────

  describe("swipe via touchstart → touchend", () => {
    beforeEach(() => {
      touchInput.attach(element, onDirection);
    });

    it("detects a right swipe", () => {
      fireTouchEvent(element, "touchstart", 100, 200);
      fireTouchEvent(element, "touchend", 100 + SWIPE_THRESHOLD_PX, 200);
      expect(receivedDirs).toEqual(["right"]);
    });

    it("detects a left swipe", () => {
      fireTouchEvent(element, "touchstart", 200, 200);
      fireTouchEvent(element, "touchend", 200 - SWIPE_THRESHOLD_PX, 200);
      expect(receivedDirs).toEqual(["left"]);
    });

    it("detects a down swipe", () => {
      fireTouchEvent(element, "touchstart", 200, 100);
      fireTouchEvent(element, "touchend", 200, 100 + SWIPE_THRESHOLD_PX);
      expect(receivedDirs).toEqual(["down"]);
    });

    it("detects an up swipe", () => {
      fireTouchEvent(element, "touchstart", 200, 200);
      fireTouchEvent(element, "touchend", 200, 200 - SWIPE_THRESHOLD_PX);
      expect(receivedDirs).toEqual(["up"]);
    });

    it("ignores swipe below threshold", () => {
      fireTouchEvent(element, "touchstart", 100, 100);
      fireTouchEvent(element, "touchend", 110, 105);
      expect(receivedDirs).toEqual([]);
    });
  });

  // ── Continuous drag via touchmove ───────────────────────────

  describe("swipe via touchstart → touchmove", () => {
    beforeEach(() => {
      touchInput.attach(element, onDirection);
    });

    it("detects direction from touchmove when exceeding threshold", () => {
      fireTouchEvent(element, "touchstart", 100, 200);
      fireTouchEvent(element, "touchmove", 100 + SWIPE_THRESHOLD_PX, 200);
      expect(receivedDirs).toEqual(["right"]);
    });

    it("resets start point after move detection for chained steering", () => {
      fireTouchEvent(element, "touchstart", 100, 100);
      // First move: right
      fireTouchEvent(element, "touchmove", 100 + SWIPE_THRESHOLD_PX, 100);
      expect(receivedDirs).toEqual(["right"]);

      // Advance past debounce
      vi.advanceTimersByTime(SWIPE_DEBOUNCE_MS + 1);

      // Second move: down (from new start point)
      fireTouchEvent(
        element,
        "touchmove",
        100 + SWIPE_THRESHOLD_PX,
        100 + SWIPE_THRESHOLD_PX,
      );
      expect(receivedDirs).toEqual(["right", "down"]);
    });

    it("skips touchend direction if touchmove already triggered", () => {
      fireTouchEvent(element, "touchstart", 100, 100);
      fireTouchEvent(element, "touchmove", 100 + SWIPE_THRESHOLD_PX, 100);
      // touchend should be ignored because move already triggered
      fireTouchEvent(element, "touchend", 100 + SWIPE_THRESHOLD_PX + 50, 100);
      expect(receivedDirs).toEqual(["right"]);
    });
  });

  // ── Debounce ────────────────────────────────────────────────

  describe("debounce", () => {
    beforeEach(() => {
      touchInput.attach(element, onDirection);
    });

    it("rejects rapid swipes within debounce window", () => {
      fireTouchEvent(element, "touchstart", 100, 100);
      fireTouchEvent(element, "touchend", 100 + SWIPE_THRESHOLD_PX, 100); // accepted
      expect(receivedDirs).toEqual(["right"]);

      // Immediately swipe again (within debounce window)
      fireTouchEvent(element, "touchstart", 100, 100);
      fireTouchEvent(element, "touchend", 100, 100 + SWIPE_THRESHOLD_PX);
      expect(receivedDirs).toEqual(["right"]); // second swipe rejected
    });

    it("accepts swipe after debounce window passes", () => {
      fireTouchEvent(element, "touchstart", 100, 100);
      fireTouchEvent(element, "touchend", 100 + SWIPE_THRESHOLD_PX, 100);
      expect(receivedDirs).toEqual(["right"]);

      vi.advanceTimersByTime(SWIPE_DEBOUNCE_MS + 1);

      fireTouchEvent(element, "touchstart", 100, 100);
      fireTouchEvent(element, "touchend", 100, 100 + SWIPE_THRESHOLD_PX);
      expect(receivedDirs).toEqual(["right", "down"]);
    });
  });

  // ── Custom threshold ────────────────────────────────────────

  describe("custom threshold", () => {
    it("uses custom threshold for swipe detection", () => {
      const customTouch = new TouchInput(100, 0);
      const customDirs: Direction[] = [];
      const el = createMockElement();
      customTouch.attach(el, (dir) => customDirs.push(dir));

      fireTouchEvent(el, "touchstart", 100, 100);
      fireTouchEvent(el, "touchend", 180, 100); // 80px < 100px threshold
      expect(customDirs).toEqual([]);

      fireTouchEvent(el, "touchstart", 100, 100);
      fireTouchEvent(el, "touchend", 200, 100); // 100px = threshold
      expect(customDirs).toEqual(["right"]);

      customTouch.detach();
    });
  });

  // ── Edge cases ──────────────────────────────────────────────

  describe("edge cases", () => {
    beforeEach(() => {
      touchInput.attach(element, onDirection);
    });

    it("prevents default on touch events to avoid scrolling", () => {
      const preventDefault = vi.fn();
      const event = {
        preventDefault,
        touches: [{ clientX: 100, clientY: 100 }],
        changedTouches: [{ clientX: 100, clientY: 100 }],
      } as unknown as TouchEvent;

      // Manually call the handler
      const handlers = element.__listeners["touchstart"] || [];
      for (const handler of handlers) {
        if (typeof handler === "function") handler(event);
      }
      expect(preventDefault).toHaveBeenCalled();
    });

    it("handles touchstart with no touches gracefully", () => {
      const event = {
        preventDefault: vi.fn(),
        touches: [],
        changedTouches: [],
      } as unknown as TouchEvent;

      const handlers = element.__listeners["touchstart"] || [];
      expect(() => {
        for (const handler of handlers) {
          if (typeof handler === "function") handler(event);
        }
      }).not.toThrow();
    });

    it("handles touchend with no changedTouches gracefully", () => {
      fireTouchEvent(element, "touchstart", 100, 100);

      const event = {
        preventDefault: vi.fn(),
        touches: [],
        changedTouches: [],
      } as unknown as TouchEvent;

      const handlers = element.__listeners["touchend"] || [];
      expect(() => {
        for (const handler of handlers) {
          if (typeof handler === "function") handler(event);
        }
      }).not.toThrow();
    });
  });
});

// ── Integration: TouchInput → Snake.bufferDirection ─────────────

vi.mock("phaser", () => {
  class MockScene {
    add = {
      sprite: vi.fn(() => ({
        destroy: vi.fn(),
        setPosition: vi.fn(),
        x: 0,
        y: 0,
      })),
    };
    input = {
      keyboard: {
        on: vi.fn(),
      },
    };
    game = {
      canvas: null as HTMLElement | null,
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

describe("TouchInput → Snake integration", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let PhaserMock: any;
  let Snake: typeof import("@/game/entities/Snake").Snake;
  let MoveTicker: typeof import("@/game/utils/grid").MoveTicker;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.advanceTimersByTime(1000);
    vi.clearAllMocks();
    const snakeMod = await import("@/game/entities/Snake");
    const gridMod = await import("@/game/utils/grid");
    const phaserMod = await import("phaser");
    Snake = snakeMod.Snake;
    MoveTicker = gridMod.MoveTicker;
    PhaserMock = phaserMod.default;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createMockScene(canvas: HTMLElement | null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const scene = new PhaserMock.Scene({ key: "Test" }) as any;
    scene.game = { canvas };
    return scene as import("phaser").Scene;
  }

  it("setupTouchInput attaches to the game canvas", () => {
    const mockCanvas = createMockElement();
    const scene = createMockScene(mockCanvas);

    const ticker = new MoveTicker(100);
    const snake = new Snake(scene, { col: 10, row: 10 }, "right", 3, ticker);

    snake.setupTouchInput();

    expect(mockCanvas.addEventListener).toHaveBeenCalledWith(
      "touchstart",
      expect.any(Function),
      { passive: false },
    );
  });

  it("swipe on canvas buffers direction on the snake", () => {
    const mockCanvas = createMockElement();
    const scene = createMockScene(mockCanvas);

    const ticker = new MoveTicker(100);
    const snake = new Snake(scene, { col: 10, row: 10 }, "right", 3, ticker);

    snake.setupTouchInput();

    // Simulate an up swipe
    fireTouchEvent(mockCanvas, "touchstart", 200, 200);
    fireTouchEvent(mockCanvas, "touchend", 200, 200 - SWIPE_THRESHOLD_PX);

    // Advance the snake; it should change direction to "up"
    snake.update(100);
    expect(snake.getDirection()).toBe("up");
  });

  it("setupTouchInput handles missing canvas gracefully", () => {
    const scene = createMockScene(null);
    const snake = new Snake(scene, { col: 10, row: 10 }, "right", 3);
    expect(() => snake.setupTouchInput()).not.toThrow();
  });

  it("destroy cleans up touch listeners", () => {
    const mockCanvas = createMockElement();
    const scene = createMockScene(mockCanvas);

    const snake = new Snake(scene, { col: 10, row: 10 }, "right", 3);

    snake.setupTouchInput();
    snake.destroy();

    expect(mockCanvas.removeEventListener).toHaveBeenCalledWith(
      "touchstart",
      expect.any(Function),
    );
    expect(mockCanvas.removeEventListener).toHaveBeenCalledWith(
      "touchmove",
      expect.any(Function),
    );
    expect(mockCanvas.removeEventListener).toHaveBeenCalledWith(
      "touchend",
      expect.any(Function),
    );
  });
});
