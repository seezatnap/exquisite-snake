import { describe, it, expect, vi } from "vitest";
import { EchoGhost } from "@/game/entities/EchoGhost";
import { GhostFoodBurstQueue } from "@/game/systems/GhostFoodBurstQueue";
import { EchoRewindHook } from "@/game/systems/RewindHook";
import { DEFAULT_MOVE_INTERVAL_MS } from "@/game/utils/grid";
import {
  DELAY_TICKS,
  activateGhostWithFixture,
  createGhostPathFixture,
  createSnakePathFixture,
  expectCollisionGameOverSignal,
  expectFoodBurstAtGhostHead,
  expectFoodBurstEventsAtGridPositions,
  expectGhostFadeState,
  expectGhostHeadPosition,
  expectGhostPositionFromFixture,
  expectSnapshotRestoreHookInvocation,
  makeSegments,
  recordPathIntoGhost,
  withDeterministicTimers,
} from "@/__tests__/echo-ghost-harness";

describe("echo ghost test harness", () => {
  it("provides deterministic fake timer controls in tick and ms units", async () => {
    await withDeterministicTimers(async (timers) => {
      const callback = vi.fn();
      const start = timers.now();
      setTimeout(callback, DELAY_TICKS * timers.tickMs);

      timers.advanceTicks(DELAY_TICKS - 1);
      expect(callback).not.toHaveBeenCalled();

      timers.advanceTicks(1);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(timers.now() - start).toBe(DELAY_TICKS * timers.tickMs);
    });
  });

  it("builds reusable snake and ghost path fixtures with deterministic parity", () => {
    const snakePath = createSnakePathFixture({
      ticks: DELAY_TICKS + 2,
      startHead: { col: 12, row: 7 },
      direction: "right",
      length: 4,
    });
    const ghostFixture = createGhostPathFixture(snakePath);

    expect(snakePath).toHaveLength(DELAY_TICKS + 2);
    expect(ghostFixture.expectedGhostHeadByTick[DELAY_TICKS - 2]).toBeNull();
    expect(ghostFixture.expectedGhostHeadByTick[DELAY_TICKS - 1]).toEqual(
      snakePath[0][0],
    );
    expect(ghostFixture.expectedGhostHeadByTick[DELAY_TICKS]).toEqual(
      snakePath[1][0],
    );
  });

  it("asserts ghost head position from fixture replay", () => {
    const snakePath = createSnakePathFixture({
      ticks: DELAY_TICKS + 3,
      startHead: { col: 20, row: 10 },
      direction: "right",
      length: 3,
    });
    const fixture = createGhostPathFixture(snakePath);
    const ghost = new EchoGhost();

    for (let tick = 0; tick < snakePath.length; tick++) {
      ghost.record(snakePath[tick]);
      expectGhostPositionFromFixture(ghost, fixture, tick);
    }
  });

  it("asserts ghost fade state from near-empty replay buffer", () => {
    const ghost = new EchoGhost(250, DEFAULT_MOVE_INTERVAL_MS, 4);

    ghost.record(makeSegments(10));
    ghost.record(makeSegments(11));

    expectGhostFadeState(ghost, {
      active: true,
      bufferedCount: 1,
      minOpacity: 0,
      maxOpacity: 0.5,
    });
  });

  it("provides collision game-over assertion helper", () => {
    const cameraShakeSpy = vi.fn();
    cameraShakeSpy();

    const sceneLike = {
      getPhase: () => "gameOver",
      getSnake: () => ({
        isAlive: () => false,
      }),
    };

    expectCollisionGameOverSignal(sceneLike, { cameraShakeSpy });
  });

  it("asserts delayed food-burst events at the ghost replay position", () => {
    const queue = new GhostFoodBurstQueue(2);
    const ghost = new EchoGhost(125, DEFAULT_MOVE_INTERVAL_MS);

    ghost.record(makeSegments(5)); // Activate 1-tick delay ghost.
    queue.enqueue();

    ghost.record(makeSegments(6));
    queue.processTick(ghost);

    ghost.record(makeSegments(7));
    const bursts = queue.processTick(ghost);

    expectFoodBurstAtGhostHead(bursts, ghost);
    expectFoodBurstEventsAtGridPositions(bursts, [ghost.getSegments()[0]]);
  });

  it("asserts snapshot/restore hook invocation through shared helper", () => {
    const ghost = new EchoGhost();
    const queue = new GhostFoodBurstQueue(5);
    const hook = new EchoRewindHook(ghost, queue);

    recordPathIntoGhost(ghost, createSnakePathFixture({ ticks: DELAY_TICKS }));
    const snapshot = expectSnapshotRestoreHookInvocation(hook, () => {
      ghost.record(makeSegments(80));
      queue.enqueue();
      queue.processTick(ghost);
    });

    expect(snapshot.ghost).not.toBeNull();
    expect(snapshot.burstQueue).not.toBeNull();
  });

  it("provides reusable active-ghost fixture setup for collision tests", () => {
    const ghost = new EchoGhost();
    activateGhostWithFixture(ghost, [
      { col: 11, row: 10 },
      { col: 10, row: 10 },
      { col: 9, row: 10 },
    ]);

    expectGhostHeadPosition(ghost, { col: 11, row: 10 });
    expectGhostFadeState(ghost, {
      active: true,
      minOpacity: 1,
      maxOpacity: 1,
    });
  });
});
