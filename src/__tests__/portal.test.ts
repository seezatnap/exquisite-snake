import { describe, it, expect } from "vitest";
import {
  Portal,
  DEFAULT_PORTAL_LIFECYCLE_DURATIONS,
  createGridPositionKey,
  buildOccupiedCellSet,
  listEmptyCells,
  pickRandomEmptyCell,
  pickRandomEmptyPortalPairCells,
} from "@/game/entities/Portal";

describe("Portal identity and linking", () => {
  it("creates two linked endpoints that share a pair ID", () => {
    const portal = new Portal({
      pairId: "pair-7",
      endpoints: [
        { col: 4, row: 9 },
        { col: 30, row: 12 },
      ],
    });

    const [a, b] = portal.getEndpoints();
    expect(a.pairId).toBe("pair-7");
    expect(b.pairId).toBe("pair-7");
    expect(a.linkedEndpointId).toBe(b.id);
    expect(b.linkedEndpointId).toBe(a.id);

    expect(portal.getLinkedEndpoint(a.id)?.id).toBe(b.id);
    expect(portal.getLinkedEndpoint(b.id)?.id).toBe(a.id);
    expect(portal.getEndpointAt({ col: 4, row: 9 })?.id).toBe(a.id);
    expect(portal.getLinkedEndpointAt({ col: 4, row: 9 })?.id).toBe(b.id);
  });

  it("rejects duplicate endpoint cells and endpoint IDs", () => {
    expect(() => {
      new Portal({
        pairId: "pair-dup-cell",
        endpoints: [
          { col: 6, row: 6 },
          { col: 6, row: 6 },
        ],
      });
    }).toThrow();

    expect(() => {
      new Portal({
        pairId: "pair-dup-id",
        endpoints: [
          { col: 6, row: 6 },
          { col: 7, row: 6 },
        ],
        endpointIds: ["same", "same"],
      });
    }).toThrow();
  });
});

describe("Portal lifecycle timers", () => {
  it("defaults to the 8-second active lifetime and auto-despawns", () => {
    const portal = new Portal({
      pairId: "pair-default",
      endpoints: [
        { col: 1, row: 1 },
        { col: 2, row: 2 },
      ],
    });

    expect(portal.getLifecycleDurations()).toEqual(
      DEFAULT_PORTAL_LIFECYCLE_DURATIONS,
    );
    expect(portal.getState()).toBe("active");
    expect(portal.isTraversable()).toBe(true);
    expect(portal.getMsUntilCollapse()).toBe(8_000);
    expect(portal.getMsUntilDespawn()).toBe(8_000);

    expect(portal.advance(7_999)).toEqual([]);
    expect(portal.getState()).toBe("active");
    expect(portal.getMsUntilDespawn()).toBe(1);

    const transitions = portal.advance(1);
    expect(transitions).toEqual([
      { from: "active", to: "collapsing", elapsedMs: 8_000 },
      { from: "collapsing", to: "collapsed", elapsedMs: 8_000 },
    ]);
    expect(portal.getState()).toBe("collapsed");
    expect(portal.getMsUntilCollapse()).toBe(0);
    expect(portal.getMsUntilDespawn()).toBe(0);
  });

  it("supports explicit spawning/active/collapsing phases", () => {
    const portal = new Portal({
      pairId: "pair-phases",
      endpoints: [
        { col: 3, row: 3 },
        { col: 12, row: 20 },
      ],
      lifecycleDurations: {
        spawningMs: 100,
        activeMs: 500,
        collapsingMs: 200,
      },
    });

    expect(portal.getState()).toBe("spawning");
    expect(portal.isTraversable()).toBe(false);
    expect(portal.getMsUntilCollapse()).toBe(600);
    expect(portal.getMsUntilDespawn()).toBe(800);
    expect(portal.getExitPositionForEntryCell({ col: 3, row: 3 })).toBeNull();

    expect(portal.advance(100)).toEqual([
      { from: "spawning", to: "active", elapsedMs: 100 },
    ]);
    expect(portal.getState()).toBe("active");
    expect(portal.isTraversable()).toBe(true);
    expect(portal.getExitPositionForEntryCell({ col: 3, row: 3 })).toEqual({
      col: 12,
      row: 20,
    });

    expect(portal.advance(500)).toEqual([
      { from: "active", to: "collapsing", elapsedMs: 600 },
    ]);
    expect(portal.getState()).toBe("collapsing");
    expect(portal.getMsUntilDespawn()).toBe(200);

    expect(portal.advance(200)).toEqual([
      { from: "collapsing", to: "collapsed", elapsedMs: 800 },
    ]);
    expect(portal.getState()).toBe("collapsed");
  });

  it("allows forced collapse before timed expiry", () => {
    const portal = new Portal({
      pairId: "pair-force",
      endpoints: [
        { col: 8, row: 8 },
        { col: 9, row: 9 },
      ],
      lifecycleDurations: {
        spawningMs: 50,
        activeMs: 1_000,
        collapsingMs: 150,
      },
    });

    expect(portal.beginCollapse()).toEqual([
      { from: "spawning", to: "collapsing", elapsedMs: 0 },
    ]);
    expect(portal.getState()).toBe("collapsing");
    expect(portal.getMsUntilCollapse()).toBe(0);
    expect(portal.getMsUntilDespawn()).toBe(150);

    expect(portal.advance(150)).toEqual([
      { from: "collapsing", to: "collapsed", elapsedMs: 150 },
    ]);
    expect(portal.beginCollapse()).toEqual([]);
    expect(portal.collapseImmediately()).toEqual([]);
  });
});

describe("Portal empty-cell placement helpers", () => {
  it("builds occupied sets and lists empty cells from occupancy constraints", () => {
    const occupied = buildOccupiedCellSet(
      [{ col: 0, row: 0 }, { col: 0, row: 0 }],
      [{ col: 1, row: 1 }],
    );
    expect(occupied.has(createGridPositionKey({ col: 0, row: 0 }))).toBe(true);
    expect(occupied.has(createGridPositionKey({ col: 1, row: 1 }))).toBe(true);
    expect(occupied.size).toBe(2);

    const emptyCells = listEmptyCells({
      gridCols: 2,
      gridRows: 2,
      occupiedCells: [{ col: 0, row: 0 }],
      blockedCells: [{ col: 1, row: 1 }],
    });
    expect(emptyCells).toEqual([
      { col: 0, row: 1 },
      { col: 1, row: 0 },
    ]);
  });

  it("selects deterministic empty cells from RNG input", () => {
    expect(
      pickRandomEmptyCell({
        gridCols: 3,
        gridRows: 1,
        occupiedCells: [{ col: 1, row: 0 }],
        rng: () => 0,
      }),
    ).toEqual({ col: 0, row: 0 });

    expect(
      pickRandomEmptyCell({
        gridCols: 3,
        gridRows: 1,
        occupiedCells: [{ col: 1, row: 0 }],
        rng: () => 0.99999,
      }),
    ).toEqual({ col: 2, row: 0 });
  });

  it("picks empty linked-pair cells and respects minimum pair distance", () => {
    expect(
      pickRandomEmptyPortalPairCells({
        gridCols: 3,
        gridRows: 1,
        rng: () => 0,
        minManhattanDistance: 2,
      }),
    ).toEqual([
      { col: 0, row: 0 },
      { col: 2, row: 0 },
    ]);

    expect(
      pickRandomEmptyPortalPairCells({
        gridCols: 2,
        gridRows: 1,
        rng: () => 0,
        minManhattanDistance: 2,
      }),
    ).toBeNull();
  });
});
