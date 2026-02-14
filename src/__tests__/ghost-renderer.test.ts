import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");

// ── Phaser mock ──────────────────────────────────────────────────

const mockGraphicsClear = vi.fn();
const mockGraphicsFillStyle = vi.fn();
const mockGraphicsFillRoundedRect = vi.fn();
const mockGraphicsLineStyle = vi.fn();
const mockGraphicsBeginPath = vi.fn();
const mockGraphicsMoveTo = vi.fn();
const mockGraphicsLineTo = vi.fn();
const mockGraphicsStrokePath = vi.fn();
const mockGraphicsDestroy = vi.fn();

function createMockGraphics() {
  return {
    clear: mockGraphicsClear,
    fillStyle: mockGraphicsFillStyle,
    fillRoundedRect: mockGraphicsFillRoundedRect,
    lineStyle: mockGraphicsLineStyle,
    beginPath: mockGraphicsBeginPath,
    moveTo: mockGraphicsMoveTo,
    lineTo: mockGraphicsLineTo,
    strokePath: mockGraphicsStrokePath,
    destroy: mockGraphicsDestroy,
  };
}

const mockEmitterDestroy = vi.fn();
const mockExplode = vi.fn();
const mockDelayedCall = vi.fn();
const mockTexturesExists = vi.fn().mockReturnValue(true);
const mockAddParticles = vi.fn(() => ({
  explode: mockExplode,
  destroy: mockEmitterDestroy,
}));

vi.mock("phaser", () => {
  class MockScene {
    scene = { start: vi.fn() };
    add = {
      graphics: vi.fn(() => createMockGraphics()),
      sprite: vi.fn(() => ({
        destroy: vi.fn(),
        setPosition: vi.fn(),
        x: 0,
        y: 0,
      })),
      particles: mockAddParticles,
    };
    input = {
      keyboard: { on: vi.fn() },
    };
    cameras = {
      main: { shake: vi.fn() },
    };
    textures = {
      exists: mockTexturesExists,
    };
    time = {
      delayedCall: mockDelayedCall,
    };
    constructor(public config?: { key: string }) {}
  }
  return {
    default: {
      Game: class {},
      Scene: MockScene,
      AUTO: 0,
      Scale: { FIT: 1, CENTER_BOTH: 1 },
    },
    Scene: MockScene,
  };
});

import Phaser from "phaser";
import {
  GhostRenderer,
  GHOST_BASE_ALPHA,
  GHOST_OUTLINE_WIDTH,
  GHOST_DASH_LENGTH,
  GHOST_DASH_GAP,
  GHOST_OUTLINE_COLOR,
  GHOST_FILL_COLOR,
  GHOST_TRAIL_PARTICLE_COUNT,
  GHOST_TRAIL_PARTICLE_LIFESPAN,
} from "@/game/systems/GhostRenderer";
import { EchoGhost } from "@/game/entities/EchoGhost";
import { TILE_SIZE, COLORS } from "@/game/config";
import type { GridPos } from "@/game/utils/grid";

// ── Helper ────────────────────────────────────────────────────────

function snap(...positions: [number, number][]): GridPos[] {
  return positions.map(([col, row]) => ({ col, row }));
}

function createScene(): Phaser.Scene {
  return new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
}

function makeActiveGhost(): EchoGhost {
  const ghost = new EchoGhost(100, 500, 20);
  const delayTicks = ghost.getDelayTicks(); // 5
  for (let i = 0; i < delayTicks + 3; i++) {
    ghost.recordTick(snap([i, 0]));
  }
  return ghost;
}

// ── Tests ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockTexturesExists.mockReturnValue(true);
});

