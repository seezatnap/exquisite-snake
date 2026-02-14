import { beforeEach, describe, expect, it } from "vitest";
import { GRID_COLS, GRID_ROWS, TEXTURE_KEYS } from "@/game/config";
import {
  PARASITE_ECHO_GHOST_POLICY,
  PARASITE_MAGNET_RADIUS_TILES,
  PARASITE_MAGNET_SPEED_BONUS_PER_SEGMENT,
  PARASITE_MAX_SEGMENTS,
  PARASITE_PICKUP_TEXTURE_KEY,
  PARASITE_SPLITTER_INTERVAL_MS,
  Parasite,
  getParasitePickupRenderIdentity,
  ParasiteType,
  resetParasiteIdSequenceForTests,
} from "@/game/entities/Parasite";
import {
  PARASITE_PICKUP_SPAWN_INTERVAL_MS,
  ParasiteManager,
  calculateMagnetSpeedMultiplier,
  createInitialParasiteSharedState,
  validatePhase3IntegrationPoints,
} from "@/game/systems/ParasiteManager";
import type { GridPos } from "@/game/utils/grid";

function sequenceRng(values: readonly number[]): () => number {
  let index = 0;
  return () => {
    const safeIndex = Math.min(index, values.length - 1);
    const value = values[safeIndex] ?? 0;
    index += 1;
    return value;
  };
}

function toGridKey(position: GridPos): string {
  return `${position.col}:${position.row}`;
}

