import { describe, expect, it } from "vitest";
import { ECHO_DELAY_MS, EchoGhost } from "@/game/entities/EchoGhost";
import { GhostFoodBurstQueue } from "@/game/systems/GhostFoodBurstQueue";
import { type GridPos, gridToPixel } from "@/game/utils/grid";
import {
  DELAY_TICKS,
  createGhostPathFixture,
  createSnakePathFixture,
  expectFoodBurstAtGhostHead,
  expectFoodBurstEventsAtGridPositions,
  withDeterministicTimers,
} from "@/__tests__/echo-ghost-harness";

describe("Ghost-food burst delayed replay position", () => {
  it("fires exactly 5 seconds after food consumption at ghost delayed replay coordinates, not the live snake head", async () => {
    await withDeterministicTimers((timers) => {
      const ghost = new EchoGhost();
      const queue = new GhostFoodBurstQueue();
      const foodConsumedTick = 0;

      const snakePath = createSnakePathFixture({
        ticks: DELAY_TICKS + 4,
        startHead: { col: 7, row: 13 },
        direction: "right",
        length: 4,
      });
      const ghostFixture = createGhostPathFixture(snakePath);

      let tick = 0;
      let consumedAtMs: number | null = null;
      let emittedAtMs: number | null = null;
      let emittedTick: number | null = null;
      let emittedBurst: { x: number; y: number } | null = null;
      let emissionCount = 0;
      let liveHeadAtEmission: GridPos | null = null;
      let delayedGhostHeadAtEmission: GridPos | null = null;

      const loop = setInterval(() => {
        if (tick >= snakePath.length) {
          clearInterval(loop);
          return;
        }

        const liveSegments = snakePath[tick];

        // Match MainScene ordering: ghost updates and queued bursts process
        // before new food-consumption enqueue events for this tick.
        ghost.record(liveSegments);
        const bursts = queue.processTick(ghost);

        if (tick === foodConsumedTick) {
          consumedAtMs = timers.now();
          queue.enqueue();
        }

        if (bursts.length > 0) {
          emissionCount += bursts.length;
          emittedAtMs = timers.now();
          emittedTick = tick;
          emittedBurst = bursts[0];
          liveHeadAtEmission = { ...liveSegments[0] };

          const expectedGhostHead = ghostFixture.expectedGhostHeadByTick[tick];
          if (!expectedGhostHead) {
            throw new Error(`Expected ghost head at tick ${tick}, but fixture returned null`);
          }
          delayedGhostHeadAtEmission = expectedGhostHead;

          expectFoodBurstAtGhostHead(bursts, ghost);
          expectFoodBurstEventsAtGridPositions(bursts, [expectedGhostHead]);
        }

        tick++;
      }, timers.tickMs);

      timers.advanceTicks(foodConsumedTick + 1);
      if (consumedAtMs === null) {
        throw new Error("Food consumption tick was not observed");
      }

      const expectedFireAtMs = consumedAtMs + ECHO_DELAY_MS;
      const msUntilJustBeforeFire = expectedFireAtMs - timers.now() - 1;

      expect(msUntilJustBeforeFire).toBeGreaterThanOrEqual(0);
      timers.advanceMs(msUntilJustBeforeFire);
      expect(emittedAtMs).toBeNull();
      expect(emissionCount).toBe(0);

      timers.advanceMs(1);

      if (
        emittedAtMs === null ||
        emittedTick === null ||
        emittedBurst === null ||
        liveHeadAtEmission === null ||
        delayedGhostHeadAtEmission === null
      ) {
        throw new Error("Expected a single emitted burst at the delayed replay frame");
      }

      expect(emittedAtMs).toBe(expectedFireAtMs);
      expect(emittedTick).toBe(foodConsumedTick + DELAY_TICKS);
      expect(emissionCount).toBe(1);

      expect(liveHeadAtEmission).not.toEqual(delayedGhostHeadAtEmission);
      expect(emittedBurst).toEqual(gridToPixel(delayedGhostHeadAtEmission));
      expect(emittedBurst).not.toEqual(gridToPixel(liveHeadAtEmission));

      timers.advanceTicks(1);
      expect(emissionCount).toBe(1);

      clearInterval(loop);
    });
  });
});
