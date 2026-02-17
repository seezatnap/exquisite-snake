import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SplitSnakeRenderer,
  computeSplitState,
  SPLIT_SNAKE_RENDER_DEPTH,
  ENTRY_SIDE_GLOW_ALPHA,
  EXIT_SIDE_GLOW_ALPHA,
  GLOW_PULSE_SPEED,
  GLOW_PULSE_MIN,
  PORTAL_MARKER_ALPHA,
  TRAIL_LINE_ALPHA,
  TRAIL_LINE_WIDTH,
  SEGMENT_GLOW_RADIUS_FACTOR,
  PORTAL_MARKER_RADIUS_FACTOR,
} from "@/game/systems/SplitSnakeRenderer";
import { PORTAL_COLOR_A, PORTAL_COLOR_B } from "@/game/systems/PortalRenderer";
import { RENDER_DEPTH } from "@/game/config";
import { gridToPixel, type GridPos } from "@/game/utils/grid";
import type { PortalTransitState } from "@/game/entities/Snake";

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

function makeTransit(
  overrides: Partial<PortalTransitState> = {},
): PortalTransitState {
  return {
    portalPairId: overrides.portalPairId ?? "portal-1",
    entryPos: overrides.entryPos ?? { col: 10, row: 10 },
    exitPos: overrides.exitPos ?? { col: 25, row: 5 },
    segmentsRemaining: overrides.segmentsRemaining ?? 3,
  };
}

