import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Phaser mock ──────────────────────────────────────────────────

const mockDestroy = vi.fn();
const mockSetPosition = vi.fn();
const mockSetDepth = vi.fn().mockReturnThis();
const mockSetAlpha = vi.fn().mockReturnThis();
const mockSetScale = vi.fn().mockReturnThis();
const mockSetVisible = vi.fn().mockReturnThis();
const mockSetRotation = vi.fn().mockReturnThis();

function createMockSprite() {
  return {
    destroy: mockDestroy,
    setPosition: mockSetPosition,
    setDepth: mockSetDepth,
    setAlpha: mockSetAlpha,
    setScale: mockSetScale,
    setVisible: mockSetVisible,
    setRotation: mockSetRotation,
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
  LAVA_PULSE_PERIOD_MS,
  LAVA_PULSE_ALPHA_MIN,
  LAVA_PULSE_ALPHA_MAX,
  LAVA_PULSE_SCALE_MIN,
  LAVA_PULSE_SCALE_MAX,
} from "@/game/entities/LavaPool";
import {
  VoidVortex,
  VORTEX_RING_COUNT,
  VORTEX_ROTATION_SPEED,
  VORTEX_PULSE_PERIOD_MS,
  VORTEX_PULSE_SCALE_MIN,
  VORTEX_PULSE_SCALE_MAX,
  VORTEX_ALPHA_BASE,
  VORTEX_ALPHA_STEP,
} from "@/game/entities/VoidVortex";
import { DEPTH } from "@/game/config";
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

function fixedRng(value: number): () => number {
  return () => value;
}

const DEFAULT_FOOD_POS: GridPos = { col: 5, row: 5 };

beforeEach(() => {
  vi.clearAllMocks();
});

// ══════════════════════════════════════════════════════════════════
// Lava Pool Visual Tests
// ══════════════════════════════════════════════════════════════════

describe("LavaPool visual constants", () => {
  it("pulse period is positive", () => {
    expect(LAVA_PULSE_PERIOD_MS).toBeGreaterThan(0);
  });

  it("alpha range is valid", () => {
    expect(LAVA_PULSE_ALPHA_MIN).toBeGreaterThanOrEqual(0);
    expect(LAVA_PULSE_ALPHA_MAX).toBeLessThanOrEqual(1);
    expect(LAVA_PULSE_ALPHA_MIN).toBeLessThan(LAVA_PULSE_ALPHA_MAX);
  });

  it("scale range is valid", () => {
    expect(LAVA_PULSE_SCALE_MIN).toBeGreaterThan(0);
    expect(LAVA_PULSE_SCALE_MAX).toBeGreaterThan(LAVA_PULSE_SCALE_MIN);
  });
});

describe("LavaPoolManager render depth", () => {
  it("sets MECHANIC_VISUALS depth on spawned pool sprites", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const mgr = new LavaPoolManager(scene, fixedRng(0.5), 8, 1000);

    mgr.update(1000, snake, DEFAULT_FOOD_POS);
    expect(mgr.getPoolCount()).toBe(1);

    // The sprite should have had setDepth called with MECHANIC_VISUALS
    expect(mockSetDepth).toHaveBeenCalledWith(DEPTH.MECHANIC_VISUALS);
  });
});

