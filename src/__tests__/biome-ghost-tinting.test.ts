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
  GHOST_FILL_COLOR,
  GHOST_OUTLINE_COLOR,
} from "@/game/systems/GhostRenderer";
import { EchoGhost } from "@/game/entities/EchoGhost";
import {
  Biome,
  BiomeColorManager,
  BIOME_COLORS,
  BIOME_DURATION_MS,
  BIOME_TRANSITION_DURATION_MS,
  lerpColor,
  getBiomeColors,
  type BiomeColorProvider,
} from "@/game/systems/BiomeTheme";
import type { GridPos } from "@/game/utils/grid";

// ── Helpers ──────────────────────────────────────────────────────

function snap(...positions: [number, number][]): GridPos[] {
  return positions.map(([col, row]) => ({ col, row }));
}

function createScene(): Phaser.Scene {
  return new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
}

function makeActiveGhost(): EchoGhost {
  const ghost = new EchoGhost(100, 500, 20);
  const delayTicks = ghost.getDelayTicks();
  for (let i = 0; i < delayTicks + 3; i++) {
    ghost.recordTick(snap([i, 0]));
  }
  return ghost;
}

// ── Tests ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockTexturesExists.mockReturnValue(true);
});

// ── lerpColor utility ────────────────────────────────────────────

