import { describe, expect, it } from "vitest";
import { DEFAULT_PORTAL_LIFECYCLE_DURATIONS } from "@/game/entities/Portal";
import {
  DEFAULT_PORTAL_SPAWN_INTERVAL_RANGE_MS,
  PortalManager,
} from "@/game/systems/PortalManager";

describe("PortalManager spawn cadence", () => {
  it("uses a randomized default spawn interval near 30 seconds", () => {
    const minRollManager = new PortalManager({ rng: () => 0 });
    minRollManager.startRun();
    expect(minRollManager.getMsUntilNextSpawn()).toBe(
      DEFAULT_PORTAL_SPAWN_INTERVAL_RANGE_MS.minMs,
    );

    const maxRollManager = new PortalManager({ rng: () => 0.999999 });
    maxRollManager.startRun();
    expect(maxRollManager.getMsUntilNextSpawn()).toBe(
      DEFAULT_PORTAL_SPAWN_INTERVAL_RANGE_MS.maxMs,
    );
  });

  it("spawns linked pairs on valid empty cells when the timer elapses", () => {
    const manager = new PortalManager({
      rng: () => 0,
      gridCols: 3,
      gridRows: 2,
      spawnIntervalRangeMs: { minMs: 30_000, maxMs: 30_000 },
    });
    manager.startRun();

    const occupiedCells = [{ col: 0, row: 0 }];
    const blockedCells = [{ col: 0, row: 1 }];

    expect(manager.update(29_999, { occupiedCells, blockedCells }).spawnedPairs).toEqual(
      [],
    );

    const spawnResult = manager.update(1, { occupiedCells, blockedCells });
    expect(spawnResult.spawnedPairs).toHaveLength(1);
    expect(spawnResult.spawnedPairs[0]).toEqual({
      pairId: "portal-pair-1",
      endpoints: [
        { col: 1, row: 0 },
        { col: 1, row: 1 },
      ],
    });

    const activePortal = manager.getActivePortal();
    expect(activePortal?.getState()).toBe("active");
    expect(activePortal?.getLifecycleDurations()).toEqual(
      DEFAULT_PORTAL_LIFECYCLE_DURATIONS,
    );
    expect(activePortal?.getMsUntilDespawn()).toBe(8_000);
  });
});

describe("PortalManager portal lifecycle", () => {
  it("collapses and despawns each pair 8 seconds after spawn", () => {
    const manager = new PortalManager({
      rng: () => 0,
      spawnIntervalRangeMs: { minMs: 25_000, maxMs: 25_000 },
    });
    manager.startRun();
    manager.update(25_000);

    expect(manager.getActivePortal()).not.toBeNull();
    expect(manager.update(7_999).despawnedPairIds).toEqual([]);

    const collapseResult = manager.update(1);
    expect(collapseResult.lifecycleTransitions).toEqual([
      {
        pairId: "portal-pair-1",
        transition: { from: "active", to: "collapsing", elapsedMs: 8_000 },
      },
      {
        pairId: "portal-pair-1",
        transition: { from: "collapsing", to: "collapsed", elapsedMs: 8_000 },
      },
    ]);
    expect(collapseResult.despawnedPairIds).toEqual(["portal-pair-1"]);
    expect(manager.getActivePortal()).toBeNull();
  });

  it("does not spawn a pair when no valid empty pair cells exist", () => {
    const manager = new PortalManager({
      rng: () => 0,
      gridCols: 1,
      gridRows: 1,
      spawnIntervalRangeMs: { minMs: 30_000, maxMs: 30_000 },
    });
    manager.startRun();

    const occupiedCells = [{ col: 0, row: 0 }];
    const firstResult = manager.update(30_000, { occupiedCells });
    expect(firstResult.spawnedPairs).toEqual([]);
    expect(manager.getActivePortal()).toBeNull();
    expect(manager.getMsUntilNextSpawn()).toBe(30_000);

    const secondResult = manager.update(30_000, { occupiedCells });
    expect(secondResult.spawnedPairs).toEqual([]);
    expect(manager.getActivePortal()).toBeNull();
  });

  it("processes multiple spawn/despawn cycles in one large update deterministically", () => {
    const manager = new PortalManager({
      rng: () => 0,
      spawnIntervalRangeMs: { minMs: 30_000, maxMs: 30_000 },
    });
    manager.startRun();

    const result = manager.update(76_000);

    expect(result.spawnedPairs.map((event) => event.pairId)).toEqual([
      "portal-pair-1",
      "portal-pair-2",
    ]);
    expect(result.despawnedPairIds).toEqual(["portal-pair-1", "portal-pair-2"]);
    expect(result.lifecycleTransitions).toHaveLength(4);
    expect(manager.getActivePortal()).toBeNull();
    expect(manager.getMsUntilNextSpawn()).toBe(14_000);
  });
});
