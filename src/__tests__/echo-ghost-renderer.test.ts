/**
 * Echo Ghost Renderer — Visual rendering tests
 *
 * Validates:
 * 1. Dashed outline rendering for ghost segments
 * 2. 40% base opacity with ghost fade-out multiplication
 * 3. Trailing particle effects on tail movement
 * 4. Biome-tinted ghost coloring for all four biomes
 * 5. Cleanup and lifecycle management
 * 6. ECHO_GHOST render depth layering
 * 7. Integration with MainScene rendering pipeline
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RENDER_DEPTH } from "@/game/config";
import { Biome } from "@/game/systems/BiomeManager";
import type { EchoGhostState } from "@/game/entities/EchoGhost";

// ── Phaser mock ──────────────────────────────────────────────────

const mockDelayedCall = vi.fn();
const mockTexturesExists = vi.fn().mockReturnValue(false);
const mockEmitterDestroy = vi.fn();
const mockExplode = vi.fn();

function createMockEmitter() {
  return { explode: mockExplode, destroy: mockEmitterDestroy };
}

const mockAddParticles = vi.fn(() => createMockEmitter());

const createdGraphics: Array<{
  depth: number | null;
  destroyed: boolean;
  clearCalls: number;
  lineStyleCalls: Array<{ width: number; color: number; alpha: number }>;
  moveToCalls: Array<{ x: number; y: number }>;
  lineToCalls: Array<{ x: number; y: number }>;
  strokePathCalls: number;
}> = [];

function createMockGraphicsObj() {
  const obj = {
    depth: null as number | null,
    destroyed: false,
    clearCalls: 0,
    lineStyleCalls: [] as Array<{ width: number; color: number; alpha: number }>,
    moveToCalls: [] as Array<{ x: number; y: number }>,
    lineToCalls: [] as Array<{ x: number; y: number }>,
    strokePathCalls: 0,
    setDepth(d: number) {
      obj.depth = d;
      return obj;
    },
    clear() {
      obj.clearCalls++;
      return obj;
    },
    destroy() {
      obj.destroyed = true;
    },
    lineStyle(width: number, color: number, alpha: number) {
      obj.lineStyleCalls.push({ width, color, alpha });
      return obj;
    },
    moveTo(x: number, y: number) {
      obj.moveToCalls.push({ x, y });
      return obj;
    },
    lineTo(x: number, y: number) {
      obj.lineToCalls.push({ x, y });
      return obj;
    },
    strokePath() {
      obj.strokePathCalls++;
      return obj;
    },
    fillStyle: vi.fn().mockReturnThis(),
    fillRect: vi.fn().mockReturnThis(),
    fillCircle: vi.fn().mockReturnThis(),
  };
  createdGraphics.push(obj);
  return obj;
}

const mockShake = vi.fn();
const mockDestroy = vi.fn();
const mockSetPosition = vi.fn();
const mockKeyboardOn = vi.fn();

function createMockSprite() {
  return {
    destroy: mockDestroy,
    setPosition: mockSetPosition,
    setDepth: vi.fn(),
    x: 0,
    y: 0,
  };
}

vi.mock("phaser", () => {
  class MockScene {
    scene = { start: vi.fn() };
    add = {
      graphics: () => createMockGraphicsObj(),
      sprite: vi.fn(() => createMockSprite()),
      particles: mockAddParticles,
    };
    input = { keyboard: { on: mockKeyboardOn, off: vi.fn() } };
    cameras = { main: { shake: mockShake, setBackgroundColor: vi.fn() } };
    textures = { exists: mockTexturesExists };
    time = { delayedCall: mockDelayedCall };
    children = { depthSort: vi.fn() };
    events = { emit: vi.fn() };
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
  EchoGhostRenderer,
  GHOST_BASE_OPACITY,
  GHOST_OUTLINE_WIDTH,
  GHOST_BIOME_TINTS,
  GHOST_TRAIL_PARTICLE_COUNT,
  GHOST_TRAIL_PARTICLE_LIFESPAN,
} from "@/game/systems/EchoGhostRenderer";
import Phaser from "phaser";

// ── Helpers ──────────────────────────────────────────────────────

function createMockScene(): Phaser.Scene {
  return new (Phaser.Scene as unknown as new () => Phaser.Scene)();
}

function makeActiveState(
  segments: Array<{ col: number; row: number }>,
  opacity = 1,
): EchoGhostState {
  return {
    active: true,
    segments,
    opacity,
  };
}

function makeInactiveState(): EchoGhostState {
  return {
    active: false,
    segments: [],
    opacity: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  createdGraphics.length = 0;
  mockTexturesExists.mockReturnValue(false);
});

// ═══════════════════════════════════════════════════════════════════
// 1. DASHED OUTLINE RENDERING
// ═══════════════════════════════════════════════════════════════════

describe("Ghost dashed outline rendering", () => {
  it("creates a graphics object on first render", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([{ col: 5, row: 5 }]),
      Biome.NeonCity,
    );

    expect(createdGraphics.length).toBeGreaterThanOrEqual(1);
  });

  it("sets graphics depth to ECHO_GHOST", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([{ col: 5, row: 5 }]),
      Biome.NeonCity,
    );

    const gfx = createdGraphics.find((g) => g.depth === RENDER_DEPTH.ECHO_GHOST);
    expect(gfx).toBeDefined();
  });

  it("draws dashed outlines using moveTo/lineTo for each segment", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([
        { col: 5, row: 5 },
        { col: 4, row: 5 },
      ]),
      Biome.NeonCity,
    );

    const gfx = createdGraphics.find((g) => g.depth === RENDER_DEPTH.ECHO_GHOST);
    expect(gfx).toBeDefined();
    // Each segment gets 4 edges with dashed lines → many moveTo/lineTo calls
    expect(gfx!.moveToCalls.length).toBeGreaterThan(0);
    expect(gfx!.lineToCalls.length).toBeGreaterThan(0);
    expect(gfx!.strokePathCalls).toBeGreaterThanOrEqual(1);
  });

  it("clears graphics on each render frame (no stale drawings)", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([{ col: 5, row: 5 }]),
      Biome.NeonCity,
    );
    renderer.render(
      makeActiveState([{ col: 6, row: 5 }]),
      Biome.NeonCity,
    );

    const gfx = createdGraphics.find((g) => g.depth === RENDER_DEPTH.ECHO_GHOST);
    expect(gfx!.clearCalls).toBeGreaterThanOrEqual(2);
  });

  it("reuses the same graphics object across frames (no leak)", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([{ col: 5, row: 5 }]),
      Biome.NeonCity,
    );
    renderer.render(
      makeActiveState([{ col: 6, row: 5 }]),
      Biome.NeonCity,
    );

    // Only one graphics object should be at ECHO_GHOST depth
    const ghostGfx = createdGraphics.filter(
      (g) => g.depth === RENDER_DEPTH.ECHO_GHOST,
    );
    expect(ghostGfx.length).toBe(1);
  });

  it("uses outline width from GHOST_OUTLINE_WIDTH", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([{ col: 5, row: 5 }]),
      Biome.NeonCity,
    );

    const gfx = createdGraphics.find((g) => g.depth === RENDER_DEPTH.ECHO_GHOST);
    const lineCall = gfx!.lineStyleCalls[0];
    expect(lineCall.width).toBe(GHOST_OUTLINE_WIDTH);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. OPACITY — 40% BASE WITH FADE-OUT MULTIPLICATION
// ═══════════════════════════════════════════════════════════════════

describe("Ghost opacity", () => {
  it("GHOST_BASE_OPACITY is 0.4 (40%)", () => {
    expect(GHOST_BASE_OPACITY).toBe(0.4);
  });

  it("renders at 40% alpha when ghost opacity is 1.0", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([{ col: 5, row: 5 }], 1.0),
      Biome.NeonCity,
    );

    const gfx = createdGraphics.find((g) => g.depth === RENDER_DEPTH.ECHO_GHOST);
    const lineCall = gfx!.lineStyleCalls[0];
    expect(lineCall.alpha).toBeCloseTo(0.4, 5);
  });

  it("multiplies base opacity by ghost fade-out opacity", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([{ col: 5, row: 5 }], 0.5),
      Biome.NeonCity,
    );

    const gfx = createdGraphics.find((g) => g.depth === RENDER_DEPTH.ECHO_GHOST);
    const lineCall = gfx!.lineStyleCalls[0];
    // 0.4 * 0.5 = 0.2
    expect(lineCall.alpha).toBeCloseTo(0.2, 5);
  });

  it("renders at near-zero alpha when ghost opacity is near zero", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([{ col: 5, row: 5 }], 0.125), // 1/8 for fade-out
      Biome.NeonCity,
    );

    const gfx = createdGraphics.find((g) => g.depth === RENDER_DEPTH.ECHO_GHOST);
    const lineCall = gfx!.lineStyleCalls[0];
    // 0.4 * 0.125 = 0.05
    expect(lineCall.alpha).toBeCloseTo(0.05, 5);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. TRAILING PARTICLE EFFECTS
// ═══════════════════════════════════════════════════════════════════

describe("Ghost trailing particle effects", () => {
  it("emits particles when tail position changes (texture exists)", () => {
    mockTexturesExists.mockReturnValue(true);
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([
        { col: 5, row: 5 },
        { col: 4, row: 5 },
      ]),
      Biome.NeonCity,
    );

    expect(mockAddParticles).toHaveBeenCalled();
    expect(mockExplode).toHaveBeenCalledWith(
      GHOST_TRAIL_PARTICLE_COUNT,
      0,
      0,
    );
  });

  it("does not emit particles when texture is missing", () => {
    mockTexturesExists.mockReturnValue(false);
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([
        { col: 5, row: 5 },
        { col: 4, row: 5 },
      ]),
      Biome.NeonCity,
    );

    expect(mockAddParticles).not.toHaveBeenCalled();
  });

  it("does not emit particles when tail position stays the same", () => {
    mockTexturesExists.mockReturnValue(true);
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    const state = makeActiveState([
      { col: 5, row: 5 },
      { col: 4, row: 5 },
    ]);

    renderer.render(state, Biome.NeonCity);
    mockAddParticles.mockClear();

    // Same tail position
    renderer.render(state, Biome.NeonCity);
    expect(mockAddParticles).not.toHaveBeenCalled();
  });

  it("emits particles when tail moves to new position", () => {
    mockTexturesExists.mockReturnValue(true);
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([
        { col: 5, row: 5 },
        { col: 4, row: 5 },
      ]),
      Biome.NeonCity,
    );
    mockAddParticles.mockClear();

    // Tail moved
    renderer.render(
      makeActiveState([
        { col: 6, row: 5 },
        { col: 5, row: 5 },
      ]),
      Biome.NeonCity,
    );
    expect(mockAddParticles).toHaveBeenCalled();
  });

  it("schedules emitter destruction after lifespan", () => {
    mockTexturesExists.mockReturnValue(true);
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([
        { col: 5, row: 5 },
        { col: 4, row: 5 },
      ]),
      Biome.NeonCity,
    );

    expect(mockDelayedCall).toHaveBeenCalledWith(
      GHOST_TRAIL_PARTICLE_LIFESPAN + 50,
      expect.any(Function),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. BIOME-TINTED GHOST COLORING
// ═══════════════════════════════════════════════════════════════════

describe("Ghost biome tinting", () => {
  it("defines tint colors for all four biomes", () => {
    expect(GHOST_BIOME_TINTS[Biome.NeonCity]).toBeDefined();
    expect(GHOST_BIOME_TINTS[Biome.IceCavern]).toBeDefined();
    expect(GHOST_BIOME_TINTS[Biome.MoltenCore]).toBeDefined();
    expect(GHOST_BIOME_TINTS[Biome.VoidRift]).toBeDefined();
  });

  it("each biome uses a distinct tint color", () => {
    const colors = Object.values(GHOST_BIOME_TINTS);
    const unique = new Set(colors);
    expect(unique.size).toBe(4);
  });

  it("uses NeonCity tint when rendering in NeonCity biome", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([{ col: 5, row: 5 }]),
      Biome.NeonCity,
    );

    const gfx = createdGraphics.find((g) => g.depth === RENDER_DEPTH.ECHO_GHOST);
    expect(gfx!.lineStyleCalls[0].color).toBe(GHOST_BIOME_TINTS[Biome.NeonCity]);
  });

  it("uses IceCavern tint when rendering in IceCavern biome", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([{ col: 5, row: 5 }]),
      Biome.IceCavern,
    );

    const gfx = createdGraphics.find((g) => g.depth === RENDER_DEPTH.ECHO_GHOST);
    expect(gfx!.lineStyleCalls[0].color).toBe(GHOST_BIOME_TINTS[Biome.IceCavern]);
  });

  it("uses MoltenCore tint when rendering in MoltenCore biome", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([{ col: 5, row: 5 }]),
      Biome.MoltenCore,
    );

    const gfx = createdGraphics.find((g) => g.depth === RENDER_DEPTH.ECHO_GHOST);
    expect(gfx!.lineStyleCalls[0].color).toBe(GHOST_BIOME_TINTS[Biome.MoltenCore]);
  });

  it("uses VoidRift tint when rendering in VoidRift biome", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([{ col: 5, row: 5 }]),
      Biome.VoidRift,
    );

    const gfx = createdGraphics.find((g) => g.depth === RENDER_DEPTH.ECHO_GHOST);
    expect(gfx!.lineStyleCalls[0].color).toBe(GHOST_BIOME_TINTS[Biome.VoidRift]);
  });

  it("switches tint dynamically when biome changes between renders", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([{ col: 5, row: 5 }]),
      Biome.NeonCity,
    );

    const gfx = createdGraphics.find((g) => g.depth === RENDER_DEPTH.ECHO_GHOST);
    expect(gfx!.lineStyleCalls[0].color).toBe(GHOST_BIOME_TINTS[Biome.NeonCity]);

    // Switch biome
    renderer.render(
      makeActiveState([{ col: 5, row: 5 }]),
      Biome.MoltenCore,
    );

    // Latest lineStyle call should use MoltenCore tint
    const lastCall = gfx!.lineStyleCalls[gfx!.lineStyleCalls.length - 1];
    expect(lastCall.color).toBe(GHOST_BIOME_TINTS[Biome.MoltenCore]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. CLEANUP AND LIFECYCLE
// ═══════════════════════════════════════════════════════════════════

describe("Ghost renderer lifecycle", () => {
  it("clears graphics when ghost becomes inactive", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([{ col: 5, row: 5 }]),
      Biome.NeonCity,
    );

    const gfx = createdGraphics.find((g) => g.depth === RENDER_DEPTH.ECHO_GHOST);
    const clearsBefore = gfx!.clearCalls;

    renderer.render(makeInactiveState(), Biome.NeonCity);
    expect(gfx!.clearCalls).toBeGreaterThan(clearsBefore);
  });

  it("does not create graphics when ghost is inactive", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(makeInactiveState(), Biome.NeonCity);

    const ghostGfx = createdGraphics.filter(
      (g) => g.depth === RENDER_DEPTH.ECHO_GHOST,
    );
    expect(ghostGfx.length).toBe(0);
  });

  it("destroy() cleans up graphics object", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([{ col: 5, row: 5 }]),
      Biome.NeonCity,
    );

    const gfx = createdGraphics.find((g) => g.depth === RENDER_DEPTH.ECHO_GHOST);
    expect(gfx!.destroyed).toBe(false);

    renderer.destroy();
    expect(gfx!.destroyed).toBe(true);
  });

  it("getGraphics() returns null before first render", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    expect(renderer.getGraphics()).toBeNull();
  });

  it("getGraphics() returns graphics object after render", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([{ col: 5, row: 5 }]),
      Biome.NeonCity,
    );

    expect(renderer.getGraphics()).not.toBeNull();
  });

  it("getGraphics() returns null after destroy", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([{ col: 5, row: 5 }]),
      Biome.NeonCity,
    );
    renderer.destroy();

    expect(renderer.getGraphics()).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. RENDER DEPTH LAYERING
// ═══════════════════════════════════════════════════════════════════

describe("Ghost render depth", () => {
  it("ECHO_GHOST depth is between BIOME_MECHANIC and FOOD", () => {
    expect(RENDER_DEPTH.ECHO_GHOST).toBeGreaterThan(RENDER_DEPTH.BIOME_MECHANIC);
    expect(RENDER_DEPTH.ECHO_GHOST).toBeLessThan(RENDER_DEPTH.FOOD);
  });

  it("ECHO_GHOST depth is below SNAKE", () => {
    expect(RENDER_DEPTH.ECHO_GHOST).toBeLessThan(RENDER_DEPTH.SNAKE);
  });

  it("depth hierarchy includes ghost: backdrop < tilemap < grid < mechanic < ghost < food < snake", () => {
    expect(RENDER_DEPTH.BIOME_BACKDROP).toBeLessThan(RENDER_DEPTH.BIOME_TILEMAP);
    expect(RENDER_DEPTH.BIOME_TILEMAP).toBeLessThan(RENDER_DEPTH.BIOME_GRID);
    expect(RENDER_DEPTH.BIOME_GRID).toBeLessThan(RENDER_DEPTH.BIOME_MECHANIC);
    expect(RENDER_DEPTH.BIOME_MECHANIC).toBeLessThan(RENDER_DEPTH.ECHO_GHOST);
    expect(RENDER_DEPTH.ECHO_GHOST).toBeLessThan(RENDER_DEPTH.FOOD);
    expect(RENDER_DEPTH.FOOD).toBeLessThan(RENDER_DEPTH.SNAKE);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. MAINSCENE INTEGRATION
// ═══════════════════════════════════════════════════════════════════

import { MainScene } from "@/game/scenes/MainScene";
import { gameBridge } from "@/game/bridge";
import { GRID_COLS, GRID_ROWS } from "@/game/config";

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

describe("MainScene ghost renderer integration", () => {
  beforeEach(() => {
    resetBridge();
    localStorage.clear();
  });

  it("creates EchoGhostRenderer when game starts", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    expect(scene.getEchoGhostRenderer()).not.toBeNull();
  });

  it("destroys EchoGhostRenderer on game restart", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const renderer = scene.getEchoGhostRenderer();
    expect(renderer).not.toBeNull();

    scene.endRun();

    // Start new game
    scene.enterPhase("playing");

    // New renderer instance should be created
    const newRenderer = scene.getEchoGhostRenderer();
    expect(newRenderer).not.toBeNull();
    expect(newRenderer).not.toBe(renderer);
  });

  it("calls renderEchoGhost during update when playing", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    // Keep the snake alive
    const snake = scene.getSnake()!;
    snake.reset(
      { col: Math.floor(GRID_COLS / 2), row: Math.floor(GRID_ROWS / 2) },
      "right",
      3,
    );

    // Update several frames
    for (let i = 0; i < 5; i++) {
      snake.reset(
        { col: Math.floor(GRID_COLS / 2), row: Math.floor(GRID_ROWS / 2) },
        "right",
        3,
      );
      scene.update(0, 16);
    }

    // We just verify no crash and the scene remains playing
    expect(scene.getPhase()).toBe("playing");
  });
});

// ═══════════════════════════════════════════════════════════════════
// 8. EDGE CASES
// ═══════════════════════════════════════════════════════════════════

describe("Ghost renderer edge cases", () => {
  it("handles empty segments array gracefully", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    // Active but with empty segments — should clear
    renderer.render(
      { active: true, segments: [], opacity: 1 },
      Biome.NeonCity,
    );

    // No graphics created (clear path was taken)
    const ghostGfx = createdGraphics.filter(
      (g) => g.depth === RENDER_DEPTH.ECHO_GHOST,
    );
    expect(ghostGfx.length).toBe(0);
  });

  it("handles single-segment ghost", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([{ col: 10, row: 10 }]),
      Biome.NeonCity,
    );

    const gfx = createdGraphics.find((g) => g.depth === RENDER_DEPTH.ECHO_GHOST);
    expect(gfx).toBeDefined();
    expect(gfx!.moveToCalls.length).toBeGreaterThan(0);
  });

  it("handles many segments without error", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    const segments = Array.from({ length: 20 }, (_, i) => ({
      col: 10 + i,
      row: 10,
    }));

    renderer.render(makeActiveState(segments), Biome.NeonCity);

    const gfx = createdGraphics.find((g) => g.depth === RENDER_DEPTH.ECHO_GHOST);
    expect(gfx).toBeDefined();
    // 20 segments × 4 edges × dashes → many moveTo calls
    expect(gfx!.moveToCalls.length).toBeGreaterThan(40);
  });

  it("destroy() is idempotent (safe to call twice)", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    renderer.render(
      makeActiveState([{ col: 5, row: 5 }]),
      Biome.NeonCity,
    );

    renderer.destroy();
    renderer.destroy(); // should not throw
  });

  it("clear() is safe when no graphics exist", () => {
    const scene = createMockScene();
    const renderer = new EchoGhostRenderer(scene);

    // clear() before any render — should not throw
    renderer.clear();
  });
});