describe("lerpColor", () => {
  it("returns start color at t=0", () => {
    expect(lerpColor(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
  });

  it("returns end color at t=1", () => {
    expect(lerpColor(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
  });

  it("returns midpoint at t=0.5", () => {
    const mid = lerpColor(0x000000, 0xffffff, 0.5);
    const r = (mid >> 16) & 0xff;
    const g = (mid >> 8) & 0xff;
    const b = mid & 0xff;
    // Should be approximately 128 for each channel
    expect(r).toBeGreaterThanOrEqual(127);
    expect(r).toBeLessThanOrEqual(128);
    expect(g).toBeGreaterThanOrEqual(127);
    expect(g).toBeLessThanOrEqual(128);
    expect(b).toBeGreaterThanOrEqual(127);
    expect(b).toBeLessThanOrEqual(128);
  });

  it("clamps t below 0 to 0", () => {
    expect(lerpColor(0xff0000, 0x0000ff, -1)).toBe(0xff0000);
  });

  it("clamps t above 1 to 1", () => {
    expect(lerpColor(0xff0000, 0x0000ff, 2)).toBe(0x0000ff);
  });

  it("interpolates each channel independently", () => {
    // Red: 0x80 → 0x40, Green: 0x00 → 0xFF, Blue: 0xFF → 0x00
    const result = lerpColor(0x8000ff, 0x40ff00, 0.5);
    const r = (result >> 16) & 0xff;
    const g = (result >> 8) & 0xff;
    const b = result & 0xff;
    expect(r).toBe(0x60); // midpoint of 0x80 and 0x40
    expect(g).toBeGreaterThanOrEqual(127);
    expect(g).toBeLessThanOrEqual(128);
    expect(b).toBeGreaterThanOrEqual(127);
    expect(b).toBeLessThanOrEqual(128);
  });
});

// ── BiomeColorManager ─────────────────────────────────────────────────

describe("BiomeColorManager", () => {
  it("starts in NeonCity biome", () => {
    const mgr = new BiomeColorManager();
    mgr.start();
    expect(mgr.getCurrentBiome()).toBe(Biome.NeonCity);
  });

  it("transitions to IceCavern after BIOME_DURATION_MS", () => {
    const mgr = new BiomeColorManager();
    mgr.start();
    mgr.update(BIOME_DURATION_MS);
    expect(mgr.getCurrentBiome()).toBe(Biome.IceCavern);
  });

  it("cycles through all biomes in order", () => {
    const mgr = new BiomeColorManager();
    mgr.start();
    const visited: Biome[] = [mgr.getCurrentBiome()];
    for (let i = 0; i < 3; i++) {
      mgr.update(BIOME_DURATION_MS);
      visited.push(mgr.getCurrentBiome());
    }
    expect(visited).toEqual([
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.MoltenCore,
      Biome.VoidRift,
    ]);
  });

  it("wraps around to NeonCity after VoidRift", () => {
    const mgr = new BiomeColorManager();
    mgr.start();
    mgr.update(BIOME_DURATION_MS * 4);
    expect(mgr.getCurrentBiome()).toBe(Biome.NeonCity);
  });

  it("emits change event on biome transition", () => {
    const mgr = new BiomeColorManager();
    const listener = vi.fn();
    mgr.onChange(listener);
    mgr.start();
    mgr.update(BIOME_DURATION_MS);
    expect(listener).toHaveBeenCalledWith(Biome.IceCavern, Biome.NeonCity);
  });

  it("can unsubscribe from change events", () => {
    const mgr = new BiomeColorManager();
    const listener = vi.fn();
    mgr.onChange(listener);
    mgr.offChange(listener);
    mgr.start();
    mgr.update(BIOME_DURATION_MS);
    expect(listener).not.toHaveBeenCalled();
  });

  it("does not advance when not running", () => {
    const mgr = new BiomeColorManager();
    mgr.update(BIOME_DURATION_MS);
    expect(mgr.getCurrentBiome()).toBe(Biome.NeonCity);
  });

  it("resets to initial state", () => {
    const mgr = new BiomeColorManager();
    mgr.start();
    mgr.update(BIOME_DURATION_MS);
    mgr.reset();
    expect(mgr.getCurrentBiome()).toBe(Biome.NeonCity);
    expect(mgr.isRunning()).toBe(false);
  });

  describe("BiomeColorProvider implementation", () => {
    it("returns NeonCity snakeBody color when settled", () => {
      const mgr = new BiomeColorManager();
      mgr.start();
      expect(mgr.getGhostBodyColor()).toBe(BIOME_COLORS[Biome.NeonCity].snakeBody);
    });

    it("returns NeonCity particle color when settled", () => {
      const mgr = new BiomeColorManager();
      mgr.start();
      expect(mgr.getGhostParticleColor()).toBe(BIOME_COLORS[Biome.NeonCity].particle);
    });

    it("returns IceCavern colors after full transition", () => {
      const mgr = new BiomeColorManager();
      mgr.start();
      // Trigger transition
      mgr.update(BIOME_DURATION_MS);
      // Complete the transition crossfade
      mgr.update(BIOME_TRANSITION_DURATION_MS);
      expect(mgr.getGhostBodyColor()).toBe(BIOME_COLORS[Biome.IceCavern].snakeBody);
      expect(mgr.getGhostParticleColor()).toBe(BIOME_COLORS[Biome.IceCavern].particle);
    });

    it("returns interpolated color during transition", () => {
      const mgr = new BiomeColorManager();
      mgr.start();
      // Trigger biome change
      mgr.update(BIOME_DURATION_MS);
      // Advance halfway through transition
      mgr.update(BIOME_TRANSITION_DURATION_MS / 2);

      const bodyColor = mgr.getGhostBodyColor();
      const neonBody = BIOME_COLORS[Biome.NeonCity].snakeBody;
      const iceBody = BIOME_COLORS[Biome.IceCavern].snakeBody;

      // Should be neither fully NeonCity nor fully IceCavern
      expect(bodyColor).not.toBe(neonBody);
      expect(bodyColor).not.toBe(iceBody);
    });

    it("transition progress goes from 0 to 1", () => {
      const mgr = new BiomeColorManager();
      mgr.start();

      // Before transition, should be settled
      expect(mgr.getTransitionProgress()).toBe(1);
      expect(mgr.isTransitioning()).toBe(false);

      // Trigger transition
      mgr.update(BIOME_DURATION_MS);
      expect(mgr.getTransitionProgress()).toBe(0);
      expect(mgr.isTransitioning()).toBe(true);

      // Halfway through
      mgr.update(BIOME_TRANSITION_DURATION_MS / 2);
      expect(mgr.getTransitionProgress()).toBeCloseTo(0.5, 1);
      expect(mgr.isTransitioning()).toBe(true);

      // Fully settled
      mgr.update(BIOME_TRANSITION_DURATION_MS);
      expect(mgr.getTransitionProgress()).toBe(1);
      expect(mgr.isTransitioning()).toBe(false);
    });
  });
});

// ── getBiomeColors ───────────────────────────────────────────────

describe("getBiomeColors", () => {
  it("returns correct palette for each biome", () => {
    for (const biome of Object.values(Biome)) {
      const colors = getBiomeColors(biome);
      expect(colors.snakeBody).toBeTypeOf("number");
      expect(colors.particle).toBeTypeOf("number");
    }
  });

  it("NeonCity snakeBody matches existing COLORS.SNAKE_BODY", () => {
    const colors = getBiomeColors(Biome.NeonCity);
    expect(colors.snakeBody).toBe(0x00c8d4);
  });
});

// ── GhostRenderer biome-aware tinting ────────────────────────────

describe("GhostRenderer biome-aware tinting", () => {
  describe("without biome provider (backward compatible)", () => {
    it("uses static GHOST_FILL_COLOR for trail fill", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();

      renderer.render(ghost, 16);

      const fillCalls = mockGraphicsFillStyle.mock.calls;
      for (const call of fillCalls) {
        expect(call[0]).toBe(GHOST_FILL_COLOR);
      }
      renderer.destroy();
    });

    it("uses static GHOST_OUTLINE_COLOR for trail outline", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();

      renderer.render(ghost, 16);

      const lineCalls = mockGraphicsLineStyle.mock.calls;
      for (const call of lineCalls) {
        expect(call[1]).toBe(GHOST_OUTLINE_COLOR);
      }
      renderer.destroy();
    });

    it("uses static GHOST_OUTLINE_COLOR for particle tint", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();

      renderer.render(ghost, 200); // enough delta to trigger emit

      const particleCalls = mockAddParticles.mock.calls;
      expect(particleCalls.length).toBeGreaterThan(0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = (particleCalls[0] as any)[3] as Record<string, unknown>;
      expect(config.tint).toBe(GHOST_OUTLINE_COLOR);
      renderer.destroy();
    });
  });

  describe("with biome provider", () => {
    function createMockProvider(bodyColor: number, particleColor: number): BiomeColorProvider {
      return {
        getGhostBodyColor: () => bodyColor,
        getGhostParticleColor: () => particleColor,
      };
    }

    it("uses biome body color for trail fill", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();
      renderer.setBiomeColorProvider(createMockProvider(0xff0000, 0x00ff00));

      renderer.render(ghost, 16);

      const fillCalls = mockGraphicsFillStyle.mock.calls;
      for (const call of fillCalls) {
        expect(call[0]).toBe(0xff0000);
      }
      renderer.destroy();
    });

    it("uses biome body color for trail outline", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();
      renderer.setBiomeColorProvider(createMockProvider(0xff0000, 0x00ff00));

      renderer.render(ghost, 16);

      const lineCalls = mockGraphicsLineStyle.mock.calls;
      for (const call of lineCalls) {
        expect(call[1]).toBe(0xff0000);
      }
      renderer.destroy();
    });

    it("uses biome particle color for trailing particle tint", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();
      renderer.setBiomeColorProvider(createMockProvider(0xff0000, 0x00ff00));

      renderer.render(ghost, 200);

      const particleCalls = mockAddParticles.mock.calls;
      expect(particleCalls.length).toBeGreaterThan(0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = (particleCalls[0] as any)[3] as Record<string, unknown>;
      expect(config.tint).toBe(0x00ff00);
      renderer.destroy();
    });

    it("preserves 40% base alpha with biome tinting", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();
      renderer.setBiomeColorProvider(createMockProvider(0xff0000, 0x00ff00));

      renderer.render(ghost, 16);

      const fillCalls = mockGraphicsFillStyle.mock.calls;
      for (const call of fillCalls) {
        expect(call[1]).toBeLessThanOrEqual(GHOST_BASE_ALPHA);
        expect(call[1]).toBeGreaterThan(0);
      }
      renderer.destroy();
    });

    it("preserves dashed outline styling with biome tinting", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();
      renderer.setBiomeColorProvider(createMockProvider(0xff0000, 0x00ff00));

      renderer.render(ghost, 16);

      expect(mockGraphicsBeginPath).toHaveBeenCalled();
      expect(mockGraphicsMoveTo).toHaveBeenCalled();
      expect(mockGraphicsLineTo).toHaveBeenCalled();
      expect(mockGraphicsStrokePath).toHaveBeenCalled();
      renderer.destroy();
    });

    it("can revert to static colors by setting provider to null", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();

      renderer.setBiomeColorProvider(createMockProvider(0xff0000, 0x00ff00));
      renderer.setBiomeColorProvider(null);

      renderer.render(ghost, 16);

      const fillCalls = mockGraphicsFillStyle.mock.calls;
      for (const call of fillCalls) {
        expect(call[0]).toBe(GHOST_FILL_COLOR);
      }
      renderer.destroy();
    });

    it("queries biome colors each frame for real-time updates", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();

      let color = 0xff0000;
      const provider: BiomeColorProvider = {
        getGhostBodyColor: () => color,
        getGhostParticleColor: () => color,
      };
      renderer.setBiomeColorProvider(provider);

      // First render uses red
      renderer.render(ghost, 16);
      expect(mockGraphicsFillStyle.mock.calls[0][0]).toBe(0xff0000);

      // Change color dynamically
      color = 0x0000ff;
      mockGraphicsFillStyle.mockClear();

      renderer.render(ghost, 16);
      expect(mockGraphicsFillStyle.mock.calls[0][0]).toBe(0x0000ff);

      renderer.destroy();
    });
  });

  describe("BiomeColorManager as color provider with GhostRenderer", () => {
    it("uses NeonCity colors at start", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();
      const mgr = new BiomeColorManager();
      mgr.start();
      renderer.setBiomeColorProvider(mgr);

      renderer.render(ghost, 16);

      const fillCalls = mockGraphicsFillStyle.mock.calls;
      expect(fillCalls[0][0]).toBe(BIOME_COLORS[Biome.NeonCity].snakeBody);
      renderer.destroy();
    });

    it("uses IceCavern colors after full biome transition", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();
      const mgr = new BiomeColorManager();
      mgr.start();
      renderer.setBiomeColorProvider(mgr);

      // Trigger biome change then complete the crossfade
      mgr.update(BIOME_DURATION_MS);
      mgr.update(BIOME_TRANSITION_DURATION_MS);

      mockGraphicsFillStyle.mockClear();
      renderer.render(ghost, 16);

      const fillCalls = mockGraphicsFillStyle.mock.calls;
      expect(fillCalls[0][0]).toBe(BIOME_COLORS[Biome.IceCavern].snakeBody);
      renderer.destroy();
    });

    it("smoothly transitions ghost colors during biome change", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();
      const mgr = new BiomeColorManager();
      mgr.start();
      renderer.setBiomeColorProvider(mgr);

      // Trigger the biome change
      mgr.update(BIOME_DURATION_MS);
      // Halfway through the transition
      mgr.update(BIOME_TRANSITION_DURATION_MS / 2);

      mockGraphicsFillStyle.mockClear();
      renderer.render(ghost, 16);

      const fillColor = mockGraphicsFillStyle.mock.calls[0][0];
      const neonBody = BIOME_COLORS[Biome.NeonCity].snakeBody;
      const iceBody = BIOME_COLORS[Biome.IceCavern].snakeBody;

      // Color should be interpolated (not exactly either biome)
      expect(fillColor).not.toBe(neonBody);
      expect(fillColor).not.toBe(iceBody);
      renderer.destroy();
    });

    it("all four biomes produce distinct ghost body colors", () => {
      const colors = Object.values(Biome).map(
        (b) => BIOME_COLORS[b].snakeBody,
      );
      const unique = new Set(colors);
      expect(unique.size).toBe(4);
    });

    it("all four biomes produce distinct ghost particle colors", () => {
      const colors = Object.values(Biome).map(
        (b) => BIOME_COLORS[b].particle,
      );
      const unique = new Set(colors);
      expect(unique.size).toBe(4);
    });
  });
});

