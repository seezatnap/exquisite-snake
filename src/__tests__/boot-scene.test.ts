import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { TEXTURE_KEYS } from "@/game/config";

const ROOT = path.resolve(__dirname, "../..");

// ── Phaser mock with Scene, graphics, and textures support ───────
const mockGenerateTexture = vi.fn();
const mockDestroyGraphics = vi.fn();
const mockFillStyle = vi.fn();
const mockFillRoundedRect = vi.fn();
const mockFillCircle = vi.fn();
const mockSceneStart = vi.fn();

const textureStore = new Set<string>();

function createMockGraphics() {
  return {
    fillStyle: mockFillStyle,
    fillRoundedRect: mockFillRoundedRect,
    fillCircle: mockFillCircle,
    generateTexture: vi.fn((key: string) => {
      textureStore.add(key);
      mockGenerateTexture(key);
    }),
    destroy: mockDestroyGraphics,
    setDepth: vi.fn(),
  };
}

vi.mock("phaser", () => {
  class MockScene {
    scene = { start: mockSceneStart };
    textures = {
      exists: (key: string) => textureStore.has(key),
    };
    make = {
      graphics: () => createMockGraphics(),
    };
    cameras = {
      main: {
        setBackgroundColor: vi.fn(),
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

// Import Boot after mock
import { Boot } from "@/game/scenes/Boot";

beforeEach(() => {
  textureStore.clear();
  mockGenerateTexture.mockClear();
  mockDestroyGraphics.mockClear();
  mockFillStyle.mockClear();
  mockFillRoundedRect.mockClear();
  mockFillCircle.mockClear();
  mockSceneStart.mockClear();
});

describe("Boot scene", () => {
  it("is a class with scene key 'Boot'", () => {
    const boot = new Boot();
    expect((boot as unknown as { config: { key: string } }).config?.key).toBe(
      "Boot"
    );
  });

  it("has preload and create methods", () => {
    const boot = new Boot();
    expect(typeof boot.preload).toBe("function");
    expect(typeof boot.create).toBe("function");
  });

  it("create() generates all five texture keys", () => {
    const boot = new Boot();
    boot.create();

    expect(mockGenerateTexture).toHaveBeenCalledWith(
      TEXTURE_KEYS.SNAKE_HEAD
    );
    expect(mockGenerateTexture).toHaveBeenCalledWith(
      TEXTURE_KEYS.SNAKE_BODY
    );
    expect(mockGenerateTexture).toHaveBeenCalledWith(TEXTURE_KEYS.FOOD);
    expect(mockGenerateTexture).toHaveBeenCalledWith(
      TEXTURE_KEYS.PARTICLE
    );
    expect(mockGenerateTexture).toHaveBeenCalledWith(
      TEXTURE_KEYS.LAVA_POOL
    );
  });

  it("create() destroys all graphics objects after texture generation", () => {
    const boot = new Boot();
    boot.create();

    // 5 base textures + 16 biome-specific textures (4 biomes × 4 types) = 21
    expect(mockDestroyGraphics).toHaveBeenCalledTimes(21);
  });

  it("create() transitions to MainScene", () => {
    const boot = new Boot();
    boot.create();

    expect(mockSceneStart).toHaveBeenCalledWith("MainScene");
  });

  it("does not regenerate textures that already exist", () => {
    textureStore.add(TEXTURE_KEYS.SNAKE_HEAD);
    textureStore.add(TEXTURE_KEYS.FOOD);

    const boot = new Boot();
    boot.create();

    // 3 base textures (SNAKE_BODY, PARTICLE, LAVA_POOL) + 16 biome-specific = 19
    expect(mockGenerateTexture).toHaveBeenCalledTimes(19);
    expect(mockGenerateTexture).toHaveBeenCalledWith(
      TEXTURE_KEYS.SNAKE_BODY
    );
    expect(mockGenerateTexture).toHaveBeenCalledWith(
      TEXTURE_KEYS.PARTICLE
    );
    expect(mockGenerateTexture).toHaveBeenCalledWith(
      TEXTURE_KEYS.LAVA_POOL
    );
  });
});

describe("Boot scene source file", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/game/scenes/Boot.ts"),
    "utf-8"
  );

  it("extends Phaser.Scene", () => {
    expect(source).toContain("extends Phaser.Scene");
  });

  it("imports TILE_SIZE from config", () => {
    expect(source).toContain("TILE_SIZE");
  });

  it("imports COLORS from config", () => {
    expect(source).toContain("COLORS");
  });

  it("imports TEXTURE_KEYS from config", () => {
    expect(source).toContain("TEXTURE_KEYS");
  });

  it("uses generateTexture to create assets", () => {
    expect(source).toContain("generateTexture");
  });

  it("transitions to MainScene after setup", () => {
    expect(source).toContain('scene.start("MainScene")');
  });
});
