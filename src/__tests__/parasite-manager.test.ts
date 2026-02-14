import { describe, it, expect } from "vitest";
import {
  MAGNET_RADIUS_TILES,
  MAGNET_SPEED_BONUS_PER_SEGMENT,
  PARASITE_MAX_SEGMENTS,
  PARASITE_PICKUP_SPAWN_CHANCE_PER_INTERVAL,
  PARASITE_PICKUP_SPAWN_INTERVAL_MS,
  PARASITE_TYPES,
  ParasiteType,
  SPLITTER_SCORE_MULTIPLIER,
  SPLITTER_OBSTACLE_INTERVAL_MS,
  createParasiteRuntimeState,
  cloneParasiteRuntimeState,
} from "@/game/entities/Parasite";
import { ParasiteManager } from "@/game/systems/ParasiteManager";
import { Biome } from "@/game/systems/BiomeManager";
import { GRID_COLS, GRID_ROWS } from "@/game/config";
import type { GridPos } from "@/game/utils/grid";

describe("Parasite scaffolding constants", () => {
  it("matches Phase 4 spec constants", () => {
    expect(PARASITE_MAX_SEGMENTS).toBe(3);
    expect(MAGNET_RADIUS_TILES).toBe(2);
    expect(MAGNET_SPEED_BONUS_PER_SEGMENT).toBe(0.1);
    expect(PARASITE_PICKUP_SPAWN_INTERVAL_MS).toBe(3_000);
    expect(PARASITE_PICKUP_SPAWN_CHANCE_PER_INTERVAL).toBe(0.3);
    expect(SPLITTER_OBSTACLE_INTERVAL_MS).toBe(10_000);
    expect(SPLITTER_SCORE_MULTIPLIER).toBe(1.5);
    expect(PARASITE_TYPES).toEqual(["magnet", "shield", "splitter"]);
  });
});

describe("Parasite runtime state models", () => {
  it("creates an empty per-run state with timers, flags, and counters", () => {
    expect(createParasiteRuntimeState()).toEqual({
      pickup: null,
      activeSegments: [],
      splitterObstacles: [],
      timers: {
        pickupSpawnElapsedMs: 0,
        splitterObstacleElapsedMs: 0,
        glowPulseElapsedMs: 0,
      },
      flags: {
        blockNextFoodPickup: false,
      },
      counters: {
        collected: 0,
      },
      nextEntityId: 1,
    });
  });

  it("returns defensive clones so callers cannot mutate source state", () => {
    const base = createParasiteRuntimeState();
    const clone = cloneParasiteRuntimeState(base);
    clone.timers.pickupSpawnElapsedMs = 123;
    clone.flags.blockNextFoodPickup = true;
    clone.counters.collected = 99;
    clone.activeSegments.push({
      id: "segment-1",
      type: ParasiteType.Magnet,
      attachedAtMs: 88,
    });

    expect(base).toEqual(createParasiteRuntimeState());
  });
});

