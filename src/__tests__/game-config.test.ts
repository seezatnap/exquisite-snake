import { describe, it, expect } from "vitest";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  TILE_SIZE,
  GRID_COLS,
  GRID_ROWS,
} from "@/game/config";

describe("Game config", () => {
  it("exports positive arena dimensions", () => {
    expect(ARENA_WIDTH).toBeGreaterThan(0);
    expect(ARENA_HEIGHT).toBeGreaterThan(0);
  });

  it("exports a positive tile size", () => {
    expect(TILE_SIZE).toBeGreaterThan(0);
  });

  it("grid dimensions are consistent with arena and tile size", () => {
    expect(GRID_COLS).toBe(ARENA_WIDTH / TILE_SIZE);
    expect(GRID_ROWS).toBe(ARENA_HEIGHT / TILE_SIZE);
  });

  it("arena dimensions are evenly divisible by tile size", () => {
    expect(ARENA_WIDTH % TILE_SIZE).toBe(0);
    expect(ARENA_HEIGHT % TILE_SIZE).toBe(0);
  });
});