describe("LavaPoolManager pulsing animation", () => {
  it("updates sprite alpha and scale on each update call", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const mgr = new LavaPoolManager(scene, fixedRng(0.5), 8, 500);

    // Spawn a pool
    mgr.update(500, snake, DEFAULT_FOOD_POS);
    expect(mgr.getPoolCount()).toBe(1);

    // Clear mocks from spawn, then advance animation
    mockSetAlpha.mockClear();
    mockSetScale.mockClear();

    // Advance time (within spawn interval, no new pool, but animation runs)
    mgr.update(100, snake, DEFAULT_FOOD_POS);

    // setAlpha and setScale should have been called for the existing pool
    expect(mockSetAlpha).toHaveBeenCalled();
    expect(mockSetScale).toHaveBeenCalled();
  });

  it("alpha stays within configured min/max range", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const mgr = new LavaPoolManager(scene, fixedRng(0.5), 8, 500);

    // Spawn a pool
    mgr.update(500, snake, DEFAULT_FOOD_POS);

    // Test at multiple time points within a full pulse cycle
    for (let t = 0; t <= LAVA_PULSE_PERIOD_MS; t += 50) {
      mockSetAlpha.mockClear();
      mgr.update(50, snake, DEFAULT_FOOD_POS);

      if (mockSetAlpha.mock.calls.length > 0) {
        const alpha = mockSetAlpha.mock.calls[0][0] as number;
        expect(alpha).toBeGreaterThanOrEqual(LAVA_PULSE_ALPHA_MIN - 0.001);
        expect(alpha).toBeLessThanOrEqual(LAVA_PULSE_ALPHA_MAX + 0.001);
      }
    }
  });

  it("scale stays within configured min/max range", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const mgr = new LavaPoolManager(scene, fixedRng(0.5), 8, 500);

    // Spawn a pool
    mgr.update(500, snake, DEFAULT_FOOD_POS);

    // Test at multiple time points
    for (let t = 0; t <= LAVA_PULSE_PERIOD_MS; t += 50) {
      mockSetScale.mockClear();
      mgr.update(50, snake, DEFAULT_FOOD_POS);

      if (mockSetScale.mock.calls.length > 0) {
        const scale = mockSetScale.mock.calls[0][0] as number;
        expect(scale).toBeGreaterThanOrEqual(LAVA_PULSE_SCALE_MIN - 0.001);
        expect(scale).toBeLessThanOrEqual(LAVA_PULSE_SCALE_MAX + 0.001);
      }
    }
  });

  it("animates multiple pools independently", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const mgr = new LavaPoolManager(
      scene,
      fixedRng(0.5),
      8,
      500,
    );

    // Spawn two pools at different times
    mgr.update(500, snake, DEFAULT_FOOD_POS);
    mgr.update(500, snake, DEFAULT_FOOD_POS);
    expect(mgr.getPoolCount()).toBe(2);

    mockSetAlpha.mockClear();
    mgr.update(100, snake, DEFAULT_FOOD_POS);

    // Both pools should get their alpha set (2 calls)
    expect(mockSetAlpha).toHaveBeenCalledTimes(2);
  });
});

// ══════════════════════════════════════════════════════════════════
// Void Vortex Visual Tests
// ══════════════════════════════════════════════════════════════════

describe("VoidVortex constants", () => {
  it("has positive ring count", () => {
    expect(VORTEX_RING_COUNT).toBeGreaterThan(0);
  });

  it("has positive rotation speed", () => {
    expect(VORTEX_ROTATION_SPEED).toBeGreaterThan(0);
  });

  it("pulse period is positive", () => {
    expect(VORTEX_PULSE_PERIOD_MS).toBeGreaterThan(0);
  });

  it("pulse scale range is valid", () => {
    expect(VORTEX_PULSE_SCALE_MIN).toBeGreaterThan(0);
    expect(VORTEX_PULSE_SCALE_MAX).toBeGreaterThan(VORTEX_PULSE_SCALE_MIN);
  });

  it("alpha base is positive and step increments", () => {
    expect(VORTEX_ALPHA_BASE).toBeGreaterThan(0);
    expect(VORTEX_ALPHA_STEP).toBeGreaterThan(0);
  });
});

describe("VoidVortex construction", () => {
  it("starts inactive", () => {
    const vortex = new VoidVortex();
    expect(vortex.isActive()).toBe(false);
  });

  it("starts with zero elapsed time", () => {
    const vortex = new VoidVortex();
    expect(vortex.getElapsed()).toBe(0);
  });

  it("starts with zero rings before init", () => {
    const vortex = new VoidVortex();
    expect(vortex.getRingCount()).toBe(0);
  });
});