describe("Parasite pickup spawning", () => {
  it("spawns only after the spawn interval elapses", () => {
    const manager = new ParasiteManager();

    manager.advanceTimers(PARASITE_PICKUP_SPAWN_INTERVAL_MS - 1);
    manager.updatePickupSpawn({
      snakeSegments: [{ col: 5, row: 5 }],
      foodPosition: { col: 6, row: 5 },
      rng: () => 0,
    });
    expect(manager.getState().pickup).toBeNull();

    manager.advanceTimers(1);
    manager.updatePickupSpawn({
      snakeSegments: [{ col: 5, row: 5 }],
      foodPosition: { col: 6, row: 5 },
      rng: () => 0,
    });
    expect(manager.getState().pickup).not.toBeNull();
  });

  it("chooses a random cell from only empty candidates", () => {
    const manager = new ParasiteManager();
    manager.advanceTimers(PARASITE_PICKUP_SPAWN_INTERVAL_MS);

    manager.updatePickupSpawn({
      snakeSegments: [
        { col: 0, row: 0 },
        { col: 0, row: 1 },
      ],
      foodPosition: { col: 0, row: 2 },
      obstaclePositions: [{ col: 0, row: 3 }],
      rng: () => 0,
    });

    const pickup = manager.getState().pickup;
    expect(pickup).not.toBeNull();
    expect(pickup!.type).toBe(ParasiteType.Magnet);
    expect(pickup!.position).toEqual({ col: 0, row: 4 });
  });

  it("never spawns on splitter obstacles tracked in parasite state", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.splitterObstacles.push({
      id: "obstacle-1",
      position: { col: 0, row: 0 },
      spawnedAtMs: 100,
    });
    manager.restoreState(snapshot);
    manager.advanceTimers(PARASITE_PICKUP_SPAWN_INTERVAL_MS);

    manager.updatePickupSpawn({
      snakeSegments: [],
      foodPosition: null,
      rng: () => 0,
    });

    expect(manager.getState().pickup?.position).toEqual({ col: 0, row: 1 });
  });

  it("does not spawn if no free cells remain", () => {
    const manager = new ParasiteManager();
    const filledGrid: GridPos[] = [];
    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        filledGrid.push({ col, row });
      }
    }

    manager.advanceTimers(PARASITE_PICKUP_SPAWN_INTERVAL_MS);
    manager.updatePickupSpawn({
      snakeSegments: filledGrid,
      foodPosition: null,
      rng: () => 0,
    });

    expect(manager.getState().pickup).toBeNull();
  });
});

describe("Parasite pickup consumption", () => {
  it("consumes snake-contacted pickups into active segments and increments collected count", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.pickup = {
      id: "pickup-9",
      type: ParasiteType.Shield,
      position: { col: 4, row: 7 },
      spawnedAtMs: 250,
    };
    snapshot.timers.glowPulseElapsedMs = 777;
    snapshot.nextEntityId = 10;
    manager.restoreState(snapshot);

    const result = manager.onPickupContact({
      actor: "snake",
      headPosition: { col: 4, row: 7 },
    });
    expect(result).toEqual({
      consumed: true,
      attachedSegmentId: "segment-10",
      shedSegmentId: null,
    });

    const state = manager.getState();
    expect(state.pickup).toBeNull();
    expect(state.activeSegments).toEqual([
      {
        id: "segment-10",
        type: ParasiteType.Shield,
        attachedAtMs: 777,
      },
    ]);
    expect(state.counters.collected).toBe(1);
    expect(state.nextEntityId).toBe(11);
  });

  it("enforces FIFO shedding when a 4th parasite pickup is consumed", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.activeSegments = [
      { id: "segment-a", type: ParasiteType.Magnet, attachedAtMs: 100 },
      { id: "segment-b", type: ParasiteType.Shield, attachedAtMs: 200 },
      { id: "segment-c", type: ParasiteType.Splitter, attachedAtMs: 300 },
    ];
    snapshot.pickup = {
      id: "pickup-7",
      type: ParasiteType.Shield,
      position: { col: 8, row: 8 },
      spawnedAtMs: 400,
    };
    snapshot.nextEntityId = 8;
    snapshot.counters.collected = 2;
    manager.restoreState(snapshot);

    const result = manager.onPickupContact({
      actor: "snake",
      headPosition: { col: 8, row: 8 },
    });
    expect(result).toEqual({
      consumed: true,
      attachedSegmentId: "segment-8",
      shedSegmentId: "segment-a",
    });

    const state = manager.getState();
    expect(state.activeSegments).toEqual([
      { id: "segment-b", type: ParasiteType.Shield, attachedAtMs: 200 },
      { id: "segment-c", type: ParasiteType.Splitter, attachedAtMs: 300 },
      { id: "segment-8", type: ParasiteType.Shield, attachedAtMs: 0 },
    ]);
    expect(state.counters.collected).toBe(3);
    expect(manager.getMagnetSegmentCount()).toBe(0);
    expect(manager.getShieldSegmentCount()).toBe(2);
    expect(manager.getSplitterSegmentCount()).toBe(1);
  });

  it("does not consume pickups for non-snake actors or non-matching positions", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.pickup = {
      id: "pickup-3",
      type: ParasiteType.Magnet,
      position: { col: 5, row: 5 },
      spawnedAtMs: 50,
    };
    manager.restoreState(snapshot);

    expect(
      manager.onPickupContact({
        actor: "echo-ghost",
        headPosition: { col: 5, row: 5 },
      }),
    ).toEqual({
      consumed: false,
      attachedSegmentId: null,
      shedSegmentId: null,
    });
    expect(
      manager.onPickupContact({
        actor: "snake",
        headPosition: { col: 5, row: 6 },
      }),
    ).toEqual({
      consumed: false,
      attachedSegmentId: null,
      shedSegmentId: null,
    });

    const state = manager.getState();
    expect(state.pickup?.id).toBe("pickup-3");
    expect(state.activeSegments).toEqual([]);
    expect(state.counters.collected).toBe(0);
  });
});

