import { beforeEach, describe, expect, it } from "vitest";
import {
  PARASITE_ECHO_GHOST_POLICY,
  PARASITE_MAGNET_RADIUS_TILES,
  PARASITE_MAGNET_SPEED_BONUS_PER_SEGMENT,
  PARASITE_MAX_SEGMENTS,
  PARASITE_SPLITTER_INTERVAL_MS,
  Parasite,
  ParasiteType,
  resetParasiteIdSequenceForTests,
} from "@/game/entities/Parasite";
import {
  ParasiteManager,
  calculateMagnetSpeedMultiplier,
  createInitialParasiteSharedState,
  validatePhase3IntegrationPoints,
} from "@/game/systems/ParasiteManager";

describe("Parasite scaffold constants", () => {
  it("pins required balance constants", () => {
    expect(PARASITE_MAX_SEGMENTS).toBe(3);
    expect(PARASITE_MAGNET_RADIUS_TILES).toBe(2);
    expect(PARASITE_MAGNET_SPEED_BONUS_PER_SEGMENT).toBe(0.1);
    expect(PARASITE_SPLITTER_INTERVAL_MS).toBe(10_000);
  });

  it("marks Echo Ghost as excluded from parasite interactions", () => {
    expect(PARASITE_ECHO_GHOST_POLICY).toEqual({
      ignoresPickups: true,
      ignoresObstacles: true,
      ignoresParasiteEffects: true,
    });
  });
});

describe("Parasite entity scaffold", () => {
  beforeEach(() => {
    resetParasiteIdSequenceForTests();
  });

  it("captures type/position metadata and supports consume snapshots", () => {
    const parasite = new Parasite(
      ParasiteType.Magnet,
      { col: 4, row: 7 },
      123,
    );

    expect(parasite.getId()).toBe("parasite-1");
    expect(parasite.getType()).toBe(ParasiteType.Magnet);
    expect(parasite.getPosition()).toEqual({ col: 4, row: 7 });
    expect(parasite.isConsumed()).toBe(false);

    parasite.setPosition({ col: 6, row: 8 });
    parasite.markConsumed();

    expect(parasite.isConsumed()).toBe(true);
    expect(parasite.toSnapshot()).toEqual({
      id: "parasite-1",
      type: ParasiteType.Magnet,
      position: { col: 6, row: 8 },
      spawnedAtMs: 123,
      consumed: true,
    });
  });
});

describe("ParasiteManager scaffold", () => {
  it("initializes run state with empty inventory and zeroed timers", () => {
    const state = createInitialParasiteSharedState();
    expect(state.inventory.maxSegments).toBe(PARASITE_MAX_SEGMENTS);
    expect(state.inventory.segments).toEqual([]);
    expect(state.pickups).toEqual([]);
    expect(state.splitterObstacles).toEqual([]);
    expect(state.parasitesCollected).toBe(0);
    expect(state.blockedFoodCharges).toBe(0);
    expect(state.timers).toEqual({
      elapsedRunMs: 0,
      pickupSpawnElapsedMs: 0,
      splitterObstacleElapsedMs: 0,
    });
  });

  it("validates all required Phase 3 hook categories", () => {
    const emptyReport = validatePhase3IntegrationPoints({});
    expect(emptyReport.ready).toBe(false);
    expect(emptyReport.missing).toEqual([
      "movement",
      "collision",
      "scoring",
      "biomeChange",
      "echoGhost",
    ]);

    const readyReport = validatePhase3IntegrationPoints({
      movement: () => {},
      collision: () => {},
      scoring: (context) => context.basePoints,
      biomeChange: () => {},
      echoGhost: () => {},
    });
    expect(readyReport.ready).toBe(true);
    expect(readyReport.missing).toEqual([]);
  });

  it("exposes magnet multiplier helper with max-segment clamping", () => {
    expect(calculateMagnetSpeedMultiplier(0)).toBe(1);
    expect(calculateMagnetSpeedMultiplier(1)).toBeCloseTo(1.1);
    expect(calculateMagnetSpeedMultiplier(3)).toBeCloseTo(1.3);
    expect(calculateMagnetSpeedMultiplier(999)).toBeCloseTo(1.3);
  });

  it("tracks splitter timer cadence only while splitter is attached", () => {
    const manager = new ParasiteManager();
    const baseTick = manager.advanceTimers(4_000);
    expect(baseTick.hasActiveSplitter).toBe(false);
    expect(baseTick.splitterTicksDue).toBe(0);
    expect(manager.getState().timers.splitterObstacleElapsedMs).toBe(0);

    const seededState = manager.getState();
    seededState.inventory.segments.push({
      id: "seg-splitter",
      type: ParasiteType.Splitter,
      attachedAtMs: 0,
      sourcePickupId: null,
    });
    manager.replaceState(seededState);

    const tick = manager.advanceTimers(25_000);
    expect(tick.hasActiveSplitter).toBe(true);
    expect(tick.splitterTicksDue).toBe(2);
    expect(manager.getState().timers.splitterObstacleElapsedMs).toBe(5_000);

    const clearedState = manager.getState();
    clearedState.inventory.segments = [];
    manager.replaceState(clearedState);
    manager.advanceTimers(500);

    expect(manager.getState().timers.splitterObstacleElapsedMs).toBe(0);
  });

  it("derives magnet speed multiplier from attached segments", () => {
    const manager = new ParasiteManager();
    const state = manager.getState();
    state.inventory.segments = [
      {
        id: "seg-magnet-1",
        type: ParasiteType.Magnet,
        attachedAtMs: 0,
        sourcePickupId: null,
      },
      {
        id: "seg-magnet-2",
        type: ParasiteType.Magnet,
        attachedAtMs: 10,
        sourcePickupId: null,
      },
      {
        id: "seg-shield",
        type: ParasiteType.Shield,
        attachedAtMs: 20,
        sourcePickupId: null,
      },
    ];
    manager.replaceState(state);

    expect(manager.getMagnetSpeedMultiplier()).toBeCloseTo(1.2);
    expect(manager.isEchoGhostExcludedFromParasites()).toBe(true);
  });

  it("returns defensive state snapshots", () => {
    const manager = new ParasiteManager();
    const state = manager.getState();
    state.inventory.segments.push({
      id: "external-mutation",
      type: ParasiteType.Shield,
      attachedAtMs: 0,
      sourcePickupId: null,
    });

    expect(manager.getState().inventory.segments).toEqual([]);
  });
});
