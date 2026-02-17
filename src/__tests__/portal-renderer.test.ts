import { describe, it, expect, vi, beforeEach } from "vitest";
import { PortalPair } from "@/game/entities/Portal";
import {
  PortalRenderer,
  VORTEX_SPIN_SPEED,
  VORTEX_ARM_COUNT,
  VORTEX_ARM_SEGMENTS,
  GLOW_RING_COUNT,
  PORTAL_COLOR_A,
  PORTAL_COLOR_B,
  PORTAL_CORE_COLOR,
  DISTORTION_RADIUS,
  DISTORTION_INTENSITY,
  DISTORTION_ALPHA,
} from "@/game/systems/PortalRenderer";
import { RENDER_DEPTH, TILE_SIZE } from "@/game/config";
import { gridToPixel } from "@/game/utils/grid";

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

const mockAddGraphics = vi.fn(() => createFreshGraphicsMock());

function createMockScene() {
  return {
    add: {
      graphics: mockAddGraphics,
    },
  } as unknown as import("phaser").Scene;
}

// ── Test helpers ─────────────────────────────────────────────────

function createPair(
  overrides: Partial<{
    id: string;
    posA: { col: number; row: number };
    posB: { col: number; row: number };
    lifespanMs: number;
    spawnDurationMs: number;
    collapseDurationMs: number;
  }> = {},
): PortalPair {
  return new PortalPair({
    id: overrides.id ?? "test-pair-1",
    positionA: overrides.posA ?? { col: 5, row: 5 },
    positionB: overrides.posB ?? { col: 20, row: 15 },
    lifespanMs: overrides.lifespanMs ?? 8000,
    spawnDurationMs: overrides.spawnDurationMs ?? 500,
    collapseDurationMs: overrides.collapseDurationMs ?? 500,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── PortalRenderer unit tests ────────────────────────────────────

describe("PortalRenderer", () => {
  describe("construction and reset", () => {
    it("initializes with zero spin angle", () => {
      const renderer = new PortalRenderer();
      expect(renderer.getSpinAngle()).toBe(0);
    });

    it("reset clears spin angle and destroys graphics", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({ spawnDurationMs: 0 });
      pair.update(1); // advance to active

      renderer.update(scene, 1000, [pair]);
      expect(renderer.getSpinAngle()).toBeGreaterThan(0);

      renderer.reset();
      expect(renderer.getSpinAngle()).toBe(0);
    });
  });

  describe("spin angle accumulation", () => {
    it("advances spin angle based on delta time", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({ spawnDurationMs: 0 });
      pair.update(1);

      renderer.update(scene, 1000, [pair]);
      const expectedAngle = (1000 / 1000) * VORTEX_SPIN_SPEED;
      expect(renderer.getSpinAngle()).toBeCloseTo(expectedAngle, 5);
    });

    it("wraps spin angle at 2π", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({ spawnDurationMs: 0 });
      pair.update(1);

      // Advance long enough to exceed 2π
      const duration = ((Math.PI * 2) / VORTEX_SPIN_SPEED) * 1000 + 100;
      renderer.update(scene, duration, [pair]);
      expect(renderer.getSpinAngle()).toBeLessThan(Math.PI * 2);
      expect(renderer.getSpinAngle()).toBeGreaterThanOrEqual(0);
    });

    it("accumulates spin angle across multiple frames", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({ spawnDurationMs: 0 });
      pair.update(1);

      renderer.update(scene, 100, [pair]);
      const after100 = renderer.getSpinAngle();
      renderer.update(scene, 100, [pair]);
      const after200 = renderer.getSpinAngle();

      expect(after200).toBeCloseTo(after100 * 2, 5);
    });

    it("handles zero delta without changing spin angle", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      renderer.update(scene, 0, []);
      expect(renderer.getSpinAngle()).toBe(0);
    });

    it("handles negative delta safely", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      renderer.update(scene, -100, []);
      expect(renderer.getSpinAngle()).toBe(0);
    });

    it("handles NaN delta safely", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      renderer.update(scene, NaN, []);
      expect(renderer.getSpinAngle()).toBe(0);
    });
  });

  describe("graphics lifecycle", () => {
    it("creates graphics object on first update with active pairs", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({ spawnDurationMs: 0 });
      pair.update(1);

      renderer.update(scene, 16, [pair]);
      expect(mockAddGraphics).toHaveBeenCalledTimes(1);
    });

    it("sets render depth to RENDER_DEPTH.PORTAL", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({ spawnDurationMs: 0 });
      pair.update(1);

      renderer.update(scene, 16, [pair]);
      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      expect(graphicsInstance.setDepth).toHaveBeenCalledWith(RENDER_DEPTH.PORTAL);
    });

    it("does not create graphics when pairs array is empty", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();

      renderer.update(scene, 16, []);
      expect(mockAddGraphics).not.toHaveBeenCalled();
    });

    it("clears graphics each frame before redrawing", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({ spawnDurationMs: 0 });
      pair.update(1);

      renderer.update(scene, 16, [pair]);
      renderer.update(scene, 16, [pair]);

      // clear should be called on each update
      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      expect(graphicsInstance.clear).toHaveBeenCalledTimes(2);
    });

    it("destroy() destroys the graphics object", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({ spawnDurationMs: 0 });
      pair.update(1);

      renderer.update(scene, 16, [pair]);
      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;

      renderer.destroy();
      expect(graphicsInstance.destroy).toHaveBeenCalled();
    });
  });

  describe("vortex drawing for active pairs", () => {
    it("draws both ends of a portal pair", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({
        posA: { col: 5, row: 5 },
        posB: { col: 20, row: 15 },
        spawnDurationMs: 0,
      });
      pair.update(1);

      renderer.update(scene, 16, [pair]);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;

      // Should have drawn spiral arms (moveTo/lineTo calls)
      expect(graphicsInstance.moveTo.mock.calls.length).toBeGreaterThan(0);
      expect(graphicsInstance.lineTo.mock.calls.length).toBeGreaterThan(0);

      // Should have drawn glow rings (strokeCircle)
      expect(graphicsInstance.strokeCircle.mock.calls.length).toBe(
        GLOW_RING_COUNT * 2, // 2 ends
      );

      // Should have drawn cores (fillCircle) - 2 circles per end (outer + inner core)
      expect(graphicsInstance.fillCircle.mock.calls.length).toBe(4); // 2 ends × 2 circles
    });

    it("draws spiral arms with correct moveTo/lineTo pattern", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({ spawnDurationMs: 0 });
      pair.update(1);

      renderer.update(scene, 16, [pair]);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;

      // Each portal end: VORTEX_ARM_COUNT arms, each arm starts with moveTo
      // then has VORTEX_ARM_SEGMENTS lineTo calls.
      // 2 ends × VORTEX_ARM_COUNT moveTo calls for spiral arms
      const expectedMoveToForSpirals = 2 * VORTEX_ARM_COUNT;
      expect(graphicsInstance.moveTo.mock.calls.length).toBe(
        expectedMoveToForSpirals,
      );

      // 2 ends × VORTEX_ARM_COUNT arms × VORTEX_ARM_SEGMENTS lineTo per arm
      const expectedLineTo = 2 * VORTEX_ARM_COUNT * VORTEX_ARM_SEGMENTS;
      expect(graphicsInstance.lineTo.mock.calls.length).toBe(expectedLineTo);
    });

    it("uses end A color for the first portal end", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({ spawnDurationMs: 0 });
      pair.update(1);

      renderer.update(scene, 16, [pair]);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      const lineStyleCalls = graphicsInstance.lineStyle.mock.calls;

      // First lineStyle call should use PORTAL_COLOR_A (for glow ring of end A)
      expect(lineStyleCalls[0][1]).toBe(PORTAL_COLOR_A);
    });

    it("uses end B color for the second portal end", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({ spawnDurationMs: 0 });
      pair.update(1);

      renderer.update(scene, 16, [pair]);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      const fillStyleCalls = graphicsInstance.fillStyle.mock.calls;

      // Filter to only core fillStyle calls (those NOT followed by fillRect).
      // Core calls use fillCircle; distortion calls use fillRect.
      // Since each fillCircle is preceded by a fillStyle, find the last N fillStyle
      // calls matching the number of fillCircle calls.
      const fillCircleCount = graphicsInstance.fillCircle.mock.calls.length;
      const coreFillStyleCalls = fillStyleCalls.slice(-fillCircleCount);

      // End A outer core uses PORTAL_COLOR_A
      expect(coreFillStyleCalls[0][0]).toBe(PORTAL_COLOR_A);
      // End A inner core uses PORTAL_CORE_COLOR
      expect(coreFillStyleCalls[1][0]).toBe(PORTAL_CORE_COLOR);
      // End B outer core uses PORTAL_COLOR_B
      expect(coreFillStyleCalls[2][0]).toBe(PORTAL_COLOR_B);
      // End B inner core uses PORTAL_CORE_COLOR
      expect(coreFillStyleCalls[3][0]).toBe(PORTAL_CORE_COLOR);
    });

    it("draws at correct pixel positions for both ends", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const posA = { col: 5, row: 5 };
      const posB = { col: 20, row: 15 };
      const pair = createPair({ posA, posB, spawnDurationMs: 0 });
      pair.update(1);

      renderer.update(scene, 16, [pair]);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      const strokeCircleCalls = graphicsInstance.strokeCircle.mock.calls;

      const pixelA = gridToPixel(posA);
      const pixelB = gridToPixel(posB);

      // First GLOW_RING_COUNT strokeCircle calls are for end A
      for (let i = 0; i < GLOW_RING_COUNT; i++) {
        expect(strokeCircleCalls[i][0]).toBe(pixelA.x);
        expect(strokeCircleCalls[i][1]).toBe(pixelA.y);
      }

      // Next GLOW_RING_COUNT strokeCircle calls are for end B
      for (let i = 0; i < GLOW_RING_COUNT; i++) {
        expect(strokeCircleCalls[GLOW_RING_COUNT + i][0]).toBe(pixelB.x);
        expect(strokeCircleCalls[GLOW_RING_COUNT + i][1]).toBe(pixelB.y);
      }
    });
  });

  describe("spawn animation (visibility fade-in)", () => {
    it("draws with reduced alpha during spawning at 50% progress", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({ spawnDurationMs: 500 });
      pair.update(250); // 50% through spawning

      renderer.update(scene, 16, [pair]);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      const fillStyleCalls = graphicsInstance.fillStyle.mock.calls;
      const fillCircleCount = graphicsInstance.fillCircle.mock.calls.length;
      const coreFillStyleCalls = fillStyleCalls.slice(-fillCircleCount);

      // At 50% spawn progress, visibility is 0.5
      // Core outer: alpha = 0.5 * 0.6 = 0.3
      expect(coreFillStyleCalls[0][1]).toBeCloseTo(0.3, 1);
    });

    it("draws at zero visibility at the very start of spawning", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({ spawnDurationMs: 500 });
      // Don't advance at all — progress is 0

      renderer.update(scene, 16, [pair]);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      // With visibility 0, no drawing should occur
      expect(graphicsInstance.fillCircle.mock.calls.length).toBe(0);
    });

    it("draws with full alpha once active", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({ spawnDurationMs: 500 });
      pair.update(600); // Past spawn duration, now active

      renderer.update(scene, 16, [pair]);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      const fillStyleCalls = graphicsInstance.fillStyle.mock.calls;
      const fillCircleCount = graphicsInstance.fillCircle.mock.calls.length;
      const coreFillStyleCalls = fillStyleCalls.slice(-fillCircleCount);

      // At full visibility (1.0), core outer alpha = 1.0 * 0.6 = 0.6
      expect(coreFillStyleCalls[0][1]).toBeCloseTo(0.6, 1);
    });
  });

  describe("collapse animation (visibility fade-out)", () => {
    it("draws with reducing alpha during collapsing", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({
        spawnDurationMs: 0,
        lifespanMs: 100,
        collapseDurationMs: 500,
      });
      pair.update(1); // instant active
      pair.update(200); // past lifespan, now collapsing

      renderer.update(scene, 16, [pair]);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      expect(graphicsInstance.fillCircle.mock.calls.length).toBeGreaterThan(0);
    });

    it("does not draw fully collapsed pairs", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({
        spawnDurationMs: 0,
        lifespanMs: 100,
        collapseDurationMs: 100,
      });
      pair.update(1); // active
      pair.update(200); // collapsing
      pair.update(200); // collapsed

      renderer.update(scene, 16, [pair]);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      // Collapsed pairs are skipped — no fill calls
      expect(graphicsInstance.fillCircle.mock.calls.length).toBe(0);
    });

    it("draws with decreasing visibility as collapse progresses", () => {
      // Create two identical pairs for comparison
      const pair25 = createPair({
        id: "p25",
        spawnDurationMs: 0,
        lifespanMs: 100,
        collapseDurationMs: 400,
      });
      pair25.update(1);
      pair25.update(100); // Now collapsing
      pair25.update(100); // 100/400 = 25% collapse → visibility 0.75

      const pair75 = createPair({
        id: "p75",
        spawnDurationMs: 0,
        lifespanMs: 100,
        collapseDurationMs: 400,
      });
      pair75.update(1);
      pair75.update(100); // Now collapsing
      pair75.update(300); // 300/400 = 75% collapse → visibility 0.25

      const scene1 = createMockScene();
      const renderer1 = new PortalRenderer();
      renderer1.update(scene1, 16, [pair25]);
      const gfx25 = mockAddGraphics.mock.results[mockAddGraphics.mock.results.length - 1]?.value;
      const alpha25 = gfx25.fillStyle.mock.calls[0]?.[1] ?? 0;

      vi.clearAllMocks();

      const scene2 = createMockScene();
      const renderer2 = new PortalRenderer();
      renderer2.update(scene2, 16, [pair75]);
      const gfx75 = mockAddGraphics.mock.results[mockAddGraphics.mock.results.length - 1]?.value;
      const alpha75 = gfx75.fillStyle.mock.calls[0]?.[1] ?? 0;

      // 25% collapsed should have higher alpha than 75% collapsed
      expect(alpha25).toBeGreaterThan(alpha75);
    });
  });

  describe("multiple pairs", () => {
    it("draws both pairs independently", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair1 = createPair({
        id: "pair-1",
        posA: { col: 1, row: 1 },
        posB: { col: 10, row: 10 },
        spawnDurationMs: 0,
      });
      const pair2 = createPair({
        id: "pair-2",
        posA: { col: 2, row: 2 },
        posB: { col: 12, row: 12 },
        spawnDurationMs: 0,
      });
      pair1.update(1);
      pair2.update(1);

      renderer.update(scene, 16, [pair1, pair2]);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      // 4 ends total → 4 × 2 fillCircle calls (core outer + inner per end)
      expect(graphicsInstance.fillCircle.mock.calls.length).toBe(8);
      // 4 ends × GLOW_RING_COUNT strokeCircle
      expect(graphicsInstance.strokeCircle.mock.calls.length).toBe(
        4 * GLOW_RING_COUNT,
      );
    });
  });

  describe("spawn/despawn lifecycle hooks", () => {
    it("fires onPortalSpawn callback when a pair first appears", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const spawnCb = vi.fn();
      renderer.onPortalSpawn(spawnCb);

      const pair = createPair();
      renderer.update(scene, 16, [pair]);

      expect(spawnCb).toHaveBeenCalledOnce();
      expect(spawnCb).toHaveBeenCalledWith(pair, scene);
    });

    it("fires onPortalSpawn only once per pair", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const spawnCb = vi.fn();
      renderer.onPortalSpawn(spawnCb);

      const pair = createPair();
      renderer.update(scene, 16, [pair]);
      renderer.update(scene, 16, [pair]);
      renderer.update(scene, 16, [pair]);

      expect(spawnCb).toHaveBeenCalledOnce();
    });

    it("fires onPortalSpawn for each pair in a batch", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const spawnCb = vi.fn();
      renderer.onPortalSpawn(spawnCb);

      const pair1 = createPair({ id: "p1" });
      const pair2 = createPair({ id: "p2" });
      renderer.update(scene, 16, [pair1, pair2]);

      expect(spawnCb).toHaveBeenCalledTimes(2);
      expect(spawnCb).toHaveBeenCalledWith(pair1, scene);
      expect(spawnCb).toHaveBeenCalledWith(pair2, scene);
    });

    it("fires onPortalDespawn when notifyCollapsed is called", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const despawnCb = vi.fn();
      renderer.onPortalDespawn(despawnCb);

      const pair = createPair({
        spawnDurationMs: 0,
        lifespanMs: 100,
        collapseDurationMs: 100,
      });

      // Track the pair first
      renderer.update(scene, 16, [pair]);

      // Advance the pair to collapsed
      pair.update(1);
      pair.update(200);
      pair.update(200);

      renderer.notifyCollapsed([pair], scene);

      expect(despawnCb).toHaveBeenCalledOnce();
      expect(despawnCb).toHaveBeenCalledWith("test-pair-1", scene);
    });

    it("fires onPortalDespawn only for tracked pairs", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const despawnCb = vi.fn();
      renderer.onPortalDespawn(despawnCb);

      const pair = createPair();
      // Don't call update, so pair is never tracked
      renderer.notifyCollapsed([pair], scene);

      expect(despawnCb).not.toHaveBeenCalled();
    });

    it("clears tracked pairs on reset, allowing re-spawn callbacks", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const spawnCb = vi.fn();
      renderer.onPortalSpawn(spawnCb);

      const pair = createPair();
      renderer.update(scene, 16, [pair]);
      expect(spawnCb).toHaveBeenCalledOnce();

      renderer.reset();
      renderer.update(scene, 16, [pair]);
      expect(spawnCb).toHaveBeenCalledTimes(2);
    });
  });

  describe("integration with PortalPair lifecycle", () => {
    it("tracks full lifecycle: spawning → active → collapsing → collapsed", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const spawnCb = vi.fn();
      const despawnCb = vi.fn();
      renderer.onPortalSpawn(spawnCb);
      renderer.onPortalDespawn(despawnCb);

      const pair = createPair({
        spawnDurationMs: 100,
        lifespanMs: 300,
        collapseDurationMs: 100,
      });

      // Frame 1: spawning
      renderer.update(scene, 50, [pair]);
      pair.update(50);
      expect(spawnCb).toHaveBeenCalledOnce();
      expect(pair.getState()).toBe("spawning");

      // Frame 2: still spawning → active
      renderer.update(scene, 60, [pair]);
      pair.update(60);
      expect(pair.getState()).toBe("active");

      // Frame 3: active
      renderer.update(scene, 100, [pair]);
      pair.update(100);
      expect(pair.getState()).toBe("active");

      // Frame 4: advance past lifespan → collapsing
      pair.update(200);
      renderer.update(scene, 16, [pair]);
      expect(pair.getState()).toBe("collapsing");

      // Frame 5: advance to collapsed
      pair.update(200);
      expect(pair.getState()).toBe("collapsed");
      renderer.notifyCollapsed([pair], scene);
      expect(despawnCb).toHaveBeenCalledOnce();
      expect(despawnCb).toHaveBeenCalledWith("test-pair-1", scene);
    });
  });

  describe("edge cases", () => {
    it("handles empty pairs array gracefully", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      expect(() => renderer.update(scene, 16, [])).not.toThrow();
    });

    it("handles pair with zero spawn duration (instant active)", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({ spawnDurationMs: 0 });
      pair.update(1);

      renderer.update(scene, 16, [pair]);
      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      // Should draw at full visibility
      expect(graphicsInstance.fillCircle.mock.calls.length).toBe(4);
    });

    it("handles pair with zero collapse duration (instant collapse)", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({
        spawnDurationMs: 0,
        lifespanMs: 100,
        collapseDurationMs: 0,
      });
      pair.update(1);
      pair.update(200); // Past lifespan → collapsing → collapsed instantly

      renderer.update(scene, 16, [pair]);
      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      // Collapsed: no drawing
      expect(graphicsInstance.fillCircle.mock.calls.length).toBe(0);
    });

    it("notifyCollapsed with empty array is a no-op", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      expect(() => renderer.notifyCollapsed([], scene)).not.toThrow();
    });

    it("destroy is idempotent", () => {
      const renderer = new PortalRenderer();
      expect(() => {
        renderer.destroy();
        renderer.destroy();
      }).not.toThrow();
    });
  });

  describe("tile distortion", () => {
    it("draws fillRect calls for distorted tiles around active portals", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      // Place portal away from edges to avoid boundary clamping
      const pair = createPair({
        posA: { col: 10, row: 10 },
        posB: { col: 25, row: 20 },
        spawnDurationMs: 0,
      });
      pair.update(1); // active

      renderer.update(scene, 16, [pair]);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      // Distortion should have produced fillRect calls
      expect(graphicsInstance.fillRect.mock.calls.length).toBeGreaterThan(0);
    });

    it("uses portal end colors for distortion overlays", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({
        posA: { col: 10, row: 10 },
        posB: { col: 25, row: 20 },
        spawnDurationMs: 0,
      });
      pair.update(1);

      renderer.update(scene, 16, [pair]);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      const fillStyleCalls = graphicsInstance.fillStyle.mock.calls;

      // Distortion fillStyle calls come before core fillStyle calls
      // Check that the first distortion call uses PORTAL_COLOR_A
      expect(fillStyleCalls[0][0]).toBe(PORTAL_COLOR_A);

      // Find the first call using PORTAL_COLOR_B (distortion for end B)
      const firstEndBCall = fillStyleCalls.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (c: any[]) => c[0] === PORTAL_COLOR_B,
      );
      expect(firstEndBCall).toBeDefined();
    });

    it("does not draw distortion for collapsed pairs", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({
        posA: { col: 10, row: 10 },
        posB: { col: 25, row: 20 },
        spawnDurationMs: 0,
        lifespanMs: 100,
        collapseDurationMs: 100,
      });
      pair.update(1); // active
      pair.update(200); // collapsing
      pair.update(200); // collapsed

      renderer.update(scene, 16, [pair]);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      expect(graphicsInstance.fillRect.mock.calls.length).toBe(0);
    });

    it("does not draw distortion at zero visibility (start of spawning)", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const pair = createPair({
        posA: { col: 10, row: 10 },
        posB: { col: 25, row: 20 },
        spawnDurationMs: 500,
      });
      // Don't advance — visibility is 0

      renderer.update(scene, 16, [pair]);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      expect(graphicsInstance.fillRect.mock.calls.length).toBe(0);
    });

    it("scales distortion intensity with visibility during spawning", () => {
      // 50% spawning should produce lower-alpha distortion than active
      const pair50 = createPair({
        id: "p50",
        posA: { col: 10, row: 10 },
        posB: { col: 25, row: 20 },
        spawnDurationMs: 500,
      });
      pair50.update(250); // 50% through spawning

      const scene1 = createMockScene();
      const renderer1 = new PortalRenderer();
      renderer1.update(scene1, 16, [pair50]);
      const gfx50 = mockAddGraphics.mock.results[mockAddGraphics.mock.results.length - 1]?.value;
      const distortionAlpha50 = gfx50.fillStyle.mock.calls[0]?.[1] ?? 0;

      vi.clearAllMocks();

      const pairFull = createPair({
        id: "pFull",
        posA: { col: 10, row: 10 },
        posB: { col: 25, row: 20 },
        spawnDurationMs: 0,
      });
      pairFull.update(1); // active, full visibility

      const scene2 = createMockScene();
      const renderer2 = new PortalRenderer();
      renderer2.update(scene2, 16, [pairFull]);
      const gfxFull = mockAddGraphics.mock.results[mockAddGraphics.mock.results.length - 1]?.value;
      const distortionAlphaFull = gfxFull.fillStyle.mock.calls[0]?.[1] ?? 0;

      // Half visibility should produce lower distortion alpha
      expect(distortionAlpha50).toBeGreaterThan(0);
      expect(distortionAlphaFull).toBeGreaterThan(distortionAlpha50);
    });

    it("scales distortion with visibility during collapsing", () => {
      // At 50% collapse (visibility 0.5) vs 75% collapse (visibility 0.25)
      const pair50 = createPair({
        id: "p50",
        posA: { col: 10, row: 10 },
        posB: { col: 25, row: 20 },
        spawnDurationMs: 0,
        lifespanMs: 100,
        collapseDurationMs: 400,
      });
      pair50.update(1);
      pair50.update(100); // collapsing
      pair50.update(200); // 50% collapse → visibility 0.5

      const scene1 = createMockScene();
      const renderer1 = new PortalRenderer();
      renderer1.update(scene1, 16, [pair50]);
      const gfx50 = mockAddGraphics.mock.results[mockAddGraphics.mock.results.length - 1]?.value;
      const rectCount50 = gfx50.fillRect.mock.calls.length;

      vi.clearAllMocks();

      const pair75 = createPair({
        id: "p75",
        posA: { col: 10, row: 10 },
        posB: { col: 25, row: 20 },
        spawnDurationMs: 0,
        lifespanMs: 100,
        collapseDurationMs: 400,
      });
      pair75.update(1);
      pair75.update(100); // collapsing
      pair75.update(300); // 75% collapse → visibility 0.25

      const scene2 = createMockScene();
      const renderer2 = new PortalRenderer();
      renderer2.update(scene2, 16, [pair75]);
      const gfx75 = mockAddGraphics.mock.results[mockAddGraphics.mock.results.length - 1]?.value;
      const rectCount75 = gfx75.fillRect.mock.calls.length;

      // Both should produce some distortion, but at lower visibility
      // fewer tiles may pass the alpha threshold
      expect(rectCount50).toBeGreaterThan(0);
      expect(rectCount75).toBeGreaterThanOrEqual(0);
      // 50% collapse should have at least as many distortion tiles
      expect(rectCount50).toBeGreaterThanOrEqual(rectCount75);
    });

    it("does not draw distortion on the portal tile itself", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const portalCol = 10;
      const portalRow = 10;
      const pair = createPair({
        posA: { col: portalCol, row: portalRow },
        posB: { col: 25, row: 20 },
        spawnDurationMs: 0,
      });
      pair.update(1);

      renderer.update(scene, 16, [pair]);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      const fillRectCalls = graphicsInstance.fillRect.mock.calls;

      // The portal tile center
      const portalTileX = portalCol * TILE_SIZE;
      const portalTileY = portalRow * TILE_SIZE;

      // No fillRect should be drawn exactly at the portal tile's unmodified position
      // (the portal tile is skipped in distortion)
      for (const call of fillRectCalls) {
        const rectX = call[0] as number;
        const rectY = call[1] as number;
        const rectW = call[2] as number;
        const rectH = call[3] as number;
        // A rect at exactly the portal tile without any offset would mean
        // it wasn't skipped. Check that no rect is centered on the portal tile.
        const rectCenterX = rectX + rectW / 2;
        const rectCenterY = rectY + rectH / 2;
        const portalCenterX = portalTileX + TILE_SIZE / 2;
        const portalCenterY = portalTileY + TILE_SIZE / 2;
        // The portal tile itself has 0 distance so pullX=pullY=0 and would
        // center exactly on portalCenter if not skipped
        const isExactCenter =
          Math.abs(rectCenterX - portalCenterX) < 0.01 &&
          Math.abs(rectCenterY - portalCenterY) < 0.01;
        expect(isExactCenter).toBe(false);
      }
    });

    it("clamps distortion tiles to grid bounds near edges", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      // Place portal at corner (0,0) — distortion should only cover valid tiles
      const pair = createPair({
        posA: { col: 0, row: 0 },
        posB: { col: 25, row: 20 },
        spawnDurationMs: 0,
      });
      pair.update(1);

      renderer.update(scene, 16, [pair]);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      const fillRectCalls = graphicsInstance.fillRect.mock.calls;

      // All distortion rectangles should have non-negative top-left coordinates
      // (within reason — pull can shift them slightly negative, but the tile
      // base positions should all be >= 0)
      for (const call of fillRectCalls) {
        const rectX = call[0] as number;
        const rectY = call[1] as number;
        // Tile positions can shift slightly due to pull, but shouldn't go far negative
        expect(rectX).toBeGreaterThan(-TILE_SIZE);
        expect(rectY).toBeGreaterThan(-TILE_SIZE);
      }

      // Should still produce some distortion tiles (those adjacent to corner)
      expect(fillRectCalls.length).toBeGreaterThan(0);
    });

    it("exported distortion constants have sensible values", () => {
      expect(DISTORTION_RADIUS).toBeGreaterThanOrEqual(1);
      expect(DISTORTION_RADIUS).toBeLessThanOrEqual(10);
      expect(DISTORTION_INTENSITY).toBeGreaterThan(0);
      expect(DISTORTION_INTENSITY).toBeLessThanOrEqual(1);
      expect(DISTORTION_ALPHA).toBeGreaterThan(0);
      expect(DISTORTION_ALPHA).toBeLessThanOrEqual(1);
    });

    it("produces distortion tiles within the configured radius of nearest portal", () => {
      const renderer = new PortalRenderer();
      const scene = createMockScene();
      const posA = { col: 15, row: 15 };
      const posB = { col: 30, row: 25 };
      const pair = createPair({
        posA,
        posB,
        spawnDurationMs: 0,
      });
      pair.update(1);

      renderer.update(scene, 16, [pair]);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      const fillRectCalls = graphicsInstance.fillRect.mock.calls;

      const pixelA = gridToPixel(posA);
      const pixelB = gridToPixel(posB);
      const maxDistPixels = (DISTORTION_RADIUS + 1) * TILE_SIZE;

      for (const call of fillRectCalls) {
        const rectX = call[0] as number;
        const rectY = call[1] as number;
        const rectW = call[2] as number;
        const rectCenterX = rectX + rectW / 2;
        const rectCenterY = rectY + (call[3] as number) / 2;

        // Distance to nearest portal end
        const dxA = Math.abs(rectCenterX - pixelA.x);
        const dyA = Math.abs(rectCenterY - pixelA.y);
        const dxB = Math.abs(rectCenterX - pixelB.x);
        const dyB = Math.abs(rectCenterY - pixelB.y);

        const nearA = dxA < maxDistPixels && dyA < maxDistPixels;
        const nearB = dxB < maxDistPixels && dyB < maxDistPixels;
        expect(nearA || nearB).toBe(true);
      }
    });
  });
});