describe("Parasite scaffold constants", () => {
  it("pins required balance constants", () => {
    expect(PARASITE_MAX_SEGMENTS).toBe(3);
    expect(PARASITE_MAGNET_RADIUS_TILES).toBe(2);
    expect(PARASITE_MAGNET_SPEED_BONUS_PER_SEGMENT).toBe(0.1);
    expect(PARASITE_SPLITTER_INTERVAL_MS).toBe(10_000);
    expect(PARASITE_PICKUP_SPAWN_INTERVAL_MS).toBe(8_000);
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

  it("exposes pickup render identity distinct from standard food", () => {
    const render = getParasitePickupRenderIdentity(ParasiteType.Shield);

    expect(render.textureKey).toBe(PARASITE_PICKUP_TEXTURE_KEY);
    expect(render.textureKey).toBe(TEXTURE_KEYS.PARASITE_PICKUP);
    expect(render.textureKey).not.toBe(TEXTURE_KEYS.FOOD);
    expect(render.shape).toBe("rounded-rect");
    expect(render.tint).toBeGreaterThan(0);
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

  it("pulls food one tile toward the nearest magnet segment within radius", () => {
    const manager = new ParasiteManager();
    const seeded = manager.getState();
    seeded.inventory.segments = [
      {
        id: "seg-magnet",
        type: ParasiteType.Magnet,
        attachedAtMs: 1,
        sourcePickupId: "pickup-magnet",
      },
      {
        id: "seg-shield",
        type: ParasiteType.Shield,
        attachedAtMs: 2,
        sourcePickupId: "pickup-shield",
      },
    ];
    manager.replaceState(seeded);

    const pulled = manager.resolveMagnetFoodPull({
      snakeSegments: [
        { col: 10, row: 10 },
        { col: 9, row: 10 },
        { col: 8, row: 10 },
        { col: 7, row: 10 },
      ],
      foodPosition: { col: 7, row: 12 },
      obstaclePositions: [],
    });

    expect(pulled).toEqual({ col: 7, row: 11 });
  });

  it("checks valid pull cells and falls back to an alternate axis when needed", () => {
    const manager = new ParasiteManager();
    const seeded = manager.getState();
    seeded.inventory.segments = [
      {
        id: "seg-magnet",
        type: ParasiteType.Magnet,
        attachedAtMs: 1,
        sourcePickupId: "pickup-magnet",
      },
    ];
    manager.replaceState(seeded);

    const pulled = manager.resolveMagnetFoodPull({
      snakeSegments: [
        { col: 2, row: 1 },
        { col: 1, row: 1 },
      ],
      foodPosition: { col: 0, row: 0 },
      obstaclePositions: [{ col: 1, row: 0 }],
    });

    expect(pulled).toEqual({ col: 0, row: 1 });
  });

  it("does not pull food when out of magnet range or when no valid cell exists", () => {
    const manager = new ParasiteManager();
    const seeded = manager.getState();
    seeded.inventory.segments = [
      {
        id: "seg-magnet",
        type: ParasiteType.Magnet,
        attachedAtMs: 1,
        sourcePickupId: "pickup-magnet",
      },
    ];
    seeded.pickups = [
      {
        id: "pickup-blocker",
        type: ParasiteType.Shield,
        position: { col: 0, row: 1 },
        spawnedAtMs: 0,
      },
    ];
    manager.replaceState(seeded);

    const outsideRadius = manager.resolveMagnetFoodPull({
      snakeSegments: [
        { col: 4, row: 4 },
        { col: 3, row: 4 },
      ],
      foodPosition: { col: 0, row: 0 },
    });
    expect(outsideRadius).toBeNull();

    const blocked = manager.resolveMagnetFoodPull({
      snakeSegments: [
        { col: 1, row: 2 },
        { col: 1, row: 1 },
      ],
      foodPosition: { col: 0, row: 0 },
      obstaclePositions: [{ col: 1, row: 0 }],
    });

    expect(PARASITE_MAGNET_RADIUS_TILES).toBe(2);
    expect(blocked).toBeNull();
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

  it("spawns a pickup only after the spawn interval is reached", () => {
    const manager = new ParasiteManager();

    manager.advanceTimers(PARASITE_PICKUP_SPAWN_INTERVAL_MS - 1);
    const earlySpawn = manager.spawnPickupIfDue({
      snakeSegments: [{ col: 5, row: 5 }],
      foodPosition: { col: 6, row: 5 },
      rng: sequenceRng([0, 0, 0]),
    });
    expect(earlySpawn).toBeNull();

    manager.advanceTimers(1);
    const spawn = manager.spawnPickupIfDue({
      snakeSegments: [{ col: 5, row: 5 }],
      foodPosition: { col: 6, row: 5 },
      obstaclePositions: [{ col: 7, row: 5 }],
      rng: sequenceRng([0, 0, 0]),
      nowMs: 42_000,
    });

    expect(spawn).not.toBeNull();
    expect(spawn?.pickup.spawnedAtMs).toBe(42_000);
    expect(spawn?.render.textureKey).toBe(PARASITE_PICKUP_TEXTURE_KEY);
    expect(spawn?.render.textureKey).not.toBe(TEXTURE_KEYS.FOOD);
    expect(manager.getState().pickups).toHaveLength(1);
  });

  it("spawns only on empty cells (never on snake/food/obstacles/pickups)", () => {
    const manager = new ParasiteManager();
    const seeded = manager.getState();
    seeded.pickups = [
      {
        id: "existing-pickup",
        type: ParasiteType.Magnet,
        position: { col: 0, row: 3 },
        spawnedAtMs: 1_000,
      },
    ];
    seeded.splitterObstacles = [
      {
        id: "existing-obstacle",
        position: { col: 0, row: 4 },
        spawnedAtMs: 1_500,
        sourceSegmentId: null,
      },
    ];
    manager.replaceState(seeded);
    manager.advanceTimers(PARASITE_PICKUP_SPAWN_INTERVAL_MS);

    const snakeSegments: GridPos[] = [
      { col: 0, row: 0 },
      { col: 0, row: 1 },
    ];
    const foodPosition: GridPos = { col: 0, row: 2 };
    const obstaclePositions: GridPos[] = [{ col: 0, row: 5 }];
    const blocked = new Set<string>([
      ...snakeSegments.map(toGridKey),
      toGridKey(foodPosition),
      ...obstaclePositions.map(toGridKey),
      "0:3",
      "0:4",
    ]);

    const spawn = manager.spawnPickupIfDue({
      snakeSegments,
      foodPosition,
      obstaclePositions,
      rng: sequenceRng([0, 0, 0]),
    });

    expect(spawn).not.toBeNull();
    expect(blocked.has(toGridKey(spawn!.pickup.position))).toBe(false);
  });

  it("skips spawning when no empty cell exists", () => {
    const manager = new ParasiteManager();
    const fullGridSnake: GridPos[] = [];

    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        fullGridSnake.push({ col, row });
      }
    }

    manager.advanceTimers(PARASITE_PICKUP_SPAWN_INTERVAL_MS);
    const spawn = manager.spawnPickupIfDue({
      snakeSegments: fullGridSnake,
      foodPosition: null,
      rng: sequenceRng([0]),
    });

    expect(spawn).toBeNull();
    expect(manager.getState().pickups).toEqual([]);
  });

  it("ignores pickup consumption when no pickup exists at the target cell", () => {
    const manager = new ParasiteManager();
    const before = manager.getState();

    const consumed = manager.consumePickupAt({ col: 8, row: 8 }, 1_000);

    expect(consumed).toBeNull();
    expect(manager.getState()).toEqual(before);
  });

  it("consumes pickup into an attached segment and increments run counter", () => {
    const manager = new ParasiteManager();
    const seeded = manager.getState();
    seeded.pickups = [
      {
        id: "pickup-1",
        type: ParasiteType.Shield,
        position: { col: 9, row: 12 },
        spawnedAtMs: 50,
      },
    ];
    manager.replaceState(seeded);

    const consumed = manager.consumePickupAt({ col: 9, row: 12 }, 12_345);

    expect(consumed).toEqual({
      consumedPickup: {
        id: "pickup-1",
        type: ParasiteType.Shield,
        position: { col: 9, row: 12 },
        spawnedAtMs: 50,
      },
      attachedSegment: {
        id: "segment-pickup-1",
        type: ParasiteType.Shield,
        attachedAtMs: 12_345,
        sourcePickupId: "pickup-1",
      },
      shedSegment: null,
      activeSegments: [
        {
          id: "segment-pickup-1",
          type: ParasiteType.Shield,
          attachedAtMs: 12_345,
          sourcePickupId: "pickup-1",
        },
      ],
      parasitesCollected: 1,
    });

    expect(manager.getState().pickups).toEqual([]);
    expect(manager.getActiveSegments()).toEqual([
      {
        id: "segment-pickup-1",
        type: ParasiteType.Shield,
        attachedAtMs: 12_345,
        sourcePickupId: "pickup-1",
      },
    ]);
    expect(manager.getParasitesCollectedCount()).toBe(1);
  });

  it("enforces max-3 FIFO shedding when a fourth pickup is consumed", () => {
    const manager = new ParasiteManager();
    const seeded = manager.getState();
    seeded.parasitesCollected = 3;
    seeded.inventory.segments = [
      {
        id: "seg-1",
        type: ParasiteType.Magnet,
        attachedAtMs: 10,
        sourcePickupId: "pickup-1",
      },
      {
        id: "seg-2",
        type: ParasiteType.Shield,
        attachedAtMs: 20,
        sourcePickupId: "pickup-2",
      },
      {
        id: "seg-3",
        type: ParasiteType.Splitter,
        attachedAtMs: 30,
        sourcePickupId: "pickup-3",
      },
    ];
    seeded.pickups = [
      {
        id: "pickup-4",
        type: ParasiteType.Magnet,
        position: { col: 3, row: 3 },
        spawnedAtMs: 999,
      },
    ];
    manager.replaceState(seeded);

    const consumed = manager.consumePickupAt({ col: 3, row: 3 }, 40);

    expect(consumed?.shedSegment).toEqual({
      id: "seg-1",
      type: ParasiteType.Magnet,
      attachedAtMs: 10,
      sourcePickupId: "pickup-1",
    });
    expect(consumed?.attachedSegment).toEqual({
      id: "segment-pickup-4",
      type: ParasiteType.Magnet,
      attachedAtMs: 40,
      sourcePickupId: "pickup-4",
    });
    expect(consumed?.activeSegments).toEqual([
      {
        id: "seg-2",
        type: ParasiteType.Shield,
        attachedAtMs: 20,
        sourcePickupId: "pickup-2",
      },
      {
        id: "seg-3",
        type: ParasiteType.Splitter,
        attachedAtMs: 30,
        sourcePickupId: "pickup-3",
      },
      {
        id: "segment-pickup-4",
        type: ParasiteType.Magnet,
        attachedAtMs: 40,
        sourcePickupId: "pickup-4",
      },
    ]);
    expect(manager.getActiveSegments()).toHaveLength(PARASITE_MAX_SEGMENTS);
    expect(manager.getParasitesCollectedCount()).toBe(4);
  });
});