describe("GhostRenderer", () => {
  describe("construction", () => {
    it("creates a Phaser Graphics object", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      expect(scene.add.graphics).toHaveBeenCalled();
      renderer.destroy();
    });
  });

  describe("render — inactive ghost", () => {
    it("clears graphics and does not draw when ghost is inactive", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = new EchoGhost();

      renderer.render(ghost, 16);

      // The internal graphics object's clear should have been called
      // We can verify no fill operations occurred after clearing
      expect(mockGraphicsFillStyle).not.toHaveBeenCalled();
      expect(mockGraphicsFillRoundedRect).not.toHaveBeenCalled();

      renderer.destroy();
    });
  });

  describe("render — active ghost", () => {
    it("draws filled rounded rects for each ghost segment", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();

      renderer.render(ghost, 16);

      // Should have drawn filled rounded rects for ghost segments
      expect(mockGraphicsFillStyle).toHaveBeenCalled();
      expect(mockGraphicsFillRoundedRect).toHaveBeenCalled();

      renderer.destroy();
    });

    it("uses 40% base alpha multiplied by trail opacity", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();

      renderer.render(ghost, 16);

      // Check that fillStyle was called with GHOST_FILL_COLOR and alpha <= GHOST_BASE_ALPHA
      const fillCalls = mockGraphicsFillStyle.mock.calls;
      for (const call of fillCalls) {
        expect(call[0]).toBe(GHOST_FILL_COLOR);
        expect(call[1]).toBeLessThanOrEqual(GHOST_BASE_ALPHA);
        expect(call[1]).toBeGreaterThan(0);
      }

      renderer.destroy();
    });

    it("draws dashed outlines using lineStyle and beginPath/strokePath", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();

      renderer.render(ghost, 16);

      // Dashed outline uses lineStyle with GHOST_OUTLINE_COLOR
      expect(mockGraphicsLineStyle).toHaveBeenCalled();
      const lineCalls = mockGraphicsLineStyle.mock.calls;
      for (const call of lineCalls) {
        expect(call[0]).toBe(GHOST_OUTLINE_WIDTH);
        expect(call[1]).toBe(GHOST_OUTLINE_COLOR);
      }

      // Dashed lines use beginPath/moveTo/lineTo/strokePath
      expect(mockGraphicsBeginPath).toHaveBeenCalled();
      expect(mockGraphicsMoveTo).toHaveBeenCalled();
      expect(mockGraphicsLineTo).toHaveBeenCalled();
      expect(mockGraphicsStrokePath).toHaveBeenCalled();

      renderer.destroy();
    });

    it("segment geometry matches snake body (inset 2px, radius 3)", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);

      // Single segment ghost for simpler verification
      const ghost = new EchoGhost(100, 500, 20);
      const delayTicks = ghost.getDelayTicks();
      for (let i = 0; i < delayTicks + 1; i++) {
        ghost.recordTick(snap([5, 5]));
      }

      renderer.render(ghost, 16);

      // fillRoundedRect should be called with width/height = TILE_SIZE - 4 and radius 3
      const rectCalls = mockGraphicsFillRoundedRect.mock.calls;
      expect(rectCalls.length).toBeGreaterThan(0);

      for (const call of rectCalls) {
        expect(call[2]).toBe(TILE_SIZE - 4); // width
        expect(call[3]).toBe(TILE_SIZE - 4); // height
        expect(call[4]).toBe(3); // border radius
      }

      renderer.destroy();
    });
  });

  describe("render — fading out ghost", () => {
    it("reduces alpha during fade-out", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();

      ghost.stopRecording();
      // Advance fade partially
      ghost.advanceFadeOut();
      ghost.advanceFadeOut();

      renderer.render(ghost, 16);

      // Check that the maximum alpha is less than GHOST_BASE_ALPHA
      // (due to the global fade multiplier)
      const fillCalls = mockGraphicsFillStyle.mock.calls;
      expect(fillCalls.length).toBeGreaterThan(0);
      for (const call of fillCalls) {
        expect(call[1]).toBeLessThan(GHOST_BASE_ALPHA);
      }

      renderer.destroy();
    });

    it("draws nothing when ghost is expired", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();

      ghost.stopRecording();
      // Expire the ghost
      for (let i = 0; i < ghost.getTrailWindow(); i++) {
        ghost.advanceFadeOut();
      }

      mockGraphicsFillStyle.mockClear();
      renderer.render(ghost, 16);

      expect(mockGraphicsFillStyle).not.toHaveBeenCalled();

      renderer.destroy();
    });
  });

  describe("trailing particles", () => {
    it("emits trailing particles at the ghost tail position", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();

      // First render with enough delta to trigger particle emit
      renderer.render(ghost, 200);

      expect(mockAddParticles).toHaveBeenCalled();
      expect(mockExplode).toHaveBeenCalledWith(GHOST_TRAIL_PARTICLE_COUNT, 0, 0);

      renderer.destroy();
    });

    it("throttles particle emission", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();

      // First render — should emit
      renderer.render(ghost, 200);
      const firstCallCount = mockAddParticles.mock.calls.length;

      // Second render with small delta — should NOT emit
      renderer.render(ghost, 10);
      expect(mockAddParticles.mock.calls.length).toBe(firstCallCount);

      renderer.destroy();
    });

    it("schedules particle emitter cleanup after lifespan", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();

      renderer.render(ghost, 200);

      expect(mockDelayedCall).toHaveBeenCalledWith(
        GHOST_TRAIL_PARTICLE_LIFESPAN + 50,
        expect.any(Function),
      );

      renderer.destroy();
    });

    it("does not emit particles when particle texture is missing", () => {
      mockTexturesExists.mockReturnValue(false);
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();

      renderer.render(ghost, 200);

      expect(mockAddParticles).not.toHaveBeenCalled();

      renderer.destroy();
    });

    it("does not emit particles when ghost is inactive", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = new EchoGhost();

      renderer.render(ghost, 200);

      expect(mockAddParticles).not.toHaveBeenCalled();

      renderer.destroy();
    });
  });

  describe("destroy", () => {
    it("destroys the internal graphics object", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);

      renderer.destroy();

      expect(mockGraphicsDestroy).toHaveBeenCalled();
    });
  });
});