describe("Splitter obstacle spawning", () => {
  it("spawns every 10 seconds while a splitter segment is attached", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.activeSegments.push({
      id: "segment-splitter",
      type: ParasiteType.Splitter,
      attachedAtMs: 10,
    });
    manager.restoreState(snapshot);

    manager.advanceTimers(SPLITTER_OBSTACLE_INTERVAL_MS - 1);
    manager.updateSplitterObstacleSpawn({
      snakeSegments: [],
      foodPosition: null,
      rng: () => 0,
    });
    expect(manager.getState().splitterObstacles).toEqual([]);

    manager.advanceTimers(1);
    manager.updateSplitterObstacleSpawn({
      snakeSegments: [],
      foodPosition: null,
      rng: () => 0,
    });
    expect(manager.getState().splitterObstacles).toHaveLength(1);
    expect(manager.getState().splitterObstacles[0]?.position).toEqual({
      col: 0,
      row: 0,
    });

    manager.advanceTimers(SPLITTER_OBSTACLE_INTERVAL_MS);
    manager.updateSplitterObstacleSpawn({
      snakeSegments: [],
      foodPosition: null,
      rng: () => 0,
    });
    expect(manager.getState().splitterObstacles).toHaveLength(2);
    expect(manager.getState().splitterObstacles[1]?.position).toEqual({
      col: 0,
      row: 1,
    });
  });

  it("places splitter obstacles on random empty cells only", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.activeSegments.push({
      id: "segment-splitter",
      type: ParasiteType.Splitter,
      attachedAtMs: 0,
    });
    snapshot.pickup = {
      id: "pickup-2",
      type: ParasiteType.Magnet,
      position: { col: 0, row: 0 },
      spawnedAtMs: 5,
    };
    manager.restoreState(snapshot);
    manager.advanceTimers(SPLITTER_OBSTACLE_INTERVAL_MS);

    manager.updateSplitterObstacleSpawn({
      snakeSegments: [{ col: 0, row: 1 }],
      foodPosition: { col: 0, row: 2 },
      obstaclePositions: [{ col: 0, row: 3 }],
      rng: () => 0,
    });

    expect(manager.getState().splitterObstacles[0]?.position).toEqual({
      col: 0,
      row: 4,
    });
  });

  it("keeps existing obstacles when splitter is detached and clears elapsed spawn time", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.activeSegments.push({
      id: "segment-splitter",
      type: ParasiteType.Splitter,
      attachedAtMs: 0,
    });
    manager.restoreState(snapshot);
    manager.advanceTimers(SPLITTER_OBSTACLE_INTERVAL_MS);
    manager.updateSplitterObstacleSpawn({
      snakeSegments: [],
      foodPosition: null,
      rng: () => 0,
    });

    const detached = manager.getState();
    detached.activeSegments = [];
    manager.restoreState(detached);
    manager.advanceTimers(SPLITTER_OBSTACLE_INTERVAL_MS);
    manager.updateSplitterObstacleSpawn({
      snakeSegments: [],
      foodPosition: null,
      rng: () => 0,
    });

    const finalState = manager.getState();
    expect(finalState.splitterObstacles).toHaveLength(1);
    expect(finalState.timers.splitterObstacleElapsedMs).toBe(0);
  });
});

