import { describe, it, expect, vi, beforeEach } from "vitest";
import { Biome, BIOME_CYCLE, BIOME_DURATION_MS } from "@/game/systems/BiomeManager";
import {
  BIOME_THEMES,
  getBiomeTheme,
  type BiomeThemeColors,
} from "@/game/systems/BiomeTheme";
import { biomeTextureKey, TEXTURE_KEYS, COLORS } from "@/game/config";
import { gameBridge } from "@/game/bridge";

// ── BiomeTheme definitions ──────────────────────────────────────

describe("BiomeTheme definitions", () => {
  it("defines a theme for every biome in the cycle", () => {
    for (const biome of BIOME_CYCLE) {
      expect(BIOME_THEMES[biome]).toBeDefined();
      expect(BIOME_THEMES[biome].biome).toBe(biome);
    }
  });

  it("every theme has all required color fields", () => {
    const requiredKeys: (keyof BiomeThemeColors)[] = [
      "background",
      "backgroundCss",
      "gridLine",
      "gridAlpha",
      "snakeHead",
      "snakeBody",
      "food",
      "particle",
    ];

    for (const biome of BIOME_CYCLE) {
      const colors = BIOME_THEMES[biome].colors;
      for (const key of requiredKeys) {
        expect(colors[key], `${biome}.colors.${key}`).toBeDefined();
      }
    }
  });

  it("each biome has a distinct background color", () => {
    const bgs = BIOME_CYCLE.map((b) => BIOME_THEMES[b].colors.background);
    const uniqueBgs = new Set(bgs);
    expect(uniqueBgs.size).toBe(BIOME_CYCLE.length);
  });

  it("each biome has a distinct snake head color", () => {
    const heads = BIOME_CYCLE.map((b) => BIOME_THEMES[b].colors.snakeHead);
    const uniqueHeads = new Set(heads);
    expect(uniqueHeads.size).toBe(BIOME_CYCLE.length);
  });

  it("backgroundCss matches background hex value", () => {
    for (const biome of BIOME_CYCLE) {
      const { background, backgroundCss } = BIOME_THEMES[biome].colors;
      const expectedCss = "#" + background.toString(16).padStart(6, "0");
      expect(backgroundCss).toBe(expectedCss);
    }
  });

  it("gridAlpha is between 0 and 1 for all biomes", () => {
    for (const biome of BIOME_CYCLE) {
      const alpha = BIOME_THEMES[biome].colors.gridAlpha;
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThanOrEqual(1);
    }
  });
});

describe("getBiomeTheme()", () => {
  it("returns the correct theme for each biome", () => {
    for (const biome of BIOME_CYCLE) {
      const theme = getBiomeTheme(biome);
      expect(theme).toBe(BIOME_THEMES[biome]);
    }
  });
});

// ── biomeTextureKey helper ──────────────────────────────────────

describe("biomeTextureKey()", () => {
  it("produces unique keys for different biomes", () => {
    const keys = BIOME_CYCLE.map((b) =>
      biomeTextureKey(TEXTURE_KEYS.SNAKE_HEAD, b),
    );
    const unique = new Set(keys);
    expect(unique.size).toBe(BIOME_CYCLE.length);
  });

  it("formats as base-biome", () => {
    expect(biomeTextureKey("snake-head", "IceCavern")).toBe(
      "snake-head-IceCavern",
    );
    expect(biomeTextureKey("food", "MoltenCore")).toBe("food-MoltenCore");
  });

  it("produces different keys for different base textures", () => {
    const headKey = biomeTextureKey(TEXTURE_KEYS.SNAKE_HEAD, Biome.NeonCity);
    const bodyKey = biomeTextureKey(TEXTURE_KEYS.SNAKE_BODY, Biome.NeonCity);
    expect(headKey).not.toBe(bodyKey);
  });
});

// ── Neon City default theme matches original COLORS ─────────────

describe("Neon City theme matches original palette", () => {
  it("Neon City snakeHead matches COLORS.SNAKE_HEAD", () => {
    expect(BIOME_THEMES[Biome.NeonCity].colors.snakeHead).toBe(
      COLORS.SNAKE_HEAD,
    );
  });

  it("Neon City snakeBody matches COLORS.SNAKE_BODY", () => {
    expect(BIOME_THEMES[Biome.NeonCity].colors.snakeBody).toBe(
      COLORS.SNAKE_BODY,
    );
  });

  it("Neon City food matches COLORS.FOOD", () => {
    expect(BIOME_THEMES[Biome.NeonCity].colors.food).toBe(COLORS.FOOD);
  });

  it("Neon City background matches COLORS.BACKGROUND", () => {
    expect(BIOME_THEMES[Biome.NeonCity].colors.background).toBe(
      COLORS.BACKGROUND,
    );
  });
});

// ── MainScene biome theme integration ───────────────────────────

const mockDestroy = vi.fn();
const mockSetPosition = vi.fn();
const mockSetTexture = vi.fn();