// ── Source integration checks ────────────────────────────────────

describe("Biome ghost tinting source integration", () => {
  const ghostRendererSource = fs.readFileSync(
    path.join(ROOT, "src/game/systems/GhostRenderer.ts"),
    "utf-8",
  );

  const mainSceneSource = fs.readFileSync(
    path.join(ROOT, "src/game/scenes/MainScene.ts"),
    "utf-8",
  );

  const biomeThemeSource = fs.readFileSync(
    path.join(ROOT, "src/game/systems/BiomeTheme.ts"),
    "utf-8",
  );

  it("GhostRenderer imports BiomeColorProvider", () => {
    expect(ghostRendererSource).toContain("BiomeColorProvider");
    expect(ghostRendererSource).toContain("BiomeTheme");
  });

  it("GhostRenderer has setBiomeColorProvider method", () => {
    expect(ghostRendererSource).toContain("setBiomeColorProvider");
  });

  it("GhostRenderer queries biome colors in drawTrail", () => {
    expect(ghostRendererSource).toContain("getGhostBodyColor");
  });

  it("GhostRenderer queries biome particle color for trailing particles", () => {
    expect(ghostRendererSource).toContain("getGhostParticleColor");
  });

  it("MainScene imports BiomeColorManager", () => {
    expect(mainSceneSource).toContain("BiomeColorManager");
    expect(mainSceneSource).toContain("BiomeTheme");
  });

  it("MainScene creates BiomeColorManager in createEntities", () => {
    expect(mainSceneSource).toContain("new BiomeColorManager()");
  });

  it("MainScene sets biome color provider on ghost renderer", () => {
    expect(mainSceneSource).toContain("setBiomeColorProvider");
  });

  it("MainScene updates biome manager every frame", () => {
    expect(mainSceneSource).toContain("this.biomeManager.update(delta)");
  });

  it("MainScene resets biome manager on entity destruction", () => {
    expect(mainSceneSource).toContain("this.biomeManager.reset()");
  });

  it("BiomeTheme exports Biome enum with four values", () => {
    expect(biomeThemeSource).toContain("NeonCity");
    expect(biomeThemeSource).toContain("IceCavern");
    expect(biomeThemeSource).toContain("MoltenCore");
    expect(biomeThemeSource).toContain("VoidRift");
  });

  it("BiomeTheme exports BiomeColorProvider interface", () => {
    expect(biomeThemeSource).toContain("BiomeColorProvider");
    expect(biomeThemeSource).toContain("getGhostBodyColor");
    expect(biomeThemeSource).toContain("getGhostParticleColor");
  });

  it("BiomeTheme exports lerpColor for smooth transitions", () => {
    expect(biomeThemeSource).toContain("lerpColor");
  });

  it("BiomeColorManager implements BiomeColorProvider", () => {
    expect(biomeThemeSource).toContain("implements BiomeColorProvider");
  });

  it("BiomeColorManager uses lerpColor during transitions", () => {
    expect(biomeThemeSource).toContain("lerpColor(");
  });

  it("BiomeTheme has transition duration constant", () => {
    expect(biomeThemeSource).toContain("BIOME_TRANSITION_DURATION_MS");
  });
});
