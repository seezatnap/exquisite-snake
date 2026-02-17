import { describe, it, expect, beforeEach } from "vitest";
import {
  PortalPair,
  type PortalPairOptions,
  type CellOccupancyChecker,
  PORTAL_LIFESPAN_MS,
  PORTAL_SPAWN_DURATION_MS,
  PORTAL_COLLAPSE_DURATION_MS,
  findEmptyCells,
  pickTwoDistinctCells,
  findPortalSpawnPositions,
  generatePortalPairId,
  resetPortalPairIdCounter,
} from "../game/entities/Portal";
import { GRID_COLS, GRID_ROWS } from "../game/config";
import type { GridPos } from "../game/utils/grid";

// ── Helpers ─────────────────────────────────────────────────────

function createPair(overrides: Partial<PortalPairOptions> = {}): PortalPair {
  return new PortalPair({
    id: overrides.id ?? "test-pair",
    positionA: overrides.positionA ?? { col: 5, row: 5 },
    positionB: overrides.positionB ?? { col: 30, row: 20 },
    ...overrides,
  });
}

/** Deterministic RNG from a fixed sequence. */
function seededRng(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

// ── PortalPair ──────────────────────────────────────────────────

describe("PortalPair", () => {
  describe("construction", () => {
    it("stores the provided id and positions", () => {
      const pair = createPair({
        id: "pair-1",
        positionA: { col: 2, row: 3 },
        positionB: { col: 10, row: 15 },
      });

      expect(pair.id).toBe("pair-1");
      expect(pair.endA.position).toEqual({ col: 2, row: 3 });
      expect(pair.endB.position).toEqual({ col: 10, row: 15 });
    });

    it("clones position objects to avoid external mutation", () => {
      const posA = { col: 1, row: 1 };
      const posB = { col: 2, row: 2 };
      const pair = createPair({ positionA: posA, positionB: posB });

      posA.col = 99;
      posB.row = 99;

      expect(pair.endA.position.col).toBe(1);
      expect(pair.endB.position.row).toBe(2);
    });

    it("uses default timing constants when not specified", () => {
      const pair = createPair();
      expect(pair.lifespanMs).toBe(PORTAL_LIFESPAN_MS);
      expect(pair.spawnDurationMs).toBe(PORTAL_SPAWN_DURATION_MS);
      expect(pair.collapseDurationMs).toBe(PORTAL_COLLAPSE_DURATION_MS);
    });

    it("allows overriding timing constants", () => {
      const pair = createPair({
        lifespanMs: 5000,
        spawnDurationMs: 200,
        collapseDurationMs: 300,
      });

      expect(pair.lifespanMs).toBe(5000);
      expect(pair.spawnDurationMs).toBe(200);
      expect(pair.collapseDurationMs).toBe(300);
    });

    it("clamps negative timing values to 0", () => {
      const pair = createPair({
        lifespanMs: -100,
        spawnDurationMs: -50,
        collapseDurationMs: -25,
      });

      expect(pair.lifespanMs).toBe(0);
      expect(pair.spawnDurationMs).toBe(0);
      expect(pair.collapseDurationMs).toBe(0);
    });

    it("starts in spawning state", () => {
      const pair = createPair();
      expect(pair.getState()).toBe("spawning");
    });
  });

  describe("lifecycle state transitions", () => {
    it("transitions from spawning → active after spawnDurationMs", () => {
      const pair = createPair({ spawnDurationMs: 500 });
      expect(pair.getState()).toBe("spawning");

      pair.update(250);
      expect(pair.getState()).toBe("spawning");

      pair.update(250);
      expect(pair.getState()).toBe("active");
    });

    it("transitions from active → collapsing after lifespanMs", () => {
      const pair = createPair({
        lifespanMs: 1000,
        spawnDurationMs: 200,
      });

      pair.update(200); // spawning → active
      expect(pair.getState()).toBe("active");

      pair.update(700);
      expect(pair.getState()).toBe("active");

      pair.update(100); // total elapsed = 1000 = lifespanMs
      expect(pair.getState()).toBe("collapsing");
    });

    it("transitions from collapsing → collapsed after collapseDurationMs", () => {
      const pair = createPair({
        lifespanMs: 1000,
        spawnDurationMs: 100,
        collapseDurationMs: 300,
      });

      pair.update(100);  // → active
      pair.update(900);  // → collapsing
      expect(pair.getState()).toBe("collapsing");

      pair.update(150);
      expect(pair.getState()).toBe("collapsing");

      pair.update(150);
      expect(pair.getState()).toBe("collapsed");
    });

    it("does not advance beyond collapsed", () => {
      const pair = createPair({
        lifespanMs: 100,
        spawnDurationMs: 50,
        collapseDurationMs: 50,
      });

      pair.update(50);  // → active
      pair.update(50);  // → collapsing
      pair.update(50);  // → collapsed

      expect(pair.getState()).toBe("collapsed");

      pair.update(10000);
      expect(pair.getState()).toBe("collapsed");
    });

    it("full lifecycle with zero-duration spawn/collapse", () => {
      const pair = createPair({
        lifespanMs: 500,
        spawnDurationMs: 0,
        collapseDurationMs: 0,
      });

      // With 0 spawn duration, first update transitions spawning → active
      pair.update(1);
      expect(pair.getState()).toBe("active");

      pair.update(499);
      expect(pair.getState()).toBe("collapsing");

      // With 0 collapse duration, next update transitions collapsing → collapsed
      pair.update(1);
      expect(pair.getState()).toBe("collapsed");
    });
  });

  describe("update() return value", () => {
    it("returns the current state after advancing", () => {
      const pair = createPair({ spawnDurationMs: 100 });

      expect(pair.update(50)).toBe("spawning");
      expect(pair.update(50)).toBe("active");
    });

    it("handles zero delta without state change", () => {
      const pair = createPair();
      expect(pair.update(0)).toBe("spawning");
    });

    it("handles negative delta without state change", () => {
      const pair = createPair();
      expect(pair.update(-100)).toBe("spawning");
    });

    it("handles NaN delta without state change", () => {
      const pair = createPair();
      expect(pair.update(NaN)).toBe("spawning");
    });

    it("handles Infinity delta without state change", () => {
      const pair = createPair();
      expect(pair.update(Infinity)).toBe("spawning");
    });
  });

  describe("beginCollapse()", () => {
    it("forces transition to collapsing from spawning", () => {
      const pair = createPair();
      expect(pair.getState()).toBe("spawning");

      pair.beginCollapse();
      expect(pair.getState()).toBe("collapsing");
    });

    it("forces transition to collapsing from active", () => {
      const pair = createPair({ spawnDurationMs: 100 });
      pair.update(100);
      expect(pair.getState()).toBe("active");

      pair.beginCollapse();
      expect(pair.getState()).toBe("collapsing");
    });

    it("is a no-op when already collapsing", () => {
      const pair = createPair({
        lifespanMs: 100,
        spawnDurationMs: 50,
        collapseDurationMs: 200,
      });

      pair.update(50);  // → active
      pair.update(50);  // → collapsing

      const stateElapsedBefore = pair.getStateElapsedMs();
      pair.update(50);

      pair.beginCollapse();
      // Should not reset stateElapsedMs
      expect(pair.getState()).toBe("collapsing");
      expect(pair.getStateElapsedMs()).toBeGreaterThan(stateElapsedBefore);
    });

    it("is a no-op when already collapsed", () => {
      const pair = createPair({
        lifespanMs: 100,
        spawnDurationMs: 50,
        collapseDurationMs: 50,
      });

      pair.update(50);  // → active
      pair.update(50);  // → collapsing
      pair.update(50);  // → collapsed

      pair.beginCollapse();
      expect(pair.getState()).toBe("collapsed");
    });
  });

  describe("timing queries", () => {
    it("getStateElapsedMs tracks time within current state", () => {
      const pair = createPair({ spawnDurationMs: 500 });

      pair.update(200);
      expect(pair.getStateElapsedMs()).toBe(200);

      pair.update(300); // → active (resets stateElapsedMs)
      expect(pair.getStateElapsedMs()).toBe(0);

      pair.update(100);
      expect(pair.getStateElapsedMs()).toBe(100);
    });

    it("getTotalElapsedMs tracks total time since spawn", () => {
      const pair = createPair({ spawnDurationMs: 200 });

      pair.update(100);
      expect(pair.getTotalElapsedMs()).toBe(100);

      pair.update(200);
      expect(pair.getTotalElapsedMs()).toBe(300);
    });

    it("getRemainingMs returns time until auto-collapse", () => {
      const pair = createPair({
        lifespanMs: 1000,
        spawnDurationMs: 200,
      });

      expect(pair.getRemainingMs()).toBe(1000);

      pair.update(200); // → active
      expect(pair.getRemainingMs()).toBe(800);

      pair.update(500);
      expect(pair.getRemainingMs()).toBe(300);
    });

    it("getRemainingMs returns 0 when collapsing or collapsed", () => {
      const pair = createPair({
        lifespanMs: 100,
        spawnDurationMs: 50,
        collapseDurationMs: 50,
      });

      pair.update(50);  // → active
      pair.update(50);  // → collapsing
      expect(pair.getRemainingMs()).toBe(0);

      pair.update(50);  // → collapsed
      expect(pair.getRemainingMs()).toBe(0);
    });
  });

  describe("getStateProgress()", () => {
    it("progresses 0→1 during spawning", () => {
      const pair = createPair({ spawnDurationMs: 400 });

      expect(pair.getStateProgress()).toBe(0);

      pair.update(100);
      expect(pair.getStateProgress()).toBeCloseTo(0.25);

      pair.update(100);
      expect(pair.getStateProgress()).toBeCloseTo(0.5);
    });

    it("returns 1 during active state", () => {
      const pair = createPair({ spawnDurationMs: 100 });
      pair.update(100);

      expect(pair.getState()).toBe("active");
      expect(pair.getStateProgress()).toBe(1);
    });

    it("progresses 0→1 during collapsing", () => {
      const pair = createPair({
        lifespanMs: 200,
        spawnDurationMs: 100,
        collapseDurationMs: 200,
      });

      pair.update(100); // → active
      pair.update(100); // → collapsing

      expect(pair.getStateProgress()).toBe(0);

      pair.update(100);
      expect(pair.getStateProgress()).toBeCloseTo(0.5);
    });

    it("returns 1 when collapsed", () => {
      const pair = createPair({
        lifespanMs: 100,
        spawnDurationMs: 50,
        collapseDurationMs: 50,
      });

      pair.update(50);
      pair.update(50);
      pair.update(50);

      expect(pair.getState()).toBe("collapsed");
      expect(pair.getStateProgress()).toBe(1);
    });

    it("returns 1 when spawn duration is 0", () => {
      const pair = createPair({ spawnDurationMs: 0 });
      expect(pair.getStateProgress()).toBe(1);
    });
  });

  describe("isTraversable()", () => {
    it("returns true during spawning", () => {
      const pair = createPair();
      expect(pair.isTraversable()).toBe(true);
    });

    it("returns true during active", () => {
      const pair = createPair({ spawnDurationMs: 100 });
      pair.update(100);
      expect(pair.isTraversable()).toBe(true);
    });

    it("returns false during collapsing", () => {
      const pair = createPair({
        lifespanMs: 200,
        spawnDurationMs: 100,
      });
      pair.update(100); // → active
      pair.update(100); // → collapsing
      expect(pair.isTraversable()).toBe(false);
    });

    it("returns false when collapsed", () => {
      const pair = createPair({
        lifespanMs: 100,
        spawnDurationMs: 50,
        collapseDurationMs: 50,
      });
      pair.update(50);
      pair.update(50);
      pair.update(50);
      expect(pair.isTraversable()).toBe(false);
    });
  });

  describe("isCollapsed()", () => {
    it("returns false before collapsed state", () => {
      const pair = createPair();
      expect(pair.isCollapsed()).toBe(false);
    });

    it("returns true when collapsed", () => {
      const pair = createPair({
        lifespanMs: 100,
        spawnDurationMs: 50,
        collapseDurationMs: 50,
      });
      pair.update(50);
      pair.update(50);
      pair.update(50);
      expect(pair.isCollapsed()).toBe(true);
    });
  });

  describe("position queries", () => {
    it("isOnPortal matches endA position", () => {
      const pair = createPair({
        positionA: { col: 5, row: 5 },
        positionB: { col: 20, row: 15 },
      });

      expect(pair.isOnPortal({ col: 5, row: 5 })).toBe(true);
    });

    it("isOnPortal matches endB position", () => {
      const pair = createPair({
        positionA: { col: 5, row: 5 },
        positionB: { col: 20, row: 15 },
      });

      expect(pair.isOnPortal({ col: 20, row: 15 })).toBe(true);
    });

    it("isOnPortal returns false for non-portal position", () => {
      const pair = createPair({
        positionA: { col: 5, row: 5 },
        positionB: { col: 20, row: 15 },
      });

      expect(pair.isOnPortal({ col: 10, row: 10 })).toBe(false);
    });

    it("getLinkedExit returns endB when entering from endA", () => {
      const pair = createPair({
        positionA: { col: 5, row: 5 },
        positionB: { col: 20, row: 15 },
      });

      expect(pair.getLinkedExit({ col: 5, row: 5 })).toEqual({
        col: 20,
        row: 15,
      });
    });

    it("getLinkedExit returns endA when entering from endB", () => {
      const pair = createPair({
        positionA: { col: 5, row: 5 },
        positionB: { col: 20, row: 15 },
      });

      expect(pair.getLinkedExit({ col: 20, row: 15 })).toEqual({
        col: 5,
        row: 5,
      });
    });

    it("getLinkedExit returns null for non-portal position", () => {
      const pair = createPair({
        positionA: { col: 5, row: 5 },
        positionB: { col: 20, row: 15 },
      });

      expect(pair.getLinkedExit({ col: 10, row: 10 })).toBeNull();
    });

    it("getLinkedExit returns cloned positions", () => {
      const pair = createPair({
        positionA: { col: 5, row: 5 },
        positionB: { col: 20, row: 15 },
      });

      const exit = pair.getLinkedExit({ col: 5, row: 5 })!;
      exit.col = 99;
      expect(pair.endB.position.col).toBe(20);
    });

    it("getPositions returns both positions as clones", () => {
      const pair = createPair({
        positionA: { col: 3, row: 4 },
        positionB: { col: 10, row: 12 },
      });

      const [posA, posB] = pair.getPositions();
      expect(posA).toEqual({ col: 3, row: 4 });
      expect(posB).toEqual({ col: 10, row: 12 });

      posA.col = 99;
      expect(pair.endA.position.col).toBe(3);
    });
  });
});

// ── Empty-cell placement helpers ────────────────────────────────

describe("findEmptyCells", () => {
  it("returns all grid cells when no occupancy checkers provided", () => {
    const cells = findEmptyCells([]);
    expect(cells.length).toBe(GRID_COLS * GRID_ROWS);
  });

  it("excludes cells flagged as occupied by any checker", () => {
    const occupied: CellOccupancyChecker = (pos) =>
      pos.col === 0 && pos.row === 0;

    const cells = findEmptyCells([occupied]);
    expect(cells.length).toBe(GRID_COLS * GRID_ROWS - 1);
    expect(cells.find((c) => c.col === 0 && c.row === 0)).toBeUndefined();
  });

  it("combines multiple checkers with OR semantics", () => {
    const checkA: CellOccupancyChecker = (pos) => pos.col === 0 && pos.row === 0;
    const checkB: CellOccupancyChecker = (pos) => pos.col === 1 && pos.row === 1;

    const cells = findEmptyCells([checkA, checkB]);
    expect(cells.length).toBe(GRID_COLS * GRID_ROWS - 2);
  });

  it("handles checker that marks all cells as occupied", () => {
    const allOccupied: CellOccupancyChecker = () => true;
    const cells = findEmptyCells([allOccupied]);
    expect(cells.length).toBe(0);
  });
});

describe("pickTwoDistinctCells", () => {
  it("returns null when fewer than 2 candidates", () => {
    expect(pickTwoDistinctCells([])).toBeNull();
    expect(pickTwoDistinctCells([{ col: 0, row: 0 }])).toBeNull();
  });

  it("picks two distinct cells from candidates", () => {
    const candidates: GridPos[] = [
      { col: 0, row: 0 },
      { col: 1, row: 1 },
      { col: 2, row: 2 },
    ];

    const rng = seededRng([0, 0]); // index 0 then adjusted index
    const result = pickTwoDistinctCells(candidates, rng);
    expect(result).not.toBeNull();
    const [a, b] = result!;
    expect(a.col).not.toBe(b.col); // distinct cells
  });

  it("always returns two different cells even with exactly 2 candidates", () => {
    const candidates: GridPos[] = [
      { col: 5, row: 5 },
      { col: 10, row: 10 },
    ];

    for (let i = 0; i < 10; i++) {
      const result = pickTwoDistinctCells(candidates, Math.random);
      expect(result).not.toBeNull();
      const [a, b] = result!;
      expect(a.col !== b.col || a.row !== b.row).toBe(true);
    }
  });

  it("returns cloned positions", () => {
    const candidates: GridPos[] = [
      { col: 5, row: 5 },
      { col: 10, row: 10 },
    ];

    const result = pickTwoDistinctCells(candidates, seededRng([0, 0]))!;
    result[0].col = 99;
    expect(candidates[0].col).toBe(5);
  });

  it("uses deterministic RNG to produce repeatable results", () => {
    const candidates: GridPos[] = [
      { col: 0, row: 0 },
      { col: 5, row: 5 },
      { col: 10, row: 10 },
      { col: 15, row: 15 },
    ];

    const result1 = pickTwoDistinctCells(candidates, seededRng([0.25, 0.5]));
    const result2 = pickTwoDistinctCells(candidates, seededRng([0.25, 0.5]));

    expect(result1).toEqual(result2);
  });
});

describe("findPortalSpawnPositions", () => {
  it("finds two positions on an open board", () => {
    const result = findPortalSpawnPositions([], seededRng([0.1, 0.9]));
    expect(result).not.toBeNull();
    const [a, b] = result!;
    expect(a.col !== b.col || a.row !== b.row).toBe(true);
  });

  it("returns null when board is too full", () => {
    // Block all but one cell
    const blockAll: CellOccupancyChecker = (pos) =>
      !(pos.col === 0 && pos.row === 0);

    const result = findPortalSpawnPositions([blockAll]);
    expect(result).toBeNull();
  });

  it("excludes snake-occupied cells", () => {
    const snakePositions: GridPos[] = [
      { col: 5, row: 5 },
      { col: 6, row: 5 },
      { col: 7, row: 5 },
    ];

    const snakeChecker: CellOccupancyChecker = (pos) =>
      snakePositions.some((sp) => sp.col === pos.col && sp.row === pos.row);

    const result = findPortalSpawnPositions([snakeChecker], seededRng([0.5, 0.3]));
    expect(result).not.toBeNull();
    const [a, b] = result!;

    for (const sp of snakePositions) {
      expect(a.col === sp.col && a.row === sp.row).toBe(false);
      expect(b.col === sp.col && b.row === sp.row).toBe(false);
    }
  });
});

// ── ID generation ───────────────────────────────────────────────

describe("generatePortalPairId", () => {
  beforeEach(() => {
    resetPortalPairIdCounter();
  });

  it("generates unique sequential IDs", () => {
    const id1 = generatePortalPairId();
    const id2 = generatePortalPairId();
    const id3 = generatePortalPairId();

    expect(id1).toBe("portal-1");
    expect(id2).toBe("portal-2");
    expect(id3).toBe("portal-3");
  });

  it("resets counter correctly", () => {
    generatePortalPairId(); // portal-1
    generatePortalPairId(); // portal-2
    resetPortalPairIdCounter();

    expect(generatePortalPairId()).toBe("portal-1");
  });
});

// ── Default constants ───────────────────────────────────────────

describe("Portal constants", () => {
  it("PORTAL_LIFESPAN_MS is 8000 (per spec)", () => {
    expect(PORTAL_LIFESPAN_MS).toBe(8_000);
  });

  it("PORTAL_SPAWN_DURATION_MS is 500", () => {
    expect(PORTAL_SPAWN_DURATION_MS).toBe(500);
  });

  it("PORTAL_COLLAPSE_DURATION_MS is 500", () => {
    expect(PORTAL_COLLAPSE_DURATION_MS).toBe(500);
  });
});

// ── Edge cases ──────────────────────────────────────────────────

describe("PortalPair edge cases", () => {
  it("handles single large update that spans all states", () => {
    const pair = createPair({
      lifespanMs: 1000,
      spawnDurationMs: 200,
      collapseDurationMs: 300,
    });

    // A massive delta that would cross all boundaries in sequence
    // The update only transitions one step at a time per call
    pair.update(500);
    // After 500ms total: spawning is done (200ms), should be active
    // totalElapsed=500 < lifespanMs=1000, so still active
    expect(pair.getState()).toBe("active");
  });

  it("multiple rapid small updates match one big update for state transitions", () => {
    const pair1 = createPair({
      lifespanMs: 1000,
      spawnDurationMs: 200,
    });
    const pair2 = createPair({
      lifespanMs: 1000,
      spawnDurationMs: 200,
    });

    // Advance pair1 in one big step
    pair1.update(300);

    // Advance pair2 in many small steps
    for (let i = 0; i < 300; i++) {
      pair2.update(1);
    }

    expect(pair1.getState()).toBe(pair2.getState());
    expect(pair1.getTotalElapsedMs()).toBe(pair2.getTotalElapsedMs());
  });

  it("portal at grid boundary positions works correctly", () => {
    const pair = createPair({
      positionA: { col: 0, row: 0 },
      positionB: { col: GRID_COLS - 1, row: GRID_ROWS - 1 },
    });

    expect(pair.isOnPortal({ col: 0, row: 0 })).toBe(true);
    expect(pair.isOnPortal({ col: GRID_COLS - 1, row: GRID_ROWS - 1 })).toBe(true);
    expect(pair.getLinkedExit({ col: 0, row: 0 })).toEqual({
      col: GRID_COLS - 1,
      row: GRID_ROWS - 1,
    });
  });
});