// ── Rendering configuration constants ───────────────────────────

describe("GhostRenderer rendering constants", () => {
  it("ghost base alpha is 0.4 (40% opacity)", () => {
    expect(GHOST_BASE_ALPHA).toBe(0.4);
  });

  it("ghost outline color matches snake body color", () => {
    expect(GHOST_OUTLINE_COLOR).toBe(COLORS.SNAKE_BODY);
  });

  it("ghost fill color matches snake body color", () => {
    expect(GHOST_FILL_COLOR).toBe(COLORS.SNAKE_BODY);
  });

  it("dash length and gap are positive", () => {
    expect(GHOST_DASH_LENGTH).toBeGreaterThan(0);
    expect(GHOST_DASH_GAP).toBeGreaterThan(0);
  });

  it("outline width is positive", () => {
    expect(GHOST_OUTLINE_WIDTH).toBeGreaterThan(0);
  });

  it("trailing particle count is reasonable (1-10)", () => {
    expect(GHOST_TRAIL_PARTICLE_COUNT).toBeGreaterThanOrEqual(1);
    expect(GHOST_TRAIL_PARTICLE_COUNT).toBeLessThanOrEqual(10);
  });

  it("trailing particle lifespan is reasonable (100-600 ms)", () => {
    expect(GHOST_TRAIL_PARTICLE_LIFESPAN).toBeGreaterThanOrEqual(100);
    expect(GHOST_TRAIL_PARTICLE_LIFESPAN).toBeLessThanOrEqual(600);
  });
});

// ── Source file integration checks ──────────────────────────────

describe("GhostRenderer source integration", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/game/systems/GhostRenderer.ts"),
    "utf-8",
  );

  it("imports TILE_SIZE from config", () => {
    expect(source).toContain("TILE_SIZE");
    expect(source).toContain("config");
  });

  it("imports gridToPixel from grid utils", () => {
    expect(source).toContain("gridToPixel");
    expect(source).toContain("utils/grid");
  });

  it("imports EchoGhost types", () => {
    expect(source).toContain("EchoGhost");
    expect(source).toContain("GhostTrailEntry");
  });

  it("uses TEXTURE_KEYS.PARTICLE for trailing particles", () => {
    expect(source).toContain("TEXTURE_KEYS.PARTICLE");
  });

  it("guards against missing particle texture", () => {
    expect(source).toContain("textures.exists");
  });

  it("schedules cleanup of trailing particle emitter", () => {
    expect(source).toContain("delayedCall");
    expect(source).toContain("destroy");
  });

  it("exports GhostRenderer class", () => {
    expect(source).toMatch(/export\s+class\s+GhostRenderer/);
  });
});

describe("MainScene integrates GhostRenderer", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/game/scenes/MainScene.ts"),
    "utf-8",
  );

  it("imports GhostRenderer from systems module", () => {
    expect(source).toContain("GhostRenderer");
    expect(source).toContain("systems/GhostRenderer");
  });

  it("creates GhostRenderer when entities are created", () => {
    expect(source).toContain("new GhostRenderer(this)");
  });

  it("calls ghostRenderer.render in update loop", () => {
    expect(source).toContain("this.ghostRenderer.render(this.ghost");
  });

  it("destroys ghostRenderer when entities are destroyed", () => {
    expect(source).toContain("this.ghostRenderer.destroy()");
  });

  it("renders ghost every frame (before step check)", () => {
    // Ghost render should happen before the stepped check for smooth visuals
    const renderIndex = source.indexOf("ghostRenderer.render");
    const steppedIndex = source.indexOf("const stepped = this.snake.update");
    expect(renderIndex).toBeGreaterThan(-1);
    expect(steppedIndex).toBeGreaterThan(-1);
    expect(renderIndex).toBeLessThan(steppedIndex);
  });
});
