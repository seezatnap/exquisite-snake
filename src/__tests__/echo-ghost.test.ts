import { describe, it, expect } from "vitest";

import { EchoGhost } from "@/game/entities/EchoGhost";
import { DEFAULT_MOVE_INTERVAL_MS } from "@/game/utils/grid";
import type { GridPos } from "@/game/utils/grid";

function makePos(col: number, row: number): GridPos {
  return { col, row };
}

describe("EchoGhost", () => {
  it("derives a 5-second delay from the tick interval", () => {
    const ghost = new EchoGhost(DEFAULT_MOVE_INTERVAL_MS);

    expect(ghost.getDelayMs()).toBe(5000);
    expect(ghost.getDelayTicks()).toBe(40); // 5000 / 125
    expect(ghost.getBufferCapacity()).toBe(40);
  });

  it("does not expose a replay trail before the configured delay elapses", () => {
    const ghost = new EchoGhost(100, 1000); // 10 ticks delay

    ghost.writePositions([makePos(0, 0)]);
    ghost.advanceReplayProgress();
    ghost.writePositions([makePos(1, 0)]);
    ghost.advanceReplayProgress();
    ghost.writePositions([makePos(2, 0)]);
    ghost.advanceReplayProgress();

    expect(ghost.isReplayReady()).toBe(false);
    expect(ghost.readDelayedTrail()).toEqual([]);

    ghost.writePositions([makePos(3, 0)]);
    ghost.advanceReplayProgress();
    ghost.writePositions([makePos(4, 0)]);
    ghost.advanceReplayProgress();
    ghost.writePositions([makePos(5, 0)]);
    ghost.advanceReplayProgress();
    ghost.writePositions([makePos(6, 0)]);
    ghost.advanceReplayProgress();
    ghost.writePositions([makePos(7, 0)]);
    ghost.advanceReplayProgress();
    ghost.writePositions([makePos(8, 0)]);
    ghost.advanceReplayProgress();
    ghost.writePositions([makePos(9, 0)]);
    ghost.advanceReplayProgress();

    expect(ghost.isReplayReady()).toBe(true);
    expect(ghost.readDelayedTrail()).toEqual([makePos(0, 0)]);
  });

  it("returns delayed output from exactly delayTicks behind", () => {
    const ghost = new EchoGhost(100, 500); // 5 ticks delay

    ghost.writePositions([makePos(1, 0)]);
    ghost.advanceReplayProgress();
    ghost.writePositions([makePos(2, 0)]);
    ghost.advanceReplayProgress();
    ghost.writePositions([makePos(3, 0)]);
    ghost.advanceReplayProgress();
    ghost.writePositions([makePos(4, 0)]);
    ghost.advanceReplayProgress();
    ghost.writePositions([makePos(5, 0)]);
    ghost.advanceReplayProgress();

    expect(ghost.readDelayedTrail()).toEqual([makePos(1, 0)]);

    ghost.writePositions([makePos(6, 0)]);
    ghost.advanceReplayProgress();
    expect(ghost.readDelayedTrail()).toEqual([makePos(2, 0)]);
  });

  it("wraps writes in a fixed-size circular buffer", () => {
    const ghost = new EchoGhost(100, 300); // 3 ticks delay / capacity

    ghost.writePositions([makePos(1, 0)]);
    ghost.advanceReplayProgress();
    ghost.writePositions([makePos(2, 0)]);
    ghost.advanceReplayProgress();
    ghost.writePositions([makePos(3, 0)]);
    ghost.advanceReplayProgress();
    expect(ghost.readDelayedTrail()).toEqual([makePos(1, 0)]);

    ghost.writePositions([makePos(4, 0)]);
    ghost.advanceReplayProgress();
    expect(ghost.readDelayedTrail()).toEqual([makePos(2, 0)]);

    ghost.writePositions([makePos(5, 0)]);
    ghost.advanceReplayProgress();
    expect(ghost.readDelayedTrail()).toEqual([makePos(3, 0)]);
  });

  it("returns copied snapshots so caller mutation does not affect buffered state", () => {
    const ghost = new EchoGhost(100, 300); // 3 ticks delay
    const source: GridPos[] = [makePos(9, 9)];

    ghost.writePositions([makePos(1, 0)]);
    ghost.advanceReplayProgress();
    ghost.writePositions([makePos(2, 0)]);
    ghost.advanceReplayProgress();
    ghost.writePositions(source);
    ghost.advanceReplayProgress();

    source[0].col = 42;
    const replay = ghost.readDelayedTrail();
    expect(replay).toEqual([makePos(1, 0)]);

    (replay as GridPos[])[0].col = 123;
    expect(ghost.readDelayedTrail()).toEqual([makePos(1, 0)]);
  });

  it("fades after the bounded replay window and then exhausts", () => {
    const ghost = new EchoGhost(100, 500, 200); // 5 delay ticks, 2 fade ticks
    const trail = (step: number): GridPos[] => [makePos(step, 0)];

    for (let step = 1; step <= 11; step++) {
      ghost.writePositions(trail(step));
      ghost.advanceReplayProgress();

      const trailForStep = ghost.readDelayedTrail();

      if (step < 5) {
        expect(ghost.getReplayState()).toBe("waiting");
        expect(trailForStep).toEqual([]);
        expect(ghost.getReplayOpacity()).toBe(0);
      } else if (step < 10) {
        expect(ghost.getReplayState()).toBe("active");
        expect(trailForStep).toEqual(trail(step - 4));
        expect(ghost.getReplayOpacity()).toBe(1);
      } else if (step === 10) {
        expect(ghost.getReplayState()).toBe("fading");
        expect(trailForStep).toEqual([]);
        expect(ghost.getReplayOpacity()).toBe(0.5);
      } else {
        expect(ghost.isReplayExhausted()).toBe(true);
        expect(trailForStep).toEqual([]);
        expect(ghost.getReplayOpacity()).toBe(0);
      }
    }
  });
});
