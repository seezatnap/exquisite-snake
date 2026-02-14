import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");

// ── Phaser mock ──────────────────────────────────────────────────

const mockEmitterDestroy = vi.fn();
const mockEmitterStop = vi.fn();
const mockEmitterStart = vi.fn();
const mockEmitterSetPosition = vi.fn();
const mockTexturesExists = vi.fn().mockReturnValue(true);

function createMockEmitter() {
  return {
    destroy: mockEmitterDestroy,
    stop: mockEmitterStop,
    start: mockEmitterStart,
    setPosition: mockEmitterSetPosition,
    emitting: true,
    particleAlpha: 1,
  };
}

const mockAddParticles = vi.fn(() => createMockEmitter());

const mockSpriteDestroy = vi.fn();
const mockSpriteSetPosition = vi.fn();
const mockSpriteSetAlpha = vi.fn();
const mockSpriteSetVisible = vi.fn();

function createMockSprite() {
  return {
    destroy: mockSpriteDestroy,
    setPosition: mockSpriteSetPosition,
    setAlpha: mockSpriteSetAlpha,
    setVisible: mockSpriteSetVisible,
    visible: true,
    x: 0,
    y: 0,
  };
}

vi.mock("phaser", () => {
  class MockScene {
    add = {
      sprite: vi.fn(() => createMockSprite()),
      particles: mockAddParticles,
      graphics: vi.fn(),
    };
    textures = {
      exists: mockTexturesExists,
    };
    time = {
      delayedCall: vi.fn(),
    };
    scene = { start: vi.fn() };
    cameras = { main: { shake: vi.fn() } };
    input = { keyboard: { on: vi.fn() } };
    constructor(public config?: { key: string }) {}
  }
  return {
    default: {
      Scene: MockScene,
      Game: class {},
      AUTO: 0,
      Scale: { FIT: 1, CENTER_BOTH: 1 },
    },
    Scene: MockScene,
    Game: class {},
    AUTO: 0,
    Scale: { FIT: 1, CENTER_BOTH: 1 },
  };
});

// Import after mock
import Phaser from "phaser";
import {
  EchoGhostRenderer,
  GHOST_BASE_ALPHA,
  GHOST_TRAIL_PARTICLE_LIFESPAN,
  GHOST_TRAIL_PARTICLE_COUNT,
  GHOST_TRAIL_PARTICLE_SPEED_MIN,
  GHOST_TRAIL_PARTICLE_SPEED_MAX,
} from "@/game/systems/echoGhostRenderer";
import { EchoGhost } from "@/game/entities/EchoGhost";

beforeEach(() => {
  vi.clearAllMocks();
  mockTexturesExists.mockReturnValue(true);
});

// ── Helper: create scene and renderer ──────────────────────────

function createRenderer() {
  const scene = new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
  const renderer = new EchoGhostRenderer(scene);
  return { scene, renderer };
}

function createGhostWithTrail(trailLength: number = 3): EchoGhost {
  const ghost = new EchoGhost(125);
  // Record enough ticks to produce a trail (need delayInTicks + 1 records)
  for (let i = 0; i < ghost.delayInTicks + trailLength; i++) {
    const segments = [];
    for (let s = 0; s < trailLength; s++) {
      segments.push({ col: i + s, row: 5 });
    }
    ghost.record(segments);
  }
  return ghost;
}

// ── EchoGhostRenderer ─────────────────────────────────────────

