import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock Phaser before importing modules that depend on config.ts
vi.mock("phaser", () => {
  class MockScene {
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

import {
  directionVector,
  oppositeDirection,
  gridToPixel,
  pixelToGrid,
  isInBounds,
  stepInDirection,
  gridEquals,
  lerp,
  lerpGridPos,
  MoveTicker,
  DEFAULT_MOVE_INTERVAL_MS,
} from "@/game/utils/grid";
import type { GridPos, Direction } from "@/game/utils/grid";
import { TILE_SIZE, GRID_COLS, GRID_ROWS } from "@/game/config";

// ── Direction helpers ───────────────────────────────────────────

describe("directionVector", () => {
  it("returns correct vector for each direction", () => {
    expect(directionVector("up")).toEqual({ col: 0, row: -1 });
    expect(directionVector("down")).toEqual({ col: 0, row: 1 });
    expect(directionVector("left")).toEqual({ col: -1, row: 0 });
    expect(directionVector("right")).toEqual({ col: 1, row: 0 });
  });
});

describe("oppositeDirection", () => {
  it("returns the opposite for each cardinal direction", () => {
    expect(oppositeDirection("up")).toBe("down");
    expect(oppositeDirection("down")).toBe("up");
    expect(oppositeDirection("left")).toBe("right");
    expect(oppositeDirection("right")).toBe("left");
  });

  it("is its own inverse", () => {
    const dirs: Direction[] = ["up", "down", "left", "right"];
    for (const d of dirs) {
      expect(oppositeDirection(oppositeDirection(d))).toBe(d);
    }
  });
});

// ── Coordinate conversion ───────────────────────────────────────

describe("gridToPixel", () => {
  it("maps (0,0) to the center of the top-left tile", () => {
    const p = gridToPixel({ col: 0, row: 0 });
    expect(p.x).toBe(TILE_SIZE * 0.5);
    expect(p.y).toBe(TILE_SIZE * 0.5);
  });

  it("maps (1,2) correctly", () => {
    const p = gridToPixel({ col: 1, row: 2 });
    expect(p.x).toBe(TILE_SIZE * 1.5);
    expect(p.y).toBe(TILE_SIZE * 2.5);
  });

  it("maps the last tile to the expected pixel center", () => {
    const p = gridToPixel({ col: GRID_COLS - 1, row: GRID_ROWS - 1 });
    expect(p.x).toBe((GRID_COLS - 0.5) * TILE_SIZE);
    expect(p.y).toBe((GRID_ROWS - 0.5) * TILE_SIZE);
  });
});

describe("pixelToGrid", () => {
  it("maps tile center back to the same grid cell", () => {
    const original: GridPos = { col: 3, row: 7 };
    const pixel = gridToPixel(original);
    const back = pixelToGrid(pixel);
    expect(back).toEqual(original);
  });

  it("maps the left/top edge of a tile to that tile", () => {
    const g = pixelToGrid({ x: TILE_SIZE * 2, y: TILE_SIZE * 5 });
    expect(g).toEqual({ col: 2, row: 5 });
  });

  it("maps a pixel just before the right edge to the same tile", () => {
    const g = pixelToGrid({ x: TILE_SIZE * 3 - 0.01, y: 0 });
    expect(g.col).toBe(2);
  });

  it("maps (0,0) pixel to grid (0,0)", () => {
    expect(pixelToGrid({ x: 0, y: 0 })).toEqual({ col: 0, row: 0 });
  });
});

// ── Bounds checking ─────────────────────────────────────────────

describe("isInBounds", () => {
  it("returns true for (0,0)", () => {
    expect(isInBounds({ col: 0, row: 0 })).toBe(true);
  });

  it("returns true for the last valid cell", () => {
    expect(isInBounds({ col: GRID_COLS - 1, row: GRID_ROWS - 1 })).toBe(true);
  });

  it("returns false for negative col", () => {
    expect(isInBounds({ col: -1, row: 0 })).toBe(false);
  });

  it("returns false for negative row", () => {
    expect(isInBounds({ col: 0, row: -1 })).toBe(false);
  });

  it("returns false for col >= GRID_COLS", () => {
    expect(isInBounds({ col: GRID_COLS, row: 0 })).toBe(false);
  });

  it("returns false for row >= GRID_ROWS", () => {
    expect(isInBounds({ col: 0, row: GRID_ROWS })).toBe(false);
  });
});

// ── Step and equality ───────────────────────────────────────────

describe("stepInDirection", () => {
  it("moves up by decrementing row", () => {
    expect(stepInDirection({ col: 5, row: 5 }, "up")).toEqual({ col: 5, row: 4 });
  });

  it("moves down by incrementing row", () => {
    expect(stepInDirection({ col: 5, row: 5 }, "down")).toEqual({ col: 5, row: 6 });
  });

  it("moves left by decrementing col", () => {
    expect(stepInDirection({ col: 5, row: 5 }, "left")).toEqual({ col: 4, row: 5 });
  });

  it("moves right by incrementing col", () => {
    expect(stepInDirection({ col: 5, row: 5 }, "right")).toEqual({ col: 6, row: 5 });
  });

  it("can move out of bounds (no clamping)", () => {
    const result = stepInDirection({ col: 0, row: 0 }, "up");
    expect(result.row).toBe(-1);
    expect(isInBounds(result)).toBe(false);
  });
});

describe("gridEquals", () => {
  it("returns true for identical positions", () => {
    expect(gridEquals({ col: 3, row: 7 }, { col: 3, row: 7 })).toBe(true);
  });

  it("returns false when col differs", () => {
    expect(gridEquals({ col: 3, row: 7 }, { col: 4, row: 7 })).toBe(false);
  });

  it("returns false when row differs", () => {
    expect(gridEquals({ col: 3, row: 7 }, { col: 3, row: 8 })).toBe(false);
  });
});

// ── Interpolation ───────────────────────────────────────────────

describe("lerp", () => {
  it("returns a when t=0", () => {
    expect(lerp(10, 20, 0)).toBe(10);
  });

  it("returns b when t=1", () => {
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it("returns midpoint when t=0.5", () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
  });

  it("clamps t below 0", () => {
    expect(lerp(10, 20, -1)).toBe(10);
  });

  it("clamps t above 1", () => {
    expect(lerp(10, 20, 2)).toBe(20);
  });

  it("works with negative ranges", () => {
    expect(lerp(-10, 10, 0.5)).toBe(0);
  });
});

describe("lerpGridPos", () => {
  it("returns 'from' pixel pos at t=0", () => {
    const from: GridPos = { col: 0, row: 0 };
    const to: GridPos = { col: 1, row: 0 };
    const result = lerpGridPos(from, to, 0);
    const expected = gridToPixel(from);
    expect(result.x).toBeCloseTo(expected.x);
    expect(result.y).toBeCloseTo(expected.y);
  });

  it("returns 'to' pixel pos at t=1", () => {
    const from: GridPos = { col: 0, row: 0 };
    const to: GridPos = { col: 1, row: 0 };
    const result = lerpGridPos(from, to, 1);
    const expected = gridToPixel(to);
    expect(result.x).toBeCloseTo(expected.x);
    expect(result.y).toBeCloseTo(expected.y);
  });

  it("returns midpoint at t=0.5", () => {
    const from: GridPos = { col: 0, row: 0 };
    const to: GridPos = { col: 2, row: 0 };
    const result = lerpGridPos(from, to, 0.5);
    const pFrom = gridToPixel(from);
    const pTo = gridToPixel(to);
    expect(result.x).toBeCloseTo((pFrom.x + pTo.x) / 2);
    expect(result.y).toBeCloseTo((pFrom.y + pTo.y) / 2);
  });

  it("interpolates vertically", () => {
    const from: GridPos = { col: 5, row: 3 };
    const to: GridPos = { col: 5, row: 4 };
    const result = lerpGridPos(from, to, 0.5);
    // x should not change
    expect(result.x).toBeCloseTo(gridToPixel(from).x);
    // y should be halfway
    const expectedY = (gridToPixel(from).y + gridToPixel(to).y) / 2;
    expect(result.y).toBeCloseTo(expectedY);
  });
});

// ── MoveTicker ──────────────────────────────────────────────────

describe("MoveTicker", () => {
  let ticker: MoveTicker;

  beforeEach(() => {
    ticker = new MoveTicker(100); // 100ms interval for easy math
  });

  it("uses DEFAULT_MOVE_INTERVAL_MS when no argument given", () => {
    const defaultTicker = new MoveTicker();
    expect(defaultTicker.interval).toBe(DEFAULT_MOVE_INTERVAL_MS);
  });

  it("does not fire before the interval elapses", () => {
    expect(ticker.advance(50)).toBe(false);
    expect(ticker.advance(49)).toBe(false);
  });

  it("fires when accumulated time reaches the interval", () => {
    expect(ticker.advance(100)).toBe(true);
  });

  it("fires when accumulated time exceeds the interval", () => {
    ticker.advance(50);
    expect(ticker.advance(60)).toBe(true); // 50+60=110 ≥ 100
  });

  it("carries over leftover time after firing", () => {
    ticker.advance(50);
    ticker.advance(70); // fires, leftover = 20
    // next step should need only 80 more ms
    expect(ticker.advance(79)).toBe(false);
    expect(ticker.advance(1)).toBe(true);
  });

  it("caps carried-over time to one interval (prevents multi-step skips)", () => {
    // Advance by a huge delta (simulating a lag spike)
    ticker.advance(500); // fires; carried = min(400, 100) = 100
    // Because carried is capped at interval, next advance(0) should fire
    expect(ticker.advance(0)).toBe(true);
    // And then it should not fire again immediately
    expect(ticker.advance(0)).toBe(false);
  });

  // ── progress ──────────────────────────────────────────────────

  it("progress starts at 0", () => {
    expect(ticker.progress).toBe(0);
  });

  it("progress is proportional to accumulated time", () => {
    ticker.advance(25);
    expect(ticker.progress).toBeCloseTo(0.25);
    ticker.advance(25);
    expect(ticker.progress).toBeCloseTo(0.5);
  });

  it("progress resets toward 0 after a step fires", () => {
    ticker.advance(100); // fires, leftover = 0
    expect(ticker.progress).toBe(0);
  });

  it("progress accounts for leftover after firing", () => {
    ticker.advance(130); // fires, leftover = 30
    expect(ticker.progress).toBeCloseTo(0.3);
  });

  it("progress is clamped to 1 max", () => {
    // Artificially check that if accumulated somehow equals interval, progress ≤ 1
    ticker.advance(99);
    expect(ticker.progress).toBeLessThanOrEqual(1);
  });

  // ── setInterval ───────────────────────────────────────────────

  it("setInterval changes the step cadence", () => {
    ticker.setInterval(200);
    expect(ticker.interval).toBe(200);
    expect(ticker.advance(100)).toBe(false); // only half
    expect(ticker.advance(100)).toBe(true);
  });

  it("setInterval clamps to minimum 1ms", () => {
    ticker.setInterval(0);
    expect(ticker.interval).toBe(1);
    ticker.setInterval(-50);
    expect(ticker.interval).toBe(1);
  });

  // ── reset ─────────────────────────────────────────────────────

  it("reset sets accumulated to 0 and progress to 0", () => {
    ticker.advance(75);
    expect(ticker.progress).toBeGreaterThan(0);
    ticker.reset();
    expect(ticker.progress).toBe(0);
  });

  it("after reset, needs full interval to fire", () => {
    ticker.advance(75);
    ticker.reset();
    expect(ticker.advance(99)).toBe(false);
    expect(ticker.advance(1)).toBe(true);
  });
});

// ── DEFAULT_MOVE_INTERVAL_MS ────────────────────────────────────

describe("DEFAULT_MOVE_INTERVAL_MS", () => {
  it("is a positive number", () => {
    expect(DEFAULT_MOVE_INTERVAL_MS).toBeGreaterThan(0);
  });

  it("equals 125ms", () => {
    expect(DEFAULT_MOVE_INTERVAL_MS).toBe(125);
  });
});
