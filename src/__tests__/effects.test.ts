import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");

// ── Phaser mock ──────────────────────────────────────────────────

const mockShake = vi.fn();
const mockEmitterDestroy = vi.fn();
const mockExplode = vi.fn();
const mockDelayedCall = vi.fn();
const mockTexturesExists = vi.fn().mockReturnValue(true);

function createMockEmitter() {
  return {
    explode: mockExplode,
    destroy: mockEmitterDestroy,
  };
}

const mockAddParticles = vi.fn(() => createMockEmitter());

const mockLineStyle = vi.fn();
const mockMoveTo = vi.fn();
const mockLineTo = vi.fn();
const mockStrokePath = vi.fn();

const mockGraphics = {
  lineStyle: mockLineStyle,
  moveTo: mockMoveTo,
  lineTo: mockLineTo,
  strokePath: mockStrokePath,
};

const mockSceneStart = vi.fn();
const mockDestroy = vi.fn();
const mockSetPosition = vi.fn();
const mockKeyboardOn = vi.fn();

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
    scene = { start: mockSceneStart };
    add = {
      graphics: () => mockGraphics,
      sprite: vi.fn(() => createMockSprite()),
      particles: mockAddParticles,
    };
    input = {
      keyboard: {
        on: mockKeyboardOn,
      },
    };
    cameras = {
      main: {
        shake: mockShake,
      },
    };
    textures = {
      exists: mockTexturesExists,
    };
    time = {
      delayedCall: mockDelayedCall,
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

// Import after mock
import Phaser from "phaser";
import {
  emitFoodParticles,
  shakeCamera,
  emitGhostTrailParticles,
  PARTICLE_COUNT,
  PARTICLE_LIFESPAN,
  SHAKE_DURATION,
  SHAKE_INTENSITY,
  PARTICLE_SPEED_MIN,
  PARTICLE_SPEED_MAX,
  GHOST_TRAIL_PARTICLE_COUNT,
  GHOST_TRAIL_PARTICLE_LIFESPAN,
  GHOST_TRAIL_PARTICLE_SPEED_MIN,
  GHOST_TRAIL_PARTICLE_SPEED_MAX,
} from "@/game/systems/effects";

beforeEach(() => {
  vi.clearAllMocks();
  mockTexturesExists.mockReturnValue(true);
});

// ── emitFoodParticles ─────────────────────────────────────────────

describe("emitFoodParticles", () => {
  it("creates a particle emitter at the given position", () => {
    const scene = new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
    emitFoodParticles(scene, 100, 200);

    expect(mockAddParticles).toHaveBeenCalledWith(
      100,
      200,
      "particle",
      expect.objectContaining({
        lifespan: PARTICLE_LIFESPAN,
        quantity: PARTICLE_COUNT,
        emitting: false,
      }),
    );
  });

  it("calls explode with the particle count", () => {
    const scene = new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
    emitFoodParticles(scene, 50, 75);

    expect(mockExplode).toHaveBeenCalledWith(PARTICLE_COUNT, 0, 0);
  });

  it("schedules emitter destruction after particles expire", () => {
    const scene = new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
    emitFoodParticles(scene, 0, 0);

    expect(mockDelayedCall).toHaveBeenCalledWith(
      PARTICLE_LIFESPAN + 50,
      expect.any(Function),
    );

    // Execute the callback and verify it destroys the emitter
    const destroyCallback = mockDelayedCall.mock.calls[0][1];
    destroyCallback();
    expect(mockEmitterDestroy).toHaveBeenCalled();
  });

  it("returns the emitter instance", () => {
    const scene = new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
    const emitter = emitFoodParticles(scene, 0, 0);

    expect(emitter).not.toBeNull();
    expect(emitter!.explode).toBeDefined();
  });

  it("returns null when particle texture is missing", () => {
    mockTexturesExists.mockReturnValue(false);
    const scene = new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
    const emitter = emitFoodParticles(scene, 0, 0);

    expect(emitter).toBeNull();
    expect(mockAddParticles).not.toHaveBeenCalled();
  });
});

describe("emitGhostTrailParticles", () => {
  it("creates a ghost trail burst at the given position", () => {
    const scene = new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
    emitGhostTrailParticles(scene, 150, 250, 0.4);

    expect(mockAddParticles).toHaveBeenCalledWith(
      150,
      250,
      "particle",
      expect.objectContaining({
        lifespan: GHOST_TRAIL_PARTICLE_LIFESPAN,
        quantity: GHOST_TRAIL_PARTICLE_COUNT,
        angle: { min: 0, max: 360 },
        speed: expect.objectContaining({
          min: GHOST_TRAIL_PARTICLE_SPEED_MIN,
          max: GHOST_TRAIL_PARTICLE_SPEED_MAX,
        }),
        alpha: { start: 0.4, end: 0 },
      }),
    );
  });

  it("calls explode with configured ghost particle quantity", () => {
    const scene = new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
    emitGhostTrailParticles(scene, 0, 0);

    expect(mockExplode).toHaveBeenCalledWith(GHOST_TRAIL_PARTICLE_COUNT, 0, 0);
  });

  it("returns null when texture is missing", () => {
    mockTexturesExists.mockReturnValue(false);
    const scene = new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
    const emitter = emitGhostTrailParticles(scene, 0, 0);

    expect(emitter).toBeNull();
    expect(mockAddParticles).not.toHaveBeenCalled();
  });

  it("supports a custom ghost trail tint color", () => {
    const scene = new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
    emitGhostTrailParticles(
      scene,
      25,
      50,
      0.5,
      0x00ff00,
    );

    expect(mockAddParticles).toHaveBeenCalledWith(
      25,
      50,
      "particle",
      expect.objectContaining({
        tint: 0x00ff00,
      }),
    );
  });
});

// ── shakeCamera ──────────────────────────────────────────────────

describe("shakeCamera", () => {
  it("shakes the main camera with configured duration and intensity", () => {
    const scene = new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
    shakeCamera(scene);

    expect(mockShake).toHaveBeenCalledWith(SHAKE_DURATION, SHAKE_INTENSITY);
  });

  it("does not throw when cameras.main is null", () => {
    const scene = new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
    (scene as unknown as { cameras: { main: null } }).cameras.main = null;

    expect(() => shakeCamera(scene)).not.toThrow();
  });
});

// ── Configuration constants ──────────────────────────────────────

describe("effect constants are tuned for readability", () => {
  it("particle count is reasonable (8–20)", () => {
    expect(PARTICLE_COUNT).toBeGreaterThanOrEqual(8);
    expect(PARTICLE_COUNT).toBeLessThanOrEqual(20);
  });

  it("particle lifespan is short (200–600 ms)", () => {
    expect(PARTICLE_LIFESPAN).toBeGreaterThanOrEqual(200);
    expect(PARTICLE_LIFESPAN).toBeLessThanOrEqual(600);
  });

  it("particle speeds are moderate", () => {
    expect(PARTICLE_SPEED_MIN).toBeGreaterThan(0);
    expect(PARTICLE_SPEED_MAX).toBeGreaterThan(PARTICLE_SPEED_MIN);
    expect(PARTICLE_SPEED_MAX).toBeLessThanOrEqual(300);
  });

  it("shake duration is brief (50–300 ms)", () => {
    expect(SHAKE_DURATION).toBeGreaterThanOrEqual(50);
    expect(SHAKE_DURATION).toBeLessThanOrEqual(300);
  });

  it("shake intensity is subtle (< 0.02)", () => {
    expect(SHAKE_INTENSITY).toBeGreaterThan(0);
    expect(SHAKE_INTENSITY).toBeLessThan(0.02);
  });

  it("ghost trail particle count is small", () => {
    expect(GHOST_TRAIL_PARTICLE_COUNT).toBeGreaterThanOrEqual(1);
    expect(GHOST_TRAIL_PARTICLE_COUNT).toBeLessThanOrEqual(6);
  });

  it("ghost trail particle lifespan is brief", () => {
    expect(GHOST_TRAIL_PARTICLE_LIFESPAN).toBeGreaterThanOrEqual(150);
    expect(GHOST_TRAIL_PARTICLE_LIFESPAN).toBeLessThanOrEqual(500);
  });

  it("ghost trail particle speeds are gentle", () => {
    expect(GHOST_TRAIL_PARTICLE_SPEED_MIN).toBeGreaterThan(0);
    expect(GHOST_TRAIL_PARTICLE_SPEED_MAX).toBeGreaterThan(
      GHOST_TRAIL_PARTICLE_SPEED_MIN,
    );
    expect(GHOST_TRAIL_PARTICLE_SPEED_MAX).toBeLessThanOrEqual(300);
  });
});

// ── MainScene integration ────────────────────────────────────────

describe("MainScene integrates effects", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/game/scenes/MainScene.ts"),
    "utf-8",
  );

  it("imports emitFoodParticles from effects module", () => {
    expect(source).toContain("emitFoodParticles");
    expect(source).toContain("systems/effects");
  });

  it("imports shakeCamera from effects module", () => {
    expect(source).toContain("shakeCamera");
  });

  it("calls emitFoodParticles when food is eaten", () => {
    expect(source).toContain("emitFoodParticles(this,");
  });

  it("calls shakeCamera in endRun", () => {
    expect(source).toContain("shakeCamera(this)");
  });

  it("captures food sprite position before checkEat (so particles appear at the eaten location)", () => {
    // The pattern: get sprite position, then checkEat, then emit at old position
    const spriteIndex = source.indexOf("getSprite()");
    const checkEatIndex = source.indexOf("checkEat");
    const emitIndex = source.indexOf("emitFoodParticles(this,");

    expect(spriteIndex).toBeGreaterThan(-1);
    expect(checkEatIndex).toBeGreaterThan(spriteIndex);
    expect(emitIndex).toBeGreaterThan(checkEatIndex);
  });
});