describe("EchoGhostRenderer", () => {
  describe("update with active ghost", () => {
    it("creates sprites for each ghost trail segment", () => {
      const { renderer } = createRenderer();
      const ghost = createGhostWithTrail(3);

      renderer.update(ghost);

      expect(renderer.getSpriteCount()).toBe(3);
    });

    it("sets sprite alpha to GHOST_BASE_ALPHA * lifecycle opacity", () => {
      const { renderer } = createRenderer();
      const ghost = createGhostWithTrail(3);

      expect(ghost.getOpacity()).toBe(1);
      renderer.update(ghost);

      // setAlpha should be called with GHOST_BASE_ALPHA * 1.0 = 0.4
      expect(mockSpriteSetAlpha).toHaveBeenCalledWith(GHOST_BASE_ALPHA);
    });

    it("sets sprites visible when trail exists", () => {
      const { renderer } = createRenderer();
      const ghost = createGhostWithTrail(3);

      renderer.update(ghost);

      expect(mockSpriteSetVisible).toHaveBeenCalledWith(true);
    });

    it("positions sprites at grid pixel centers", () => {
      const { renderer } = createRenderer();
      const ghost = createGhostWithTrail(3);

      renderer.update(ghost);

      // Sprites should be positioned at gridToPixel coordinates
      expect(mockSpriteSetPosition).toHaveBeenCalled();
    });
  });

  describe("update with no ghost trail", () => {
    it("hides all sprites when ghost has no trail (warming phase)", () => {
      const { renderer } = createRenderer();
      const ghost = new EchoGhost(125);

      // Record only 1 tick (not enough for delay)
      ghost.record([{ col: 5, row: 5 }]);

      renderer.update(ghost);

      expect(renderer.getVisibleSpriteCount()).toBe(0);
    });
  });

  describe("update during fading", () => {
    it("applies reduced alpha during fade-out", () => {
      const { renderer } = createRenderer();
      const ghost = createGhostWithTrail(3);

      // Stop recording to trigger fade
      ghost.stopRecording();

      // Advance playhead until fading starts
      let state = ghost.getLifecycleState();
      let advances = 0;
      while (state !== "fading" && advances < 200) {
        ghost.advancePlayhead();
        state = ghost.getLifecycleState();
        advances++;
      }
      expect(state).toBe("fading");

      // Advance a couple more ticks into the fade so opacity drops below 1
      let opacity = ghost.getOpacity();
      while (opacity >= 1 && advances < 200) {
        ghost.advancePlayhead();
        opacity = ghost.getOpacity();
        advances++;
      }
      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThan(1);

      renderer.update(ghost);

      const expectedAlpha = GHOST_BASE_ALPHA * opacity;
      expect(mockSpriteSetAlpha).toHaveBeenCalledWith(expectedAlpha);
    });
  });

  describe("trailing particles", () => {
    it("creates a particle emitter for the ghost tail", () => {
      const { renderer } = createRenderer();
      const ghost = createGhostWithTrail(3);

      renderer.update(ghost);

      expect(mockAddParticles).toHaveBeenCalled();
      expect(renderer.getTrailEmitter()).not.toBeNull();
    });

    it("positions the trail emitter at the tail segment", () => {
      const { renderer } = createRenderer();
      const ghost = createGhostWithTrail(3);

      renderer.update(ghost);

      // The emitter should be created at some position
      expect(mockAddParticles).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        "ghost-particle",
        expect.objectContaining({
          lifespan: GHOST_TRAIL_PARTICLE_LIFESPAN,
          quantity: GHOST_TRAIL_PARTICLE_COUNT,
        }),
      );
    });

    it("does not create emitter when ghost-particle texture is missing", () => {
      mockTexturesExists.mockImplementation((key: string) => key !== "ghost-particle");
      const { renderer } = createRenderer();
      const ghost = createGhostWithTrail(3);

      renderer.update(ghost);

      // Particles call should not include ghost-particle texture
      const ghostParticleCalls = (mockAddParticles.mock.calls as unknown[][]).filter(
        (call) => call[2] === "ghost-particle"
      );
      expect(ghostParticleCalls).toHaveLength(0);
    });
  });

  describe("sprite pool management", () => {
    it("does not create sprites when ghost-body texture is missing", () => {
      mockTexturesExists.mockImplementation((key: string) => key !== "ghost-body");
      const { renderer } = createRenderer();
      const ghost = createGhostWithTrail(3);

      renderer.update(ghost);

      expect(renderer.getSpriteCount()).toBe(0);
    });

    it("reuses existing sprites when trail length stays the same", () => {
      const { scene, renderer } = createRenderer();
      const ghost = createGhostWithTrail(3);

      renderer.update(ghost);
      const countAfterFirst = renderer.getSpriteCount();

      // Record one more tick (trail length stays 3)
      ghost.record([{ col: 99, row: 5 }, { col: 98, row: 5 }, { col: 97, row: 5 }]);

      const spriteCallsBefore = (scene.add.sprite as ReturnType<typeof vi.fn>).mock.calls.length;
      renderer.update(ghost);
      const spriteCallsAfter = (scene.add.sprite as ReturnType<typeof vi.fn>).mock.calls.length;

      // Should not have created more sprites
      expect(renderer.getSpriteCount()).toBe(countAfterFirst);
      expect(spriteCallsAfter).toBe(spriteCallsBefore);
    });
  });

  describe("destroy", () => {
    it("destroys all sprites", () => {
      const { renderer } = createRenderer();
      const ghost = createGhostWithTrail(3);

      renderer.update(ghost);
      const count = renderer.getSpriteCount();
      expect(count).toBeGreaterThan(0);

      renderer.destroy();

      expect(renderer.getSpriteCount()).toBe(0);
      expect(mockSpriteDestroy).toHaveBeenCalledTimes(count);
    });

    it("destroys the trail emitter", () => {
      const { renderer } = createRenderer();
      const ghost = createGhostWithTrail(3);

      renderer.update(ghost);
      expect(renderer.getTrailEmitter()).not.toBeNull();

      renderer.destroy();

      expect(renderer.getTrailEmitter()).toBeNull();
      expect(mockEmitterDestroy).toHaveBeenCalled();
    });
  });
});

