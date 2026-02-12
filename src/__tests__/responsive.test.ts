import { describe, it, expect, vi } from "vitest";

// Mock Phaser before importing modules that depend on config.ts
vi.mock("phaser", () => {
  class MockScene {
    constructor() {}
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

import {
  computeCanvasSize,
  viewportToContainer,
  ARENA_ASPECT_RATIO,
  MIN_CANVAS_WIDTH,
  MIN_CANVAS_HEIGHT,
  CANVAS_PADDING,
} from "@/game/utils/responsive";
import { ARENA_WIDTH, ARENA_HEIGHT, TILE_SIZE } from "@/game/config";

// ── Constants ─────────────────────────────────────────────────────

describe("responsive constants", () => {
  it("ARENA_ASPECT_RATIO matches ARENA_WIDTH / ARENA_HEIGHT", () => {
    expect(ARENA_ASPECT_RATIO).toBeCloseTo(ARENA_WIDTH / ARENA_HEIGHT);
  });

  it("MIN_CANVAS_WIDTH is a positive number", () => {
    expect(MIN_CANVAS_WIDTH).toBeGreaterThan(0);
  });

  it("MIN_CANVAS_HEIGHT preserves aspect ratio", () => {
    expect(MIN_CANVAS_HEIGHT).toBeCloseTo(
      MIN_CANVAS_WIDTH / ARENA_ASPECT_RATIO,
    );
  });

  it("CANVAS_PADDING is a positive number", () => {
    expect(CANVAS_PADDING).toBeGreaterThan(0);
  });
});

// ── computeCanvasSize ─────────────────────────────────────────────

describe("computeCanvasSize", () => {
  it("returns dimensions that preserve the arena aspect ratio", () => {
    const { width, height } = computeCanvasSize(1920, 1080);
    // After tile-snapping, aspect ratio should be very close (within one tile)
    expect(Math.abs(width / height - ARENA_ASPECT_RATIO)).toBeLessThan(
      TILE_SIZE / height + 0.01,
    );
  });

  it("snaps width to a multiple of TILE_SIZE", () => {
    const { width } = computeCanvasSize(1000, 800);
    expect(width % TILE_SIZE).toBe(0);
  });

  it("snaps height to a multiple of TILE_SIZE", () => {
    const { height } = computeCanvasSize(1000, 800);
    expect(height % TILE_SIZE).toBe(0);
  });

  it("fits within container when width-constrained", () => {
    const { width, height } = computeCanvasSize(400, 1000);
    expect(width).toBeLessThanOrEqual(400);
    expect(height).toBeLessThanOrEqual(1000);
  });

  it("fits within container when height-constrained", () => {
    const { width, height } = computeCanvasSize(2000, 400);
    expect(width).toBeLessThanOrEqual(2000);
    expect(height).toBeLessThanOrEqual(400);
  });

  it("returns identical dimensions for exactly matching aspect ratio", () => {
    // 800x600 is exactly ARENA_WIDTH x ARENA_HEIGHT
    const { width, height } = computeCanvasSize(800, 600);
    expect(width).toBe(800);
    expect(height).toBe(600);
  });

  it("handles a very wide container (pillarboxed)", () => {
    const { width, height } = computeCanvasSize(3000, 600);
    expect(height).toBeLessThanOrEqual(600);
    expect(width).toBeLessThanOrEqual(3000);
    expect(width % TILE_SIZE).toBe(0);
    expect(height % TILE_SIZE).toBe(0);
  });

  it("handles a very tall container (letterboxed)", () => {
    const { width, height } = computeCanvasSize(600, 3000);
    expect(width).toBeLessThanOrEqual(600);
    expect(height).toBeLessThanOrEqual(3000);
    expect(width % TILE_SIZE).toBe(0);
    expect(height % TILE_SIZE).toBe(0);
  });

  it("enforces minimum width", () => {
    const { width } = computeCanvasSize(10, 10);
    expect(width).toBeGreaterThanOrEqual(MIN_CANVAS_WIDTH);
  });

  it("enforces minimum height", () => {
    const { height } = computeCanvasSize(10, 10);
    expect(height).toBeGreaterThanOrEqual(MIN_CANVAS_HEIGHT);
  });

  it("handles zero container dimensions gracefully", () => {
    const size = computeCanvasSize(0, 0);
    expect(size.width).toBeGreaterThanOrEqual(MIN_CANVAS_WIDTH);
    expect(size.height).toBeGreaterThanOrEqual(MIN_CANVAS_HEIGHT);
  });

  it("handles negative container dimensions gracefully", () => {
    const size = computeCanvasSize(-100, -100);
    expect(size.width).toBeGreaterThanOrEqual(MIN_CANVAS_WIDTH);
    expect(size.height).toBeGreaterThanOrEqual(MIN_CANVAS_HEIGHT);
  });

  it("scales down from a large 1080p viewport", () => {
    const { width, height } = computeCanvasSize(1920, 1080);
    expect(width).toBeLessThanOrEqual(1920);
    expect(height).toBeLessThanOrEqual(1080);
    expect(width).toBeGreaterThan(MIN_CANVAS_WIDTH);
    expect(height).toBeGreaterThan(MIN_CANVAS_HEIGHT);
  });

  it("produces consistent results for typical mobile viewports", () => {
    // iPhone SE: 375x667
    const se = computeCanvasSize(375, 667);
    expect(se.width).toBeLessThanOrEqual(375);
    expect(se.height).toBeLessThanOrEqual(667);
    expect(se.width % TILE_SIZE).toBe(0);
    expect(se.height % TILE_SIZE).toBe(0);

    // iPhone 14: 390x844
    const i14 = computeCanvasSize(390, 844);
    expect(i14.width).toBeLessThanOrEqual(390);
    expect(i14.height).toBeLessThanOrEqual(844);
    expect(i14.width % TILE_SIZE).toBe(0);
    expect(i14.height % TILE_SIZE).toBe(0);
  });

  it("handles square container", () => {
    const { width, height } = computeCanvasSize(500, 500);
    // Arena is wider than tall (4:3), so width should be constrained
    expect(width).toBeLessThanOrEqual(500);
    expect(height).toBeLessThanOrEqual(500);
    expect(width % TILE_SIZE).toBe(0);
    expect(height % TILE_SIZE).toBe(0);
  });
});

// ── viewportToContainer ───────────────────────────────────────────

describe("viewportToContainer", () => {
  it("subtracts default padding from both axes", () => {
    const { width, height } = viewportToContainer(1920, 1080);
    expect(width).toBe(1920 - CANVAS_PADDING * 2);
    expect(height).toBe(1080 - CANVAS_PADDING * 2);
  });

  it("accepts custom padding", () => {
    const { width, height } = viewportToContainer(1000, 800, 50);
    expect(width).toBe(900);
    expect(height).toBe(700);
  });

  it("clamps to at least 1 when viewport is smaller than padding", () => {
    const { width, height } = viewportToContainer(10, 10, 100);
    expect(width).toBeGreaterThanOrEqual(1);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it("clamps to at least 1 for zero viewport", () => {
    const { width, height } = viewportToContainer(0, 0);
    expect(width).toBeGreaterThanOrEqual(1);
    expect(height).toBeGreaterThanOrEqual(1);
  });
});