function createMockSprite() {
  return {
    destroy: mockDestroy,
    setPosition: mockSetPosition,
    setTexture: mockSetTexture,
    setDepth: vi.fn().mockReturnThis(),
    setAlpha: vi.fn().mockReturnThis(),
    setScale: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    setRotation: vi.fn().mockReturnThis(),
    x: 0,
    y: 0,
  };
}

const mockSetBackgroundColor = vi.fn();

vi.mock("phaser", () => {
  class MockScene {
    scene = { start: vi.fn() };
    add = {
      graphics: () => ({
        lineStyle: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        strokePath: vi.fn(),
        destroy: vi.fn(),
        setDepth: vi.fn(),
        clear: vi.fn(),
        fillStyle: vi.fn(),
        fillRect: vi.fn(),
        setAlpha: vi.fn(),
        setVisible: vi.fn(),
        scene: true,
      }),
      sprite: vi.fn(() => createMockSprite()),
      particles: vi.fn(() => ({
        explode: vi.fn(),
        destroy: vi.fn(),
      })),
    };
    input = {
      keyboard: {
        on: vi.fn(),
        off: vi.fn(),
      },
    };
    cameras = {
      main: {
        shake: vi.fn(),
        setBackgroundColor: mockSetBackgroundColor,
      },
    };
    textures = {
      exists: vi.fn().mockReturnValue(true),
    };
    time = {
      delayedCall: vi.fn(),
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

import { MainScene } from "@/game/scenes/MainScene";

function resetBridge(): void {
  gameBridge.setPhase("start");
  gameBridge.setScore(0);
  gameBridge.setHighScore(0);
  gameBridge.setElapsedTime(0);
  gameBridge.setBiome(Biome.NeonCity);
  gameBridge.setBiomeTimeRemaining(0);
  gameBridge.setBiomeVisitStats({
    visits: {
      [Biome.NeonCity]: 0,
      [Biome.IceCavern]: 0,
      [Biome.MoltenCore]: 0,
      [Biome.VoidRift]: 0,
    },
    uniqueCount: 0,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetBridge();
});

describe("MainScene – biome theme application", () => {
  it("applies NeonCity theme on startRun", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    expect(scene.getCurrentThemeBiome()).toBe(Biome.NeonCity);
  });

  it("applies new theme on biome transition", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.reset({ col: 15, row: 15 }, "right", 1);

    // Advance to trigger biome transition (starts dissolve transition)
    scene.update(0, BIOME_DURATION_MS);

    if (gameBridge.getState().phase === "playing") {
      // The dissolve transition applies the theme at its midpoint,
      // so advance enough for the transition to complete
      snake.reset({ col: 15, row: 15 }, "right", 1);
      scene.update(0, 1000);
      expect(scene.getCurrentThemeBiome()).toBe(Biome.IceCavern);
    }
  });

  it("changes camera background on biome change", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    mockSetBackgroundColor.mockClear();

    // Manually apply a different biome theme
    scene.applyBiomeTheme(Biome.MoltenCore);

    const expected = BIOME_THEMES[Biome.MoltenCore].colors.backgroundCss;
    expect(mockSetBackgroundColor).toHaveBeenCalledWith(expected);
  });

  it("applies theme for all four biomes without errors", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    for (const biome of BIOME_CYCLE) {
      expect(() => scene.applyBiomeTheme(biome)).not.toThrow();
      expect(scene.getCurrentThemeBiome()).toBe(biome);
    }
  });

  it("resets theme to NeonCity on new run", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    // Apply a non-default theme
    scene.applyBiomeTheme(Biome.VoidRift);
    expect(scene.getCurrentThemeBiome()).toBe(Biome.VoidRift);

    // End and restart
    scene.endRun();
    scene.enterPhase("playing");

    expect(scene.getCurrentThemeBiome()).toBe(Biome.NeonCity);
  });
});

describe("MainScene – applyBiomeTheme retextures entities", () => {
  it("calls retextureSprites on snake when theme changes", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const spy = vi.spyOn(snake, "retextureSprites");

    scene.applyBiomeTheme(Biome.IceCavern);

    const expectedHead = biomeTextureKey(TEXTURE_KEYS.SNAKE_HEAD, Biome.IceCavern);
    const expectedBody = biomeTextureKey(TEXTURE_KEYS.SNAKE_BODY, Biome.IceCavern);
    expect(spy).toHaveBeenCalledWith(expectedHead, expectedBody);
  });

  it("calls setTexture on food sprite when theme changes", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const food = scene.getFood()!;
    const foodSprite = food.getSprite();
    const spy = vi.spyOn(foodSprite, "setTexture");

    scene.applyBiomeTheme(Biome.MoltenCore);

    const expectedFood = biomeTextureKey(TEXTURE_KEYS.FOOD, Biome.MoltenCore);
    expect(spy).toHaveBeenCalledWith(expectedFood);
  });
});
