import { describe, it, expect } from "vitest";
import {
  MAGNET_RADIUS_TILES,
  MAGNET_SPEED_BONUS_PER_SEGMENT,
  PARASITE_MAX_SEGMENTS,
  PARASITE_TYPES,
  ParasiteType,
  SPLITTER_OBSTACLE_INTERVAL_MS,
  createParasiteRuntimeState,
  cloneParasiteRuntimeState,
} from "@/game/entities/Parasite";
import { ParasiteManager } from "@/game/systems/ParasiteManager";
import { Biome } from "@/game/systems/BiomeManager";

describe("Parasite scaffolding constants", () => {
  it("matches Phase 4 spec constants", () => {
    expect(PARASITE_MAX_SEGMENTS).toBe(3);
    expect(MAGNET_RADIUS_TILES).toBe(2);
    expect(MAGNET_SPEED_BONUS_PER_SEGMENT).toBe(0.1);
    expect(SPLITTER_OBSTACLE_INTERVAL_MS).toBe(10_000);
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

  it("enforces Echo Ghost exclusions in parasite hooks", () => {
    const manager = new ParasiteManager();

    const movement = manager.onMovementTick({
      actor: "echo-ghost",
      deltaMs: 16,
      currentMoveIntervalMs: 125,
      snakeSegments: [{ col: 0, row: 0 }],
      foodPosition: { col: 1, row: 0 },
    });
    expect(movement.nextMoveIntervalMs).toBe(125);

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
  });

  it("exposes biome lifecycle hooks and config constants for MainScene integration", () => {
    const manager = new ParasiteManager();

    expect(() => manager.onBiomeEnter(Biome.NeonCity)).not.toThrow();
    expect(() => manager.onBiomeExit(Biome.NeonCity)).not.toThrow();
    expect(() =>
      manager.onBiomeTransition({
        from: Biome.NeonCity,
        to: Biome.IceCavern,
      })
    ).not.toThrow();

    expect(manager.getConstants()).toEqual({
      maxSegments: 3,
      magnetRadiusTiles: 2,
      magnetSpeedBonusPerSegment: 0.1,
      splitterObstacleIntervalMs: 10_000,
    });
  });
});