// ── effects.ts source file checks ────────────────────────────────

describe("effects.ts source file", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/game/systems/effects.ts"),
    "utf-8",
  );

  it("imports TEXTURE_KEYS from config", () => {
    expect(source).toContain("TEXTURE_KEYS");
    expect(source).toContain("config");
  });

  it("uses the particle texture key", () => {
    expect(source).toContain("TEXTURE_KEYS.PARTICLE");
  });

  it("exports emitFoodParticles function", () => {
    expect(source).toMatch(/export\s+function\s+emitFoodParticles/);
  });

  it("exports shakeCamera function", () => {
    expect(source).toMatch(/export\s+function\s+shakeCamera/);
  });

  it("exports emitGhostTrailParticles function", () => {
    expect(source).toMatch(/export\s+function\s+emitGhostTrailParticles/);
  });

  it("exports ghost trail particle constants", () => {
    expect(source).toContain("GHOST_TRAIL_PARTICLE_COUNT");
    expect(source).toContain("GHOST_TRAIL_PARTICLE_LIFESPAN");
    expect(source).toContain("GHOST_TRAIL_PARTICLE_SPEED_MIN");
    expect(source).toContain("GHOST_TRAIL_PARTICLE_SPEED_MAX");
  });

  it("guards against missing texture in emitFoodParticles", () => {
    expect(source).toContain("textures.exists");
  });

  it("schedules cleanup of particle emitter", () => {
    expect(source).toContain("delayedCall");
    expect(source).toContain("destroy");
  });
});
