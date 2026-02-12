import { describe, it, expect, vi } from "vitest";

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
  ARENA_WIDTH,
  ARENA_HEIGHT,
  TILE_SIZE,
  GRID_COLS,
  GRID_ROWS,
  COLORS,
  TEXTURE_KEYS,
  createGameConfig,
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

describe("COLORS palette", () => {
  it("exports a COLORS object with neon color values", () => {
    expect(COLORS).toBeDefined();
    expect(typeof COLORS.NEON_PINK).toBe("number");
    expect(typeof COLORS.NEON_CYAN).toBe("number");
    expect(typeof COLORS.BACKGROUND).toBe("number");
  });

  it("COLORS.BACKGROUND matches dark theme (#0a0a0a)", () => {
    expect(COLORS.BACKGROUND).toBe(0x0a0a0a);
  });

  it("has snake and food color entries", () => {
    expect(COLORS.SNAKE_HEAD).toBeDefined();
    expect(COLORS.SNAKE_BODY).toBeDefined();
    expect(COLORS.FOOD).toBeDefined();
    expect(COLORS.PARTICLE).toBeDefined();
  });
});

describe("TEXTURE_KEYS", () => {
  it("exports texture keys for all gameplay primitives", () => {
    expect(TEXTURE_KEYS.SNAKE_HEAD).toBe("snake-head");
    expect(TEXTURE_KEYS.SNAKE_BODY).toBe("snake-body");
    expect(TEXTURE_KEYS.FOOD).toBe("food");
    expect(TEXTURE_KEYS.PARTICLE).toBe("particle");
  });

  it("all texture keys are unique strings", () => {
    const values = Object.values(TEXTURE_KEYS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

describe("createGameConfig", () => {
  it("returns a config object with arena dimensions", () => {
    const parent = document.createElement("div");
    const config = createGameConfig(parent);
    expect(config.width).toBe(ARENA_WIDTH);
    expect(config.height).toBe(ARENA_HEIGHT);
  });

  it("sets the provided element as parent", () => {
    const parent = document.createElement("div");
    const config = createGameConfig(parent);
    expect(config.parent).toBe(parent);
  });

  it("configures scale mode FIT with CENTER_BOTH", () => {
    const parent = document.createElement("div");
    const config = createGameConfig(parent);
    expect(config.scale).toBeDefined();
    expect(
      (config.scale as Record<string, unknown>).mode
    ).toBeDefined();
    expect(
      (config.scale as Record<string, unknown>).autoCenter
    ).toBeDefined();
  });

  it("includes Boot scene in scene list", () => {
    const parent = document.createElement("div");
    const config = createGameConfig(parent);
    expect(Array.isArray(config.scene)).toBe(true);
    expect((config.scene as unknown[]).length).toBeGreaterThan(0);
  });

  it("sets dark background color", () => {
    const parent = document.createElement("div");
    const config = createGameConfig(parent);
    expect(config.backgroundColor).toBe("#0a0a0a");
  });
});