// ── Constants ──────────────────────────────────────────────────

describe("ghost renderer constants", () => {
  it("base alpha is 40%", () => {
    expect(GHOST_BASE_ALPHA).toBe(0.4);
  });

  it("trail particle lifespan is reasonable (100–500 ms)", () => {
    expect(GHOST_TRAIL_PARTICLE_LIFESPAN).toBeGreaterThanOrEqual(100);
    expect(GHOST_TRAIL_PARTICLE_LIFESPAN).toBeLessThanOrEqual(500);
  });

  it("trail particle speeds are gentle", () => {
    expect(GHOST_TRAIL_PARTICLE_SPEED_MIN).toBeGreaterThan(0);
    expect(GHOST_TRAIL_PARTICLE_SPEED_MAX).toBeGreaterThan(GHOST_TRAIL_PARTICLE_SPEED_MIN);
    expect(GHOST_TRAIL_PARTICLE_SPEED_MAX).toBeLessThanOrEqual(100);
  });
});

// ── Source file checks ────────────────────────────────────────

describe("echoGhostRenderer.ts source", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/game/systems/echoGhostRenderer.ts"),
    "utf-8",
  );

  it("imports TEXTURE_KEYS from config", () => {
    expect(source).toContain("TEXTURE_KEYS");
    expect(source).toContain("config");
  });

  it("uses GHOST_BODY texture key for sprites", () => {
    expect(source).toContain("TEXTURE_KEYS.GHOST_BODY");
  });

  it("uses GHOST_PARTICLE texture key for trailing particles", () => {
    expect(source).toContain("TEXTURE_KEYS.GHOST_PARTICLE");
  });

  it("imports gridToPixel for coordinate conversion", () => {
    expect(source).toContain("gridToPixel");
  });

  it("exports GHOST_BASE_ALPHA constant", () => {
    expect(source).toMatch(/export\s+const\s+GHOST_BASE_ALPHA/);
  });

  it("guards against missing textures", () => {
    expect(source).toContain("textures.exists");
  });
});

// ── Boot.ts integration checks ────────────────────────────────

describe("Boot.ts generates ghost textures", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/game/scenes/Boot.ts"),
    "utf-8",
  );

  it("generates GHOST_BODY texture", () => {
    expect(source).toContain("TEXTURE_KEYS.GHOST_BODY");
  });

  it("generates GHOST_PARTICLE texture", () => {
    expect(source).toContain("TEXTURE_KEYS.GHOST_PARTICLE");
  });

  it("uses dashed line drawing for ghost body", () => {
    expect(source).toContain("drawDashedLine");
  });
});

// ── MainScene integration checks ──────────────────────────────

describe("MainScene integrates EchoGhostRenderer", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/game/scenes/MainScene.ts"),
    "utf-8",
  );

  it("imports EchoGhostRenderer", () => {
    expect(source).toContain("EchoGhostRenderer");
    expect(source).toContain("echoGhostRenderer");
  });

  it("creates renderer in createEntities", () => {
    expect(source).toContain("new EchoGhostRenderer(this)");
  });

  it("calls renderer update in the game loop", () => {
    expect(source).toContain("echoGhostRenderer.update");
  });

  it("destroys renderer in destroyEntities", () => {
    expect(source).toContain("echoGhostRenderer.destroy()");
  });
});

// ── config.ts ghost entries ────────────────────────────────────

describe("config.ts includes ghost constants", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/game/config.ts"),
    "utf-8",
  );

  it("defines GHOST_BODY color", () => {
    expect(source).toContain("GHOST_BODY:");
  });

  it("defines GHOST_PARTICLE color", () => {
    expect(source).toContain("GHOST_PARTICLE:");
  });

  it("defines ghost-body texture key", () => {
    expect(source).toContain('"ghost-body"');
  });

  it("defines ghost-particle texture key", () => {
    expect(source).toContain('"ghost-particle"');
  });
});
