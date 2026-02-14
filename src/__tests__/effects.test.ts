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
  PARTICLE_COUNT,
  PARTICLE_LIFESPAN,
  SHAKE_DURATION,
  SHAKE_INTENSITY,
  PARTICLE_SPEED_MIN,
  PARTICLE_SPEED_MAX,
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
    // Find the emitFoodParticles call that comes after checkEat (the food-eat emit),
    // not the ghost-food burst emit which may appear earlier in the source.
    const emitIndex = source.indexOf("emitFoodParticles(this,", checkEatIndex);

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

  it("guards against missing texture in emitFoodParticles", () => {
    expect(source).toContain("textures.exists");
  });

  it("schedules cleanup of particle emitter", () => {
    expect(source).toContain("delayedCall");
    expect(source).toContain("destroy");
  });
});