describe("ParasiteManager integration hooks", () => {
  it("advances shared parasite timers on each update frame", () => {
    const manager = new ParasiteManager();
    manager.advanceTimers(16);
    manager.advanceTimers(34);

    expect(manager.getState().timers).toEqual({
      pickupSpawnElapsedMs: 50,
      splitterObstacleElapsedMs: 50,
      glowPulseElapsedMs: 50,
    });
  });

  it("keeps Phase 3 movement/collision/score behavior as passthrough by default", () => {
    const manager = new ParasiteManager();

    const movement = manager.onMovementTick({
      actor: "snake",
      deltaMs: 16,
      currentMoveIntervalMs: 125,
      snakeSegments: [{ col: 10, row: 10 }],
      foodPosition: { col: 12, row: 10 },
    });
    expect(movement.nextMoveIntervalMs).toBe(125);
    expect(movement.pulledFoodPosition).toBeNull();

    const collision = manager.onCollisionCheck({
      actor: "snake",
      kind: "wall",
      headPosition: { col: -1, row: 10 },
    });
    expect(collision).toEqual({
      cancelGameOver: false,
      absorbedByShield: false,
      consumedShieldSegmentId: null,
    });

    const score = manager.onScoreEvent({
      actor: "snake",
      source: "food",
      basePoints: 3,
    });
    expect(score).toEqual({
      awardedPoints: 3,
      multiplier: 1,
    });
  });

  it("consumes one shield segment to absorb wall/self collisions and block next food", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.activeSegments = [
      { id: "segment-magnet", type: ParasiteType.Magnet, attachedAtMs: 10 },
      { id: "segment-shield-a", type: ParasiteType.Shield, attachedAtMs: 20 },
      { id: "segment-shield-b", type: ParasiteType.Shield, attachedAtMs: 30 },
    ];
    manager.restoreState(snapshot);

    const wallCollision = manager.onCollisionCheck({
      actor: "snake",
      kind: "wall",
      headPosition: { col: -1, row: 4 },
    });
    expect(wallCollision).toEqual({
      cancelGameOver: true,
      absorbedByShield: true,
      consumedShieldSegmentId: "segment-shield-a",
    });
    expect(manager.getState().flags.blockNextFoodPickup).toBe(true);
    expect(manager.getShieldSegmentCount()).toBe(1);

    const selfCollision = manager.onCollisionCheck({
      actor: "snake",
      kind: "self",
      headPosition: { col: 10, row: 10 },
    });
    expect(selfCollision).toEqual({
      cancelGameOver: true,
      absorbedByShield: true,
      consumedShieldSegmentId: "segment-shield-b",
    });
    expect(manager.getShieldSegmentCount()).toBe(0);
  });

  it("does not absorb collisions without shield segments or for unsupported kinds", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.activeSegments.push({
      id: "segment-shield",
      type: ParasiteType.Shield,
      attachedAtMs: 0,
    });
    manager.restoreState(snapshot);

    expect(
      manager.onCollisionCheck({
        actor: "snake",
        kind: "splitter-obstacle",
        headPosition: { col: 8, row: 8 },
      }),
    ).toEqual({
      cancelGameOver: false,
      absorbedByShield: false,
      consumedShieldSegmentId: null,
    });
    expect(manager.getShieldSegmentCount()).toBe(1);

    manager.restoreState(createParasiteRuntimeState());
    expect(
      manager.onCollisionCheck({
        actor: "snake",
        kind: "wall",
        headPosition: { col: -1, row: 8 },
      }),
    ).toEqual({
      cancelGameOver: false,
      absorbedByShield: false,
      consumedShieldSegmentId: null,
    });
  });

  it("blocks exactly one food contact after a shield absorb", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.activeSegments.push({
      id: "segment-shield",
      type: ParasiteType.Shield,
      attachedAtMs: 0,
    });
    manager.restoreState(snapshot);

    manager.onCollisionCheck({
      actor: "snake",
      kind: "wall",
      headPosition: { col: -1, row: 5 },
    });
    expect(manager.getState().flags.blockNextFoodPickup).toBe(true);

    const firstContact = manager.onFoodContact({
      actor: "snake",
      snakeHead: { col: 4, row: 5 },
      foodPosition: { col: 4, row: 5 },
    });
    expect(firstContact).toEqual({
      allowConsume: false,
      blockedByShieldPenalty: true,
    });
    expect(manager.getState().flags.blockNextFoodPickup).toBe(false);

    const secondContact = manager.onFoodContact({
      actor: "snake",
      snakeHead: { col: 4, row: 5 },
      foodPosition: { col: 4, row: 5 },
    });
    expect(secondContact).toEqual({
      allowConsume: true,
      blockedByShieldPenalty: false,
    });
  });

  it("applies Splitter score multiplier across all score sources while attached", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.activeSegments.push({
      id: "segment-splitter",
      type: ParasiteType.Splitter,
      attachedAtMs: 12,
    });
    manager.restoreState(snapshot);

    const sources = ["food", "system", "bonus"] as const;
    for (const source of sources) {
      expect(
        manager.onScoreEvent({
          actor: "snake",
          source,
          basePoints: 1,
        }),
      ).toEqual({
        awardedPoints: 1.5,
        multiplier: 1.5,
      });
    }
  });

  it("only multiplies positive score gains while Splitter is attached", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.activeSegments.push({
      id: "segment-splitter",
      type: ParasiteType.Splitter,
      attachedAtMs: 90,
    });
    manager.restoreState(snapshot);

    expect(
      manager.onScoreEvent({
        actor: "snake",
        source: "system",
        basePoints: 0,
      }),
    ).toEqual({
      awardedPoints: 0,
      multiplier: 1,
    });

    expect(
      manager.onScoreEvent({
        actor: "snake",
        source: "bonus",
        basePoints: -4,
      }),
    ).toEqual({
      awardedPoints: -4,
      multiplier: 1,
    });
  });

  it("enforces Echo Ghost exclusions in parasite hooks", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.activeSegments = [
      { id: "segment-magnet", type: ParasiteType.Magnet, attachedAtMs: 10 },
      { id: "segment-shield", type: ParasiteType.Shield, attachedAtMs: 20 },
      { id: "segment-splitter", type: ParasiteType.Splitter, attachedAtMs: 30 },
    ];
    snapshot.pickup = {
      id: "pickup-echo",
      type: ParasiteType.Magnet,
      position: { col: 1, row: 0 },
      spawnedAtMs: 40,
    };
    snapshot.flags.blockNextFoodPickup = true;
    manager.restoreState(snapshot);

    const movement = manager.onMovementTick({
      actor: "echo-ghost",
      deltaMs: 16,
      currentMoveIntervalMs: 125,
      snakeSegments: [{ col: 0, row: 0 }],
      foodPosition: { col: 1, row: 0 },
    });
    expect(movement.nextMoveIntervalMs).toBe(125);
    expect(movement.pulledFoodPosition).toBeNull();
    expect(movement.magnetSegments).toBe(0);

    const pickupContact = manager.onPickupContact({
      actor: "echo-ghost",
      headPosition: { col: 1, row: 0 },
    });
    expect(pickupContact).toEqual({
      consumed: false,
      attachedSegmentId: null,
      shedSegmentId: null,
    });

    const collision = manager.onCollisionCheck({
      actor: "echo-ghost",
      kind: "splitter-obstacle",
      headPosition: { col: 4, row: 4 },
    });
    expect(collision).toEqual({
      cancelGameOver: false,
      absorbedByShield: false,
      consumedShieldSegmentId: null,
    });

    const foodContact = manager.onFoodContact({
      actor: "echo-ghost",
      snakeHead: { col: 1, row: 1 },
      foodPosition: { col: 1, row: 1 },
    });
    expect(foodContact).toEqual({
      allowConsume: false,
      blockedByShieldPenalty: false,
    });

    const score = manager.onScoreEvent({
      actor: "echo-ghost",
      source: "food",
      basePoints: 5,
    });
    expect(score).toEqual({
      awardedPoints: 0,
      multiplier: 1,
    });

    const state = manager.getState();
    expect(state.pickup?.id).toBe("pickup-echo");
    expect(state.activeSegments).toEqual(snapshot.activeSegments);
    expect(state.flags.blockNextFoodPickup).toBe(true);
  });

  it("applies stacked magnet speed bonuses from base movement interval", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.activeSegments = [
      { id: "segment-1", type: ParasiteType.Magnet, attachedAtMs: 10 },
      { id: "segment-2", type: ParasiteType.Shield, attachedAtMs: 20 },
      { id: "segment-3", type: ParasiteType.Magnet, attachedAtMs: 30 },
    ];
    manager.restoreState(snapshot);

    const movement = manager.onMovementTick({
      actor: "snake",
      deltaMs: 16,
      currentMoveIntervalMs: 125,
      baseMoveIntervalMs: 125,
      snakeSegments: [
        { col: 8, row: 5 },
        { col: 7, row: 5 },
        { col: 6, row: 5 },
        { col: 5, row: 5 },
      ],
      foodPosition: { col: 20, row: 20 },
    });

    expect(movement.magnetSegments).toBe(2);
    expect(movement.nextMoveIntervalMs).toBeCloseTo(125 / 1.2, 6);
  });

  it("returns to base movement interval when no magnet segments remain", () => {
    const manager = new ParasiteManager();
    const withMagnet = createParasiteRuntimeState();
    withMagnet.activeSegments = [
      { id: "segment-1", type: ParasiteType.Magnet, attachedAtMs: 10 },
    ];
    manager.restoreState(withMagnet);

    manager.onMovementTick({
      actor: "snake",
      deltaMs: 16,
      currentMoveIntervalMs: 125,
      baseMoveIntervalMs: 125,
      snakeSegments: [
        { col: 8, row: 5 },
        { col: 7, row: 5 },
        { col: 6, row: 5 },
      ],
      foodPosition: { col: 12, row: 10 },
    });

    manager.restoreState(createParasiteRuntimeState());

    const movement = manager.onMovementTick({
      actor: "snake",
      deltaMs: 16,
      currentMoveIntervalMs: 113.636,
      baseMoveIntervalMs: 125,
      snakeSegments: [
        { col: 8, row: 5 },
        { col: 7, row: 5 },
        { col: 6, row: 5 },
      ],
      foodPosition: { col: 12, row: 10 },
    });

    expect(movement.magnetSegments).toBe(0);
    expect(movement.nextMoveIntervalMs).toBe(125);
  });

  it("does not alter movement interval without magnets when no speed reset is pending", () => {
    const manager = new ParasiteManager();

    const movement = manager.onMovementTick({
      actor: "snake",
      deltaMs: 16,
      currentMoveIntervalMs: 100,
      baseMoveIntervalMs: 125,
      snakeSegments: [
        { col: 8, row: 5 },
        { col: 7, row: 5 },
        { col: 6, row: 5 },
      ],
      foodPosition: { col: 12, row: 10 },
    });

    expect(movement.magnetSegments).toBe(0);
    expect(movement.nextMoveIntervalMs).toBe(100);
  });

  it("pulls food one tile toward an in-range magnet segment", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.activeSegments = [
      { id: "segment-1", type: ParasiteType.Magnet, attachedAtMs: 1 },
    ];
    manager.restoreState(snapshot);

    const movement = manager.onMovementTick({
      actor: "snake",
      deltaMs: 16,
      currentMoveIntervalMs: 125,
      baseMoveIntervalMs: 125,
      snakeSegments: [
        { col: 6, row: 5 },
        { col: 5, row: 5 },
        { col: 4, row: 5 },
      ],
      foodPosition: { col: 5, row: 6 },
    });

    expect(movement.pulledFoodPosition).toEqual({ col: 4, row: 6 });
  });

  it("skips magnet pull when all closer cells are invalid", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.activeSegments = [
      { id: "segment-1", type: ParasiteType.Magnet, attachedAtMs: 1 },
    ];
    manager.restoreState(snapshot);

    const movement = manager.onMovementTick({
      actor: "snake",
      deltaMs: 16,
      currentMoveIntervalMs: 125,
      baseMoveIntervalMs: 125,
      snakeSegments: [
        { col: 6, row: 5 },
        { col: 5, row: 5 },
        { col: 4, row: 5 },
      ],
      foodPosition: { col: 5, row: 6 },
      blockedFoodCells: [{ col: 4, row: 6 }],
    });

    expect(movement.pulledFoodPosition).toBeNull();
  });

  it("exposes biome lifecycle hooks and config constants for MainScene integration", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.splitterObstacles.push({
      id: "obstacle-1",
      position: { col: 2, row: 2 },
      spawnedAtMs: 100,
    });
    snapshot.timers.splitterObstacleElapsedMs = 3_000;
    manager.restoreState(snapshot);

    expect(() => manager.onBiomeEnter(Biome.NeonCity)).not.toThrow();
    expect(() => manager.onBiomeExit(Biome.NeonCity)).not.toThrow();
    expect(() =>
      manager.onBiomeTransition({
        from: Biome.NeonCity,
        to: Biome.IceCavern,
      })
    ).not.toThrow();
    expect(manager.getState().splitterObstacles).toEqual([]);
    expect(manager.getState().timers.splitterObstacleElapsedMs).toBe(0);

    const withRunEndObstacle = createParasiteRuntimeState();
    withRunEndObstacle.splitterObstacles.push({
      id: "obstacle-2",
      position: { col: 3, row: 3 },
      spawnedAtMs: 200,
    });
    manager.restoreState(withRunEndObstacle);
    manager.onRunEnd();
    expect(manager.getState().splitterObstacles).toEqual([]);

    expect(manager.getConstants()).toEqual({
      maxSegments: 3,
      magnetRadiusTiles: 2,
      magnetSpeedBonusPerSegment: 0.1,
      splitterObstacleIntervalMs: 10_000,
    });
  });
});

