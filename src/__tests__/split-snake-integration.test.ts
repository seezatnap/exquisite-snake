import { describe, it, expect, vi, beforeEach } from "vitest";
import { gameBridge } from "@/game/bridge";
import { Biome } from "@/game/systems/BiomeManager";
import { SplitSnakeRenderer } from "@/game/systems/SplitSnakeRenderer";

// ── Phaser mock ──────────────────────────────────────────────────

function createFreshGraphicsMock() {
  return {
    lineStyle: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    strokePath: vi.fn(),
    fillStyle: vi.fn(),
    fillCircle: vi.fn(),
    fillRect: vi.fn(),
    strokeCircle: vi.fn(),
    clear: vi.fn(),
    destroy: vi.fn(),
    setDepth: vi.fn(),
  };
}

const mockDestroy = vi.fn();
const mockSetPosition = vi.fn();
const mockSpriteSetDepth = vi.fn();
const mockSetBackgroundColor = vi.fn();
const mockCameraShake = vi.fn();
const mockTimeDelayedCall = vi.fn();

function createMockSprite() {
  return {
    destroy: mockDestroy,
    setPosition: mockSetPosition,
    setDepth: mockSpriteSetDepth,
    x: 0,
    y: 0,
  };
}

function createMockText() {
  return {
    setOrigin: vi.fn(),
    setDepth: vi.fn(),
    setAlpha: vi.fn(),
    setVisible: vi.fn(),
    setText: vi.fn(),
    setPosition: vi.fn(),
    destroy: vi.fn(),
  };
}

vi.mock("phaser", () => {
  class MockScene {
    scene = { start: vi.fn() };
    add = {
      graphics: vi.fn(() => createFreshGraphicsMock()),
      sprite: vi.fn(() => createMockSprite()),
      text: vi.fn(() => createMockText()),
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
        shake: mockCameraShake,
        setBackgroundColor: mockSetBackgroundColor,
      },
    };
    textures = {
      exists: vi.fn().mockReturnValue(true),
    };
    time = {
      delayedCall: mockTimeDelayedCall,
    };
    events: Record<string, unknown> | null = null;
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

// Import after mock
import { MainScene } from "@/game/scenes/MainScene";

/** Reset the singleton bridge to its initial state between tests. */
function resetBridge(): void {
  gameBridge.setPhase("start");
  gameBridge.setScore(0);
  gameBridge.setHighScore(0);
  gameBridge.setElapsedTime(0);
  gameBridge.setCurrentBiome(Biome.NeonCity);
  gameBridge.setBiomeVisitStats({
    [Biome.NeonCity]: 1,
    [Biome.IceCavern]: 0,
    [Biome.MoltenCore]: 0,
    [Biome.VoidRift]: 0,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetBridge();
});

// ── MainScene integration tests ─────────────────────────────────

describe("MainScene – split-snake rendering integration", () => {
  it("exposes getSplitSnakeRenderer accessor", () => {
    const scene = new MainScene();
    scene.create();
    expect(scene.getSplitSnakeRenderer()).toBeInstanceOf(SplitSnakeRenderer);
  });

  it("split-snake renderer is reset on startRun", () => {
    const scene = new MainScene();
    scene.create();
    const renderer = scene.getSplitSnakeRenderer();
    const spy = vi.spyOn(renderer, "reset");

    scene.enterPhase("playing");
    expect(spy).toHaveBeenCalled();
  });

  it("split-snake renderer is reset on endRun", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const renderer = scene.getSplitSnakeRenderer();
    const spy = vi.spyOn(renderer, "reset");

    scene.endRun();
    expect(spy).toHaveBeenCalled();
  });

  it("split-snake renderer is updated during game update", () => {
    const scene = new MainScene();
    scene.create();
    scene.setPortalManagerOptions({
      spawnIntervalMs: 10,
      spawnJitterMs: 0,
      maxActivePairs: 1,
      rng: () => 0.5,
    });
    scene.setRng(() => 0.5);
    scene.enterPhase("playing");

    const renderer = scene.getSplitSnakeRenderer();
    const spy = vi.spyOn(renderer, "update");

    scene.update(0, 16);
    expect(spy).toHaveBeenCalled();
  });

  it("split-snake renderer is destroyed on scene shutdown", () => {
    const scene = new MainScene();
    scene.create();
    const renderer = scene.getSplitSnakeRenderer();
    const spy = vi.spyOn(renderer, "destroy");

    scene.shutdown();
    expect(spy).toHaveBeenCalled();
  });

  it("split-snake renderer receives null transit when no portal traversal active", () => {
    const scene = new MainScene();
    scene.create();
    scene.setPortalManagerOptions({
      spawnIntervalMs: 999_999, // No portals spawned
      spawnJitterMs: 0,
      maxActivePairs: 1,
      rng: () => 0.5,
    });
    scene.setRng(() => 0.5);
    scene.enterPhase("playing");

    const renderer = scene.getSplitSnakeRenderer();
    const spy = vi.spyOn(renderer, "update");

    scene.update(0, 16);
    expect(spy).toHaveBeenCalled();
    // The 4th argument (transit) should be null
    const transitArg = spy.mock.calls[0][3];
    expect(transitArg).toBeNull();
  });

  it("split-snake renderer receives segments from the snake", () => {
    const scene = new MainScene();
    scene.create();
    scene.setPortalManagerOptions({
      spawnIntervalMs: 999_999,
      spawnJitterMs: 0,
      maxActivePairs: 1,
      rng: () => 0.5,
    });
    scene.setRng(() => 0.5);
    scene.enterPhase("playing");

    const renderer = scene.getSplitSnakeRenderer();
    const spy = vi.spyOn(renderer, "update");

    scene.update(0, 16);
    expect(spy).toHaveBeenCalled();
    // The 3rd argument (segments) should be the snake's segments
    const segmentsArg = spy.mock.calls[0][2];
    expect(Array.isArray(segmentsArg)).toBe(true);
    expect(segmentsArg.length).toBe(3); // default snake length
  });
});
