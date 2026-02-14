import { describe, expect, it } from "vitest";
import { ECHO_DELAY_MS, EchoGhost } from "@/game/entities/EchoGhost";
import {
  DELAY_TICKS,
  createSnakePathFixture,
  withDeterministicTimers,
} from "@/__tests__/echo-ghost-harness";

describe("EchoGhost replay delay parity", () => {
  it("replays a known snake path at exactly +5000 ms with step-by-step coordinate parity", async () => {
    await withDeterministicTimers((timers) => {
      const ghost = new EchoGhost();
      const snakePath = createSnakePathFixture({
        ticks: DELAY_TICKS + 6,
        startHead: { col: 6, row: 14 },
        direction: "right",
        length: 4,
      });

      let tick = 0;
      const startMs = timers.now();
      const replayFrames: Array<{ tick: number; elapsedMs: number }> = [];

      const interval = setInterval(() => {
        if (tick >= snakePath.length) {
          clearInterval(interval);
          return;
        }

        ghost.record(snakePath[tick]);

        if (tick < DELAY_TICKS - 1) {
          expect(ghost.active).toBe(false);
          expect(ghost.getSegments()).toEqual([]);
        } else {
          const sourceTick = tick - (DELAY_TICKS - 1);
          expect(ghost.active).toBe(true);
          expect(ghost.getSegments()[0]).toEqual(snakePath[sourceTick][0]);
          replayFrames.push({ tick, elapsedMs: timers.now() - startMs });
        }

        tick++;
      }, timers.tickMs);

      expect(DELAY_TICKS * timers.tickMs).toBe(ECHO_DELAY_MS);

      timers.advanceMs(ECHO_DELAY_MS - 1);
      expect(tick).toBe(DELAY_TICKS - 1);
      expect(ghost.active).toBe(false);
      expect(ghost.getSegments()).toEqual([]);

      timers.advanceMs(1);
      expect(tick).toBe(DELAY_TICKS);
      expect(ghost.active).toBe(true);
      expect(ghost.getSegments()[0]).toEqual(snakePath[0][0]);
      expect(timers.now() - startMs).toBe(ECHO_DELAY_MS);

      timers.advanceTicks(snakePath.length - tick);
      expect(tick).toBe(snakePath.length);

      expect(replayFrames).toHaveLength(snakePath.length - (DELAY_TICKS - 1));
      for (const frame of replayFrames) {
        expect(frame.elapsedMs).toBe((frame.tick + 1) * timers.tickMs);
      }

      clearInterval(interval);
    });
  });
});