describe("VoidVortex init", () => {
  it("creates the expected number of ring sprites", () => {
    const scene = createScene();
    const vortex = new VoidVortex();
    vortex.init(scene);

    expect(vortex.getRingCount()).toBe(VORTEX_RING_COUNT);
  });

  it("sets MECHANIC_VISUALS depth on all ring sprites", () => {
    const scene = createScene();
    const vortex = new VoidVortex();

    mockSetDepth.mockClear();
    vortex.init(scene);

    // Each ring should get setDepth called
    const depthCalls = mockSetDepth.mock.calls.filter(
      (c) => c[0] === DEPTH.MECHANIC_VISUALS,
    );
    expect(depthCalls.length).toBe(VORTEX_RING_COUNT);
  });

  it("sets varying alpha on rings (inner rings brighter)", () => {
    const scene = createScene();
    const vortex = new VoidVortex();

    mockSetAlpha.mockClear();
    vortex.init(scene);

    // Should have setAlpha called for each ring
    expect(mockSetAlpha).toHaveBeenCalledTimes(VORTEX_RING_COUNT);

    // First ring (outermost) gets base alpha
    expect(mockSetAlpha.mock.calls[0][0]).toBeCloseTo(VORTEX_ALPHA_BASE);

    // Each subsequent ring gets incrementally higher alpha
    for (let i = 1; i < VORTEX_RING_COUNT; i++) {
      const expected = VORTEX_ALPHA_BASE + i * VORTEX_ALPHA_STEP;
      expect(mockSetAlpha.mock.calls[i][0]).toBeCloseTo(expected);
    }
  });

  it("starts hidden after init", () => {
    const scene = createScene();
    const vortex = new VoidVortex();
    vortex.init(scene);

    expect(vortex.isActive()).toBe(false);
    // setVisible(false) should have been called for each ring
    const falseCalls = mockSetVisible.mock.calls.filter(
      (c) => c[0] === false,
    );
    expect(falseCalls.length).toBe(VORTEX_RING_COUNT);
  });
});

describe("VoidVortex show/hide", () => {
  it("show() activates the vortex and makes rings visible", () => {
    const scene = createScene();
    const vortex = new VoidVortex();
    vortex.init(scene);

    mockSetVisible.mockClear();
    vortex.show();

    expect(vortex.isActive()).toBe(true);
    const trueCalls = mockSetVisible.mock.calls.filter(
      (c) => c[0] === true,
    );
    expect(trueCalls.length).toBe(VORTEX_RING_COUNT);
  });

  it("hide() deactivates the vortex and hides rings", () => {
    const scene = createScene();
    const vortex = new VoidVortex();
    vortex.init(scene);
    vortex.show();

    mockSetVisible.mockClear();
    vortex.hide();

    expect(vortex.isActive()).toBe(false);
    const falseCalls = mockSetVisible.mock.calls.filter(
      (c) => c[0] === false,
    );
    expect(falseCalls.length).toBe(VORTEX_RING_COUNT);
  });

  it("show() resets elapsed time", () => {
    const scene = createScene();
    const vortex = new VoidVortex();
    vortex.init(scene);
    vortex.show();

    vortex.update(500);
    expect(vortex.getElapsed()).toBe(500);

    vortex.show();
    expect(vortex.getElapsed()).toBe(0);
  });
});

describe("VoidVortex animation", () => {
  it("does not animate when inactive", () => {
    const scene = createScene();
    const vortex = new VoidVortex();
    vortex.init(scene);

    // Not shown, so update should be a no-op
    mockSetRotation.mockClear();
    mockSetScale.mockClear();
    vortex.update(100);

    expect(mockSetRotation).not.toHaveBeenCalled();
    expect(mockSetScale).not.toHaveBeenCalled();
  });

  it("advances elapsed time when active", () => {
    const scene = createScene();
    const vortex = new VoidVortex();
    vortex.init(scene);
    vortex.show();

    vortex.update(100);
    expect(vortex.getElapsed()).toBe(100);

    vortex.update(200);
    expect(vortex.getElapsed()).toBe(300);
  });

  it("sets rotation on all rings during update", () => {
    const scene = createScene();
    const vortex = new VoidVortex();
    vortex.init(scene);
    vortex.show();

    mockSetRotation.mockClear();
    vortex.update(100);

    expect(mockSetRotation).toHaveBeenCalledTimes(VORTEX_RING_COUNT);
  });

  it("sets scale on all rings during update", () => {
    const scene = createScene();
    const vortex = new VoidVortex();
    vortex.init(scene);
    vortex.show();

    mockSetScale.mockClear();
    vortex.update(100);

    expect(mockSetScale).toHaveBeenCalledTimes(VORTEX_RING_COUNT);
  });

  it("alternates rotation direction between rings", () => {
    const scene = createScene();
    const vortex = new VoidVortex();
    vortex.init(scene);
    vortex.show();

    mockSetRotation.mockClear();
    vortex.update(1000); // 1 second

    // Even-indexed rings rotate one direction, odd the other
    const calls = mockSetRotation.mock.calls;
    expect(calls.length).toBe(VORTEX_RING_COUNT);

    // The rotation values should alternate sign pattern
    if (VORTEX_RING_COUNT >= 2) {
      const r0 = calls[0][0] as number;
      const r1 = calls[1][0] as number;
      // Ring 0 is positive (dir=1), Ring 1 is negative (dir=-1)
      expect(r0).toBeGreaterThan(0);
      expect(r1).toBeLessThan(0);
    }
  });
});