describe("Task #12 regression coverage", () => {
  const posKey = (pos: GridPos): string => `${pos.col}:${pos.row}`;

  it("validates parasite pickup spawn chooses an empty cell only", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.splitterObstacles = [
      { id: "obstacle-a", position: { col: 3, row: 0 }, spawnedAtMs: 0 },
      { id: "obstacle-b", position: { col: 5, row: 0 }, spawnedAtMs: 0 },
    ];
    manager.restoreState(snapshot);
    manager.advanceTimers(PARASITE_PICKUP_SPAWN_INTERVAL_MS);

    const snakeSegments = [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ];
    const foodPosition = { col: 2, row: 0 };
    const obstaclePositions = [{ col: 4, row: 0 }];
    manager.updatePickupSpawn({
      snakeSegments,
      foodPosition,
      obstaclePositions,
      rng: () => 0,
    });

    const pickup = manager.getState().pickup;
    expect(pickup).not.toBeNull();
    const occupied = new Set<string>([
      ...snakeSegments.map(posKey),
      posKey(foodPosition),
      ...obstaclePositions.map(posKey),
      ...snapshot.splitterObstacles.map((obstacle) => posKey(obstacle.position)),
    ]);
    expect(occupied.has(posKey(pickup!.position))).toBe(false);
  });

  it("enforces FIFO cap order when repeatedly consuming a 4th+ pickup", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.activeSegments = [
      { id: "segment-oldest", type: ParasiteType.Magnet, attachedAtMs: 100 },
      { id: "segment-middle", type: ParasiteType.Shield, attachedAtMs: 200 },
      { id: "segment-newest", type: ParasiteType.Splitter, attachedAtMs: 300 },
    ];
    snapshot.pickup = {
      id: "pickup-1",
      type: ParasiteType.Magnet,
      position: { col: 8, row: 8 },
      spawnedAtMs: 400,
    };
    snapshot.nextEntityId = 10;
    manager.restoreState(snapshot);

    const first = manager.onPickupContact({
      actor: "snake",
      headPosition: { col: 8, row: 8 },
    });
    expect(first).toEqual({
      consumed: true,
      attachedSegmentId: "segment-10",
      shedSegmentId: "segment-oldest",
    });
    expect(manager.getState().activeSegments.map((segment) => segment.id)).toEqual([
      "segment-middle",
      "segment-newest",
      "segment-10",
    ]);

    const nextState = manager.getState();
    nextState.pickup = {
      id: "pickup-2",
      type: ParasiteType.Shield,
      position: { col: 8, row: 8 },
      spawnedAtMs: 500,
    };
    manager.restoreState(nextState);

    const second = manager.onPickupContact({
      actor: "snake",
      headPosition: { col: 8, row: 8 },
    });
    expect(second).toEqual({
      consumed: true,
      attachedSegmentId: "segment-11",
      shedSegmentId: "segment-middle",
    });

    const finalIds = manager.getState().activeSegments.map((segment) => segment.id);
    expect(finalIds).toEqual(["segment-newest", "segment-10", "segment-11"]);
    expect(manager.getState().activeSegments).toHaveLength(PARASITE_MAX_SEGMENTS);
  });

  it("applies magnet pull and stacked movement speed bonus together", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.activeSegments = [
      { id: "segment-magnet-a", type: ParasiteType.Magnet, attachedAtMs: 10 },
      { id: "segment-shield", type: ParasiteType.Shield, attachedAtMs: 20 },
      { id: "segment-magnet-b", type: ParasiteType.Magnet, attachedAtMs: 30 },
    ];
    manager.restoreState(snapshot);

    const movement = manager.onMovementTick({
      actor: "snake",
      deltaMs: 16,
      currentMoveIntervalMs: 120,
      baseMoveIntervalMs: 120,
      snakeSegments: [
        { col: 6, row: 5 },
        { col: 5, row: 5 },
        { col: 4, row: 5 },
        { col: 3, row: 5 },
      ],
      foodPosition: { col: 5, row: 7 },
    });

    expect(movement.magnetSegments).toBe(2);
    expect(movement.nextMoveIntervalMs).toBeCloseTo(120 / 1.2, 6);
    expect(movement.pulledFoodPosition).toEqual({ col: 5, row: 6 });
  });

  it("transitions shield blocked-food state after absorb and re-arms on next absorb", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.activeSegments = [
      { id: "segment-shield-a", type: ParasiteType.Shield, attachedAtMs: 0 },
      { id: "segment-shield-b", type: ParasiteType.Shield, attachedAtMs: 1 },
    ];
    manager.restoreState(snapshot);

    expect(
      manager.onCollisionCheck({
        actor: "snake",
        kind: "wall",
        headPosition: { col: -1, row: 10 },
      }),
    ).toEqual({
      cancelGameOver: true,
      absorbedByShield: true,
      consumedShieldSegmentId: "segment-shield-a",
    });
    expect(manager.getState().flags.blockNextFoodPickup).toBe(true);

    expect(
      manager.onFoodContact({
        actor: "snake",
        snakeHead: { col: 4, row: 4 },
        foodPosition: { col: 4, row: 4 },
      }),
    ).toEqual({
      allowConsume: false,
      blockedByShieldPenalty: true,
    });
    expect(manager.getState().flags.blockNextFoodPickup).toBe(false);

    expect(
      manager.onFoodContact({
        actor: "snake",
        snakeHead: { col: 4, row: 4 },
        foodPosition: { col: 4, row: 4 },
      }),
    ).toEqual({
      allowConsume: true,
      blockedByShieldPenalty: false,
    });

    expect(
      manager.onCollisionCheck({
        actor: "snake",
        kind: "self",
        headPosition: { col: 6, row: 6 },
      }),
    ).toEqual({
      cancelGameOver: true,
      absorbedByShield: true,
      consumedShieldSegmentId: "segment-shield-b",
    });
    expect(manager.getState().flags.blockNextFoodPickup).toBe(true);
    expect(manager.getShieldSegmentCount()).toBe(0);
  });

  it("applies splitter multiplier only while splitter remains attached", () => {
    const manager = new ParasiteManager();
    const snapshot = createParasiteRuntimeState();
    snapshot.activeSegments.push({
      id: "segment-splitter",
      type: ParasiteType.Splitter,
      attachedAtMs: 10,
    });
    manager.restoreState(snapshot);

    expect(
      manager.onScoreEvent({
        actor: "snake",
        source: "food",
        basePoints: 2,
      }),
    ).toEqual({
      awardedPoints: 3,
      multiplier: 1.5,
    });

    const detached = manager.getState();
    detached.activeSegments = [];
    manager.restoreState(detached);
    expect(
      manager.onScoreEvent({
        actor: "snake",
        source: "food",
        basePoints: 2,
      }),
    ).toEqual({
      awardedPoints: 2,
      multiplier: 1,
    });
  });
});
