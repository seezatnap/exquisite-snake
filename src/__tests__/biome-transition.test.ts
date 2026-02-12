import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");

// ── Phaser mock ──────────────────────────────────────────────────

const mockShake = vi.fn();
const mockSetAlpha = vi.fn();
const mockSetVisible = vi.fn();
const mockSetDepth = vi.fn();
const mockGfxClear = vi.fn();
const mockGfxFillStyle = vi.fn();
const mockGfxFillRect = vi.fn();
const mockGfxDestroy = vi.fn();

function createMockGraphics() {
  return {
    setAlpha: mockSetAlpha,
    setVisible: mockSetVisible,
    setDepth: mockSetDepth,
    clear: mockGfxClear,
    fillStyle: mockGfxFillStyle,
    fillRect: mockGfxFillRect,
    destroy: mockGfxDestroy,
    scene: true, // truthy — indicates graphics object is still attached
    lineStyle: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    strokePath: vi.fn(),
  };
}

const mockAddGraphics = vi.fn(() => createMockGraphics());

vi.mock("phaser", () => {
  class MockScene {
    scene = { start: vi.fn() };
    add = {
      graphics: mockAddGraphics,
      sprite: vi.fn(() => ({
        destroy: vi.fn(),
        setPosition: vi.fn(),
        setTexture: vi.fn(),
        x: 0,
        y: 0,
      })),
      particles: vi.fn(() => ({
        explode: vi.fn(),
        destroy: vi.fn(),
      })),
    };
    input = {
      keyboard: { on: vi.fn(), off: vi.fn() },
    };
    cameras = {
      main: {
        shake: mockShake,
        setBackgroundColor: vi.fn(),
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

// Import after mock
import Phaser from "phaser";
import {
  BiomeTransition,
  TRANSITION_DURATION_MS,
  TRANSITION_MIDPOINT,
  TRANSITION_PEAK_ALPHA,
  TRANSITION_SHAKE_DURATION,
  TRANSITION_SHAKE_INTENSITY,
} from "@/game/systems/BiomeTransition";
import { ARENA_WIDTH, ARENA_HEIGHT } from "@/game/config";

function createScene(): Phaser.Scene {
  return new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── BiomeTransition unit tests ──────────────────────────────────

describe("BiomeTransition", () => {
  it("starts inactive", () => {
    const t = new BiomeTransition();
    expect(t.isActive()).toBe(false);
  });

  it("becomes active after start()", () => {
    const t = new BiomeTransition();
    t.init(createScene());
    t.start(0x000000, vi.fn());
    expect(t.isActive()).toBe(true);
  });

  it("does not start without init()", () => {
    const t = new BiomeTransition();
    // No init() call
    t.start(0x000000, vi.fn());
    expect(t.isActive()).toBe(false);
  });

  it("creates overlay graphics on first start", () => {
    const t = new BiomeTransition();
    const scene = createScene();
    t.init(scene);

    mockAddGraphics.mockClear();
    t.start(0xff0000, vi.fn());

    // One call from init's scene, plus our start
    expect(mockAddGraphics).toHaveBeenCalled();
    expect(mockSetDepth).toHaveBeenCalledWith(1000); // OVERLAY_DEPTH
  });

  it("fills overlay with the specified colour", () => {
    const t = new BiomeTransition();
    t.init(createScene());

    mockGfxFillStyle.mockClear();
    mockGfxFillRect.mockClear();
    t.start(0xff6600, vi.fn());

    expect(mockGfxFillStyle).toHaveBeenCalledWith(0xff6600, 1);
    expect(mockGfxFillRect).toHaveBeenCalledWith(
      0,
      0,
      ARENA_WIDTH,
      ARENA_HEIGHT,
    );
  });

  it("sets overlay alpha to 0 on start", () => {
    const t = new BiomeTransition();
    t.init(createScene());
    t.start(0x000000, vi.fn());

    expect(mockSetAlpha).toHaveBeenCalledWith(0);
  });
});

// ── Update / progress ───────────────────────────────────────────

describe("BiomeTransition – update progress", () => {
  it("does nothing when not active", () => {
    const t = new BiomeTransition();
    t.init(createScene());
    const cb = vi.fn();

    // Not started — update should be a no-op
    t.update(100);
    expect(cb).not.toHaveBeenCalled();
  });

  it("increases overlay alpha during first half", () => {
    const t = new BiomeTransition();
    t.init(createScene());
    t.start(0x000000, vi.fn());

    mockSetAlpha.mockClear();
    // Advance to 25% of transition
    const quarterDuration = TRANSITION_DURATION_MS * 0.25;
    t.update(quarterDuration);

    // Alpha should be ~half of peak (since we're at 50% of the midpoint)
    const expectedAlpha = (0.25 / TRANSITION_MIDPOINT) * TRANSITION_PEAK_ALPHA;
    const lastAlphaCall =
      mockSetAlpha.mock.calls[mockSetAlpha.mock.calls.length - 1][0];
    expect(lastAlphaCall).toBeCloseTo(expectedAlpha, 2);
  });

  it("decreases overlay alpha during second half", () => {
    const t = new BiomeTransition();
    t.init(createScene());
    t.start(0x000000, vi.fn());

    mockSetAlpha.mockClear();
    // Advance to 75% of transition (past midpoint, fading out)
    const threequarterDuration = TRANSITION_DURATION_MS * 0.75;
    t.update(threequarterDuration);

    const fadeOutProgress =
      (0.75 - TRANSITION_MIDPOINT) / (1 - TRANSITION_MIDPOINT);
    const expectedAlpha = (1 - fadeOutProgress) * TRANSITION_PEAK_ALPHA;
    const lastAlphaCall =
      mockSetAlpha.mock.calls[mockSetAlpha.mock.calls.length - 1][0];
    expect(lastAlphaCall).toBeCloseTo(expectedAlpha, 2);
  });

  it("fires swap callback at midpoint", () => {
    const t = new BiomeTransition();
    t.init(createScene());
    const cb = vi.fn();
    t.start(0x000000, cb);

    // Advance just past midpoint
    const midpointMs = TRANSITION_DURATION_MS * TRANSITION_MIDPOINT + 1;
    t.update(midpointMs);

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("does not fire swap callback before midpoint", () => {
    const t = new BiomeTransition();
    t.init(createScene());
    const cb = vi.fn();
    t.start(0x000000, cb);

    // Advance to just before midpoint
    const beforeMidpoint = TRANSITION_DURATION_MS * TRANSITION_MIDPOINT - 10;
    t.update(beforeMidpoint);

    expect(cb).not.toHaveBeenCalled();
  });

  it("fires swap callback only once even with multiple updates", () => {
    const t = new BiomeTransition();
    t.init(createScene());
    const cb = vi.fn();
    t.start(0x000000, cb);

    // Two updates past midpoint
    t.update(TRANSITION_DURATION_MS * 0.6);
    t.update(TRANSITION_DURATION_MS * 0.2);

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("triggers screen-shake at midpoint", () => {
    const t = new BiomeTransition();
    t.init(createScene());
    t.start(0x000000, vi.fn());

    mockShake.mockClear();
    t.update(TRANSITION_DURATION_MS * TRANSITION_MIDPOINT + 1);

    expect(mockShake).toHaveBeenCalledWith(
      TRANSITION_SHAKE_DURATION,
      TRANSITION_SHAKE_INTENSITY,
      true, // force flag
    );
  });

  it("becomes inactive after full duration", () => {
    const t = new BiomeTransition();
    t.init(createScene());
    t.start(0x000000, vi.fn());

    t.update(TRANSITION_DURATION_MS);

    expect(t.isActive()).toBe(false);
  });

  it("hides overlay after completion", () => {
    const t = new BiomeTransition();
    t.init(createScene());
    t.start(0x000000, vi.fn());

    t.update(TRANSITION_DURATION_MS);

    expect(mockSetVisible).toHaveBeenCalledWith(false);
  });
});

// ── finishImmediate ─────────────────────────────────────────────

describe("BiomeTransition – finishImmediate", () => {
  it("fires swap callback if not yet fired", () => {
    const t = new BiomeTransition();
    t.init(createScene());
    const cb = vi.fn();
    t.start(0x000000, cb);

    // Advance only slightly (not past midpoint)
    t.update(10);
    expect(cb).not.toHaveBeenCalled();

    t.finishImmediate();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(t.isActive()).toBe(false);
  });

  it("does not re-fire swap callback if already fired", () => {
    const t = new BiomeTransition();
    t.init(createScene());
    const cb = vi.fn();
    t.start(0x000000, cb);

    // Past midpoint — callback fires
    t.update(TRANSITION_DURATION_MS * 0.6);
    expect(cb).toHaveBeenCalledTimes(1);

    // finishImmediate should not re-fire
    t.finishImmediate();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when not active", () => {
    const t = new BiomeTransition();
    t.init(createScene());

    expect(() => t.finishImmediate()).not.toThrow();
    expect(t.isActive()).toBe(false);
  });
});

// ── destroy ─────────────────────────────────────────────────────

describe("BiomeTransition – destroy", () => {
  it("destroys the overlay graphics", () => {
    const t = new BiomeTransition();
    t.init(createScene());
    t.start(0x000000, vi.fn());

    mockGfxDestroy.mockClear();
    t.destroy();

    expect(mockGfxDestroy).toHaveBeenCalled();
    expect(t.isActive()).toBe(false);
  });

  it("is safe to call multiple times", () => {
    const t = new BiomeTransition();
    t.init(createScene());
    t.start(0x000000, vi.fn());

    expect(() => {
      t.destroy();
      t.destroy();
    }).not.toThrow();
  });
});

// ── Rapid re-start ──────────────────────────────────────────────

describe("BiomeTransition – rapid re-start", () => {
  it("fast-forwards previous transition when start() is called during active transition", () => {
    const t = new BiomeTransition();
    t.init(createScene());
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    t.start(0xff0000, cb1);
    t.update(10); // only 10ms in — cb1 not yet fired

    // Re-start with new callback
    t.start(0x0000ff, cb2);

    // cb1 should have been fast-forwarded (fired by finishImmediate)
    expect(cb1).toHaveBeenCalledTimes(1);
    // cb2 not yet fired (transition just started)
    expect(cb2).not.toHaveBeenCalled();
    expect(t.isActive()).toBe(true);
  });
});

// ── Configuration constants ─────────────────────────────────────

describe("BiomeTransition – configuration constants", () => {
  it("transition duration is reasonable (300–1500 ms)", () => {
    expect(TRANSITION_DURATION_MS).toBeGreaterThanOrEqual(300);
    expect(TRANSITION_DURATION_MS).toBeLessThanOrEqual(1500);
  });

  it("midpoint is between 0.3 and 0.7", () => {
    expect(TRANSITION_MIDPOINT).toBeGreaterThanOrEqual(0.3);
    expect(TRANSITION_MIDPOINT).toBeLessThanOrEqual(0.7);
  });

  it("peak alpha is between 0.3 and 0.8", () => {
    expect(TRANSITION_PEAK_ALPHA).toBeGreaterThanOrEqual(0.3);
    expect(TRANSITION_PEAK_ALPHA).toBeLessThanOrEqual(0.8);
  });

  it("shake duration is brief (50–300 ms)", () => {
    expect(TRANSITION_SHAKE_DURATION).toBeGreaterThanOrEqual(50);
    expect(TRANSITION_SHAKE_DURATION).toBeLessThanOrEqual(300);
  });

  it("shake intensity is subtle (< 0.02)", () => {
    expect(TRANSITION_SHAKE_INTENSITY).toBeGreaterThan(0);
    expect(TRANSITION_SHAKE_INTENSITY).toBeLessThan(0.02);
  });
});

// ── No gameplay desync ──────────────────────────────────────────

describe("BiomeTransition – no gameplay desync", () => {
  it("game loop continues running during transition (update does not block)", () => {
    const t = new BiomeTransition();
    t.init(createScene());
    t.start(0x000000, vi.fn());

    // Simulate game loop frames during transition
    let frameCount = 0;
    const frameTime = 16.67; // ~60fps
    while (t.isActive()) {
      t.update(frameTime);
      frameCount++;
      if (frameCount > 1000) break; // safety valve
    }

    // Should have processed multiple frames during the transition
    expect(frameCount).toBeGreaterThan(1);
    expect(frameCount).toBeLessThan(1000);
  });
});

// ── MainScene integration (source-level checks) ─────────────────

describe("MainScene integrates BiomeTransition", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/game/scenes/MainScene.ts"),
    "utf-8",
  );

  it("imports BiomeTransition from systems", () => {
    expect(source).toContain("BiomeTransition");
    expect(source).toContain("systems/BiomeTransition");
  });

  it("initializes biomeTransition in create()", () => {
    expect(source).toContain("biomeTransition.init(this)");
  });

  it("starts transition with old biome background on biome change", () => {
    expect(source).toContain("biomeTransition.start(");
    expect(source).toContain("oldTheme.colors.background");
  });

  it("calls applyBiomeTheme inside the swap callback", () => {
    // The swap callback should contain applyBiomeTheme
    // Both the start call and the applyBiomeTheme should be near each other
    const startIdx = source.indexOf("biomeTransition.start(");
    const applyIdx = source.indexOf("applyBiomeTheme(newBiome)", startIdx);
    expect(startIdx).toBeGreaterThan(-1);
    expect(applyIdx).toBeGreaterThan(startIdx);
    // They should be within ~200 characters of each other (same block)
    expect(applyIdx - startIdx).toBeLessThan(200);
  });

  it("applies first biome directly without transition", () => {
    // When previousBiome is null, apply immediately
    expect(source).toContain("previousBiome !== null");
  });

  it("updates transition in the game loop", () => {
    expect(source).toContain("biomeTransition.update(delta)");
  });

  it("finishes transition on endRun to prevent overlay lingering", () => {
    expect(source).toContain("biomeTransition.finishImmediate()");
  });

  it("destroys transition on shutdown", () => {
    expect(source).toContain("biomeTransition.destroy()");
  });

  it("exposes getBiomeTransition() accessor", () => {
    expect(source).toContain("getBiomeTransition()");
  });
});

// ── BiomeTransition source file checks ──────────────────────────

describe("BiomeTransition.ts source file", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/game/systems/BiomeTransition.ts"),
    "utf-8",
  );

  it("exports BiomeTransition class", () => {
    expect(source).toMatch(/export\s+class\s+BiomeTransition/);
  });

  it("exports transition configuration constants", () => {
    expect(source).toContain("TRANSITION_DURATION_MS");
    expect(source).toContain("TRANSITION_MIDPOINT");
    expect(source).toContain("TRANSITION_PEAK_ALPHA");
    expect(source).toContain("TRANSITION_SHAKE_DURATION");
    expect(source).toContain("TRANSITION_SHAKE_INTENSITY");
  });

  it("imports ARENA dimensions from config", () => {
    expect(source).toContain("ARENA_WIDTH");
    expect(source).toContain("ARENA_HEIGHT");
  });

  it("implements dissolve effect via alpha ramping", () => {
    // Should compute alpha based on progress
    expect(source).toContain("setAlpha");
    expect(source).toContain("TRANSITION_PEAK_ALPHA");
  });

  it("implements screen-shake at midpoint", () => {
    expect(source).toContain("shake(");
    expect(source).toContain("TRANSITION_SHAKE_DURATION");
    expect(source).toContain("TRANSITION_SHAKE_INTENSITY");
  });

  it("renders overlay at high depth to cover game elements", () => {
    expect(source).toContain("setDepth");
  });
});