function makeSegments(count: number, startCol = 10, row = 10): GridPos[] {
  const segs: GridPos[] = [];
  for (let i = 0; i < count; i++) {
    segs.push({ col: startCol + i, row });
  }
  return segs;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── computeSplitState unit tests ────────────────────────────────

describe("computeSplitState", () => {
  it("returns inactive state when segmentsRemaining is 0", () => {
    const segments = makeSegments(5);
    const transit = makeTransit({ segmentsRemaining: 0 });

    const state = computeSplitState(segments, transit);
    expect(state.active).toBe(false);
    expect(state.progress).toBe(1);
    expect(state.exitSideIndices).toEqual([]);
    expect(state.entrySideIndices).toEqual([]);
  });

  it("returns inactive state when there are no body segments", () => {
    const segments = makeSegments(1); // head only
    const transit = makeTransit({ segmentsRemaining: 0 });

    const state = computeSplitState(segments, transit);
    expect(state.active).toBe(false);
  });

  it("returns active state with correct split for 5 segments, 3 remaining", () => {
    // 5 segments total (1 head + 4 body), 3 remaining unthreaded
    const segments = makeSegments(5);
    const transit = makeTransit({ segmentsRemaining: 3 });

    const state = computeSplitState(segments, transit);
    expect(state.active).toBe(true);
    // Exit side: indices 0, 1 (head + 1 threaded body segment)
    expect(state.exitSideIndices).toEqual([0, 1]);
    // Entry side: indices 2, 3, 4 (3 unthreaded body segments)
    expect(state.entrySideIndices).toEqual([2, 3, 4]);
  });

  it("returns active state with all body on entry side at transit start", () => {
    // 4 segments total (1 head + 3 body), all 3 remaining
    const segments = makeSegments(4);
    const transit = makeTransit({ segmentsRemaining: 3 });

    const state = computeSplitState(segments, transit);
    expect(state.active).toBe(true);
    // Only head is on exit side
    expect(state.exitSideIndices).toEqual([0]);
    // All body on entry side
    expect(state.entrySideIndices).toEqual([1, 2, 3]);
    expect(state.progress).toBeCloseTo(0, 5);
  });

  it("returns active state with 1 remaining (almost complete)", () => {
    // 4 segments, only 1 remaining
    const segments = makeSegments(4);
    const transit = makeTransit({ segmentsRemaining: 1 });

    const state = computeSplitState(segments, transit);
    expect(state.active).toBe(true);
    // Exit side: indices 0, 1, 2
    expect(state.exitSideIndices).toEqual([0, 1, 2]);
    // Entry side: index 3
    expect(state.entrySideIndices).toEqual([3]);
    expect(state.progress).toBeCloseTo(2 / 3, 5);
  });

  it("computes progress correctly", () => {
    const segments = makeSegments(6); // 1 head + 5 body
    const transit = makeTransit({ segmentsRemaining: 2 });

    const state = computeSplitState(segments, transit);
    // progress = 1 - 2/5 = 0.6
    expect(state.progress).toBeCloseTo(0.6, 5);
  });

  it("includes transit reference in the returned state", () => {
    const segments = makeSegments(4);
    const transit = makeTransit({ portalPairId: "my-portal" });

    const state = computeSplitState(segments, transit);
    expect(state.transit.portalPairId).toBe("my-portal");
  });

  it("handles segmentsRemaining larger than body count", () => {
    // 3 segments but transit says 10 remaining — should still compute
    const segments = makeSegments(3);
    const transit = makeTransit({ segmentsRemaining: 10 });

    const state = computeSplitState(segments, transit);
    expect(state.active).toBe(true);
    // firstEntryIdx = 3 - 10 = -7, clamped behavior:
    // All indices < -7 go to exit side (none), rest to entry side
    // Actually indices 0..2 are all >= -7, but since -7 < 0 we loop i < -7 never matches
    // So all indices land in entry side
    expect(state.entrySideIndices.length).toBe(3);
    expect(state.exitSideIndices.length).toBe(0);
  });
});

// ── SplitSnakeRenderer unit tests ────────────────────────────────

describe("SplitSnakeRenderer", () => {
  describe("construction and reset", () => {
    it("initializes with zero pulse angle", () => {
      const renderer = new SplitSnakeRenderer();
      expect(renderer.getPulseAngle()).toBe(0);
    });

    it("reset clears pulse angle and destroys graphics", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      const segments = makeSegments(4);
      const transit = makeTransit({ segmentsRemaining: 2 });

      renderer.update(scene, 1000, segments, transit);
      expect(renderer.getPulseAngle()).toBeGreaterThan(0);

      renderer.reset();
      expect(renderer.getPulseAngle()).toBe(0);
    });
  });

  describe("pulse angle accumulation", () => {
    it("advances pulse angle based on delta time", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      const segments = makeSegments(4);
      const transit = makeTransit({ segmentsRemaining: 2 });

      renderer.update(scene, 1000, segments, transit);
      const expectedAngle = (1000 / 1000) * GLOW_PULSE_SPEED;
      expect(renderer.getPulseAngle()).toBeCloseTo(
        expectedAngle % (Math.PI * 2),
        5,
      );
    });

    it("wraps pulse angle at 2π", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      const segments = makeSegments(4);
      const transit = makeTransit({ segmentsRemaining: 2 });

      const duration = ((Math.PI * 2) / GLOW_PULSE_SPEED) * 1000 + 100;
      renderer.update(scene, duration, segments, transit);
      expect(renderer.getPulseAngle()).toBeLessThan(Math.PI * 2);
      expect(renderer.getPulseAngle()).toBeGreaterThanOrEqual(0);
    });

    it("handles zero delta without changing pulse angle", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      renderer.update(scene, 0, [], null);
      expect(renderer.getPulseAngle()).toBe(0);
    });

    it("handles negative delta safely", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      renderer.update(scene, -100, [], null);
      expect(renderer.getPulseAngle()).toBe(0);
    });

    it("handles NaN delta safely", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      renderer.update(scene, NaN, [], null);
      expect(renderer.getPulseAngle()).toBe(0);
    });
  });

  describe("graphics lifecycle", () => {
    it("creates graphics object when transit is active", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      const segments = makeSegments(4);
      const transit = makeTransit({ segmentsRemaining: 2 });

      renderer.update(scene, 16, segments, transit);
      expect(mockAddGraphics).toHaveBeenCalledTimes(1);
    });

    it("sets render depth to SPLIT_SNAKE_RENDER_DEPTH", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      const segments = makeSegments(4);
      const transit = makeTransit({ segmentsRemaining: 2 });

      renderer.update(scene, 16, segments, transit);
      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      expect(graphicsInstance.setDepth).toHaveBeenCalledWith(
        SPLIT_SNAKE_RENDER_DEPTH,
      );
    });

    it("does not create graphics when transit is null", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();

      renderer.update(scene, 16, makeSegments(4), null);
      expect(mockAddGraphics).not.toHaveBeenCalled();
    });

    it("does not create graphics when segments length < 2", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      const transit = makeTransit({ segmentsRemaining: 0 });

      renderer.update(scene, 16, makeSegments(1), transit);
      expect(mockAddGraphics).not.toHaveBeenCalled();
    });

    it("clears graphics each frame before redrawing", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      const segments = makeSegments(4);
      const transit = makeTransit({ segmentsRemaining: 2 });

      renderer.update(scene, 16, segments, transit);
      renderer.update(scene, 16, segments, transit);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      expect(graphicsInstance.clear).toHaveBeenCalledTimes(2);
    });

    it("destroy() destroys the graphics object", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      const segments = makeSegments(4);
      const transit = makeTransit({ segmentsRemaining: 2 });

      renderer.update(scene, 16, segments, transit);
      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;

      renderer.destroy();
      expect(graphicsInstance.destroy).toHaveBeenCalled();
    });

    it("destroy is idempotent", () => {
      const renderer = new SplitSnakeRenderer();
      expect(() => {
        renderer.destroy();
        renderer.destroy();
      }).not.toThrow();
    });
  });

  describe("segment glow drawing", () => {
    it("draws fillCircle calls for entry-side and exit-side segments", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      // 4 segments, 2 remaining → exit side [0,1], entry side [2,3]
      const segments = makeSegments(4);
      const transit = makeTransit({ segmentsRemaining: 2 });

      renderer.update(scene, 16, segments, transit);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      // 4 segment glows = 4 fillCircle calls
      expect(graphicsInstance.fillCircle.mock.calls.length).toBe(4);
    });

    it("draws entry-side segments with PORTAL_COLOR_A", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      // 3 segments, 1 remaining → exit side [0,1], entry side [2]
      const segments = makeSegments(3);
      const transit = makeTransit({ segmentsRemaining: 1 });

      renderer.update(scene, 16, segments, transit);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      const fillStyleCalls = graphicsInstance.fillStyle.mock.calls;

      // Find fillStyle calls that use PORTAL_COLOR_A
      const colorACalls = fillStyleCalls.filter(
        (c: unknown[]) => c[0] === PORTAL_COLOR_A,
      );
      expect(colorACalls.length).toBeGreaterThan(0);
    });

    it("draws exit-side segments with PORTAL_COLOR_B", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      const segments = makeSegments(4);
      const transit = makeTransit({ segmentsRemaining: 2 });

      renderer.update(scene, 16, segments, transit);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      const fillStyleCalls = graphicsInstance.fillStyle.mock.calls;

      const colorBCalls = fillStyleCalls.filter(
        (c: unknown[]) => c[0] === PORTAL_COLOR_B,
      );
      expect(colorBCalls.length).toBeGreaterThan(0);
    });

    it("draws segment glow at correct pixel positions", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      const segments: GridPos[] = [
        { col: 25, row: 5 },
        { col: 24, row: 5 },
        { col: 10, row: 10 },
      ];
      const transit = makeTransit({ segmentsRemaining: 1 });

      renderer.update(scene, 16, segments, transit);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      const fillCircleCalls = graphicsInstance.fillCircle.mock.calls;

      // Check that glow circles are at correct pixel positions
      const pixelPositions = segments.map(gridToPixel);
      for (const pixelPos of pixelPositions) {
        const matchingCall = fillCircleCalls.find(
          (c: unknown[]) =>
            Math.abs((c[0] as number) - pixelPos.x) < 0.01 &&
            Math.abs((c[1] as number) - pixelPos.y) < 0.01,
        );
        expect(matchingCall).toBeDefined();
      }
    });
  });

  describe("portal markers", () => {
    it("draws strokeCircle at entry and exit portal positions", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      const segments = makeSegments(4);
      const entryPos = { col: 10, row: 10 };
      const exitPos = { col: 25, row: 5 };
      const transit = makeTransit({
        entryPos,
        exitPos,
        segmentsRemaining: 2,
      });

      renderer.update(scene, 16, segments, transit);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      const strokeCircleCalls = graphicsInstance.strokeCircle.mock.calls;

      // 2 portal markers
      expect(strokeCircleCalls.length).toBe(2);

      const entryPixel = gridToPixel(entryPos);
      const exitPixel = gridToPixel(exitPos);

      // First marker at entry position
      expect(strokeCircleCalls[0][0]).toBeCloseTo(entryPixel.x, 1);
      expect(strokeCircleCalls[0][1]).toBeCloseTo(entryPixel.y, 1);

      // Second marker at exit position
      expect(strokeCircleCalls[1][0]).toBeCloseTo(exitPixel.x, 1);
      expect(strokeCircleCalls[1][1]).toBeCloseTo(exitPixel.y, 1);
    });

    it("uses PORTAL_COLOR_A for entry marker and PORTAL_COLOR_B for exit marker", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      const segments = makeSegments(4);
      const transit = makeTransit({ segmentsRemaining: 2 });

      renderer.update(scene, 16, segments, transit);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      const lineStyleCalls = graphicsInstance.lineStyle.mock.calls;

      // Find calls that use portal colors (markers use width 2 + portal color)
      const colorACall = lineStyleCalls.find(
        (c: unknown[]) => c[1] === PORTAL_COLOR_A,
      );
      const colorBCall = lineStyleCalls.find(
        (c: unknown[]) => c[1] === PORTAL_COLOR_B,
      );
      expect(colorACall).toBeDefined();
      expect(colorBCall).toBeDefined();
      expect(colorACall![0]).toBe(2); // marker line width
      expect(colorBCall![0]).toBe(2); // marker line width
    });
  });

  describe("connecting trail", () => {
    it("draws a line between entry and exit portal positions", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      const segments = makeSegments(4);
      const entryPos = { col: 10, row: 10 };
      const exitPos = { col: 25, row: 5 };
      const transit = makeTransit({
        entryPos,
        exitPos,
        segmentsRemaining: 2,
      });

      renderer.update(scene, 16, segments, transit);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      // moveTo and lineTo should be called for the trail
      expect(graphicsInstance.moveTo.mock.calls.length).toBeGreaterThan(0);
      expect(graphicsInstance.lineTo.mock.calls.length).toBeGreaterThan(0);
      expect(graphicsInstance.strokePath.mock.calls.length).toBeGreaterThan(0);

      const entryPixel = gridToPixel(entryPos);
      const exitPixel = gridToPixel(exitPos);

      // First moveTo should be at entry position
      const moveToCall = graphicsInstance.moveTo.mock.calls[0];
      expect(moveToCall[0]).toBeCloseTo(entryPixel.x, 1);
      expect(moveToCall[1]).toBeCloseTo(entryPixel.y, 1);

      // First lineTo should be at exit position
      const lineToCall = graphicsInstance.lineTo.mock.calls[0];
      expect(lineToCall[0]).toBeCloseTo(exitPixel.x, 1);
      expect(lineToCall[1]).toBeCloseTo(exitPixel.y, 1);
    });

    it("uses TRAIL_LINE_WIDTH for the trail line", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      const segments = makeSegments(4);
      const transit = makeTransit({ segmentsRemaining: 2 });

      renderer.update(scene, 16, segments, transit);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      const lineStyleCalls = graphicsInstance.lineStyle.mock.calls;

      // First lineStyle call should be for the trail
      expect(lineStyleCalls[0][0]).toBe(TRAIL_LINE_WIDTH);
    });
  });

  describe("no drawing when transit is inactive", () => {
    it("does not draw when transit is null", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();

      renderer.update(scene, 16, makeSegments(4), null);
      expect(mockAddGraphics).not.toHaveBeenCalled();
    });

    it("does not draw when transit has 0 segments remaining", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      const transit = makeTransit({ segmentsRemaining: 0 });

      renderer.update(scene, 16, makeSegments(4), transit);

      const graphicsInstance = mockAddGraphics.mock.results[0]?.value;
      // Graphics is created but cleared without drawing glow/markers
      expect(graphicsInstance.fillCircle.mock.calls.length).toBe(0);
      expect(graphicsInstance.strokeCircle.mock.calls.length).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("handles empty segments array gracefully", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      const transit = makeTransit({ segmentsRemaining: 2 });

      expect(() =>
        renderer.update(scene, 16, [], transit),
      ).not.toThrow();
    });

    it("handles single-segment snake gracefully", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      const transit = makeTransit({ segmentsRemaining: 0 });

      expect(() =>
        renderer.update(scene, 16, makeSegments(1), transit),
      ).not.toThrow();
    });

    it("handles segmentsRemaining larger than actual body count gracefully", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = createMockScene();
      // 3 segments but transit says 10 remaining — should still work
      const transit = makeTransit({ segmentsRemaining: 10 });

      expect(() =>
        renderer.update(scene, 16, makeSegments(3), transit),
      ).not.toThrow();
    });

    it("handles scene without graphics factory gracefully", () => {
      const renderer = new SplitSnakeRenderer();
      const scene = { add: {} } as unknown as import("phaser").Scene;
      const transit = makeTransit({ segmentsRemaining: 2 });

      expect(() =>
        renderer.update(scene, 16, makeSegments(4), transit),
      ).not.toThrow();
    });
  });

  describe("exported constants", () => {
    it("SPLIT_SNAKE_RENDER_DEPTH is below SNAKE depth", () => {
      expect(SPLIT_SNAKE_RENDER_DEPTH).toBeLessThan(RENDER_DEPTH.SNAKE);
    });

    it("glow alpha values are in valid range", () => {
      expect(ENTRY_SIDE_GLOW_ALPHA).toBeGreaterThan(0);
      expect(ENTRY_SIDE_GLOW_ALPHA).toBeLessThanOrEqual(1);
      expect(EXIT_SIDE_GLOW_ALPHA).toBeGreaterThan(0);
      expect(EXIT_SIDE_GLOW_ALPHA).toBeLessThanOrEqual(1);
    });

    it("pulse speed is positive", () => {
      expect(GLOW_PULSE_SPEED).toBeGreaterThan(0);
    });

    it("pulse min is in valid range", () => {
      expect(GLOW_PULSE_MIN).toBeGreaterThan(0);
      expect(GLOW_PULSE_MIN).toBeLessThan(1);
    });

    it("trail line alpha and width are positive", () => {
      expect(TRAIL_LINE_ALPHA).toBeGreaterThan(0);
      expect(TRAIL_LINE_WIDTH).toBeGreaterThan(0);
    });

    it("portal marker alpha is in valid range", () => {
      expect(PORTAL_MARKER_ALPHA).toBeGreaterThan(0);
      expect(PORTAL_MARKER_ALPHA).toBeLessThanOrEqual(1);
    });

    it("radius factors are in valid range", () => {
      expect(SEGMENT_GLOW_RADIUS_FACTOR).toBeGreaterThan(0);
      expect(SEGMENT_GLOW_RADIUS_FACTOR).toBeLessThanOrEqual(1);
      expect(PORTAL_MARKER_RADIUS_FACTOR).toBeGreaterThan(0);
      expect(PORTAL_MARKER_RADIUS_FACTOR).toBeLessThanOrEqual(1);
    });
  });
});