describe("VoidVortex destroy", () => {
  it("destroys all ring sprites", () => {
    const scene = createScene();
    const vortex = new VoidVortex();
    vortex.init(scene);

    mockDestroy.mockClear();
    vortex.destroy();

    expect(mockDestroy).toHaveBeenCalledTimes(VORTEX_RING_COUNT);
  });

  it("resets ring count to zero", () => {
    const scene = createScene();
    const vortex = new VoidVortex();
    vortex.init(scene);
    expect(vortex.getRingCount()).toBe(VORTEX_RING_COUNT);

    vortex.destroy();
    expect(vortex.getRingCount()).toBe(0);
  });

  it("deactivates the vortex", () => {
    const scene = createScene();
    const vortex = new VoidVortex();
    vortex.init(scene);
    vortex.show();
    expect(vortex.isActive()).toBe(true);

    vortex.destroy();
    expect(vortex.isActive()).toBe(false);
  });

  it("resets elapsed time", () => {
    const scene = createScene();
    const vortex = new VoidVortex();
    vortex.init(scene);
    vortex.show();
    vortex.update(500);

    vortex.destroy();
    expect(vortex.getElapsed()).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
// Render Depth Layer Tests
// ══════════════════════════════════════════════════════════════════

describe("Render depth layer ordering", () => {
  it("grid is below mechanic visuals", () => {
    expect(DEPTH.GRID).toBeLessThan(DEPTH.MECHANIC_VISUALS);
  });

  it("mechanic visuals are below food", () => {
    expect(DEPTH.MECHANIC_VISUALS).toBeLessThan(DEPTH.FOOD);
  });

  it("food is below snake body", () => {
    expect(DEPTH.FOOD).toBeLessThan(DEPTH.SNAKE_BODY);
  });

  it("snake body is below snake head", () => {
    expect(DEPTH.SNAKE_BODY).toBeLessThan(DEPTH.SNAKE_HEAD);
  });

  it("snake head is below transition overlay", () => {
    expect(DEPTH.SNAKE_HEAD).toBeLessThan(DEPTH.TRANSITION_OVERLAY);
  });

  it("all depth values are distinct", () => {
    const values = Object.values(DEPTH);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

describe("Snake setDepthLayers", () => {
  it("sets different depths for head and body sprites", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);

    mockSetDepth.mockClear();
    snake.setDepthLayers(DEPTH.SNAKE_HEAD, DEPTH.SNAKE_BODY);

    // 3 sprites: 1 head + 2 body
    expect(mockSetDepth).toHaveBeenCalledTimes(3);

    // First call is head depth
    expect(mockSetDepth.mock.calls[0][0]).toBe(DEPTH.SNAKE_HEAD);

    // Remaining calls are body depth
    for (let i = 1; i < 3; i++) {
      expect(mockSetDepth.mock.calls[i][0]).toBe(DEPTH.SNAKE_BODY);
    }
  });

  it("works with single-segment snake (head only)", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 1);

    mockSetDepth.mockClear();
    snake.setDepthLayers(DEPTH.SNAKE_HEAD, DEPTH.SNAKE_BODY);

    expect(mockSetDepth).toHaveBeenCalledTimes(1);
    expect(mockSetDepth.mock.calls[0][0]).toBe(DEPTH.SNAKE_HEAD);
  });
});
