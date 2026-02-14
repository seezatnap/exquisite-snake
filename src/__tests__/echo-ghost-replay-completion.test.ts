import { describe, expect, it } from "vitest";
import {
  EchoGhost,
  type EchoGhostBufferSnapshot,
} from "@/game/entities/EchoGhost";

interface EchoGhostPlaybackStepper {
  advancePlayback(): void;
}

function createReplaySnapshot(
  headCols: readonly number[],
): EchoGhostBufferSnapshot {
  if (headCols.length === 0) {
    throw new Error("createReplaySnapshot requires at least one replay frame");
  }

  const buffer = headCols.map((headCol) => ({
    segments: [
      { col: headCol, row: 10 },
      { col: headCol - 1, row: 10 },
      { col: headCol - 2, row: 10 },
    ],
  }));

  return {
    buffer,
    head: 0,
    count: buffer.length,
    writeIndex: 0,
    readIndex: 0,
    active: true,
    opacity: 1,
    currentSegments: [],
    ticksSinceStart: buffer.length,
  };
}

function stepPlayback(ghost: EchoGhost): void {
  (ghost as unknown as EchoGhostPlaybackStepper).advancePlayback();
}

describe("EchoGhost replay completion lifecycle", () => {
  it("fades through remaining replay frames and completes once history is consumed", () => {
    const ghost = new EchoGhost();
    ghost.restore(createReplaySnapshot([20, 21, 22]));

    stepPlayback(ghost);
    expect(ghost.active).toBe(true);
    expect(ghost.getSegments()[0]).toEqual({ col: 20, row: 10 });
    expect(ghost.opacity).toBeCloseTo(3 / 8);
    expect(ghost.getBufferedCount()).toBe(2);

    stepPlayback(ghost);
    expect(ghost.active).toBe(true);
    expect(ghost.getSegments()[0]).toEqual({ col: 21, row: 10 });
    expect(ghost.opacity).toBeCloseTo(2 / 8);
    expect(ghost.getBufferedCount()).toBe(1);

    stepPlayback(ghost);
    expect(ghost.active).toBe(true);
    expect(ghost.getSegments()[0]).toEqual({ col: 22, row: 10 });
    expect(ghost.opacity).toBeCloseTo(1 / 8);
    expect(ghost.getBufferedCount()).toBe(0);

    stepPlayback(ghost);
    expect(ghost.active).toBe(false);
    expect(ghost.opacity).toBe(0);
    expect(ghost.getSegments()).toEqual([]);
    expect(ghost.getBufferedCount()).toBe(0);
  });

  it("does not emit extra movement frames after replay completion", () => {
    const ghost = new EchoGhost();
    ghost.restore(createReplaySnapshot([40, 41]));

    const replayHeads: Array<number | null> = [];
    for (let i = 0; i < 5; i++) {
      stepPlayback(ghost);
      const head = ghost.getSegments()[0];
      replayHeads.push(head ? head.col : null);
    }

    expect(replayHeads).toEqual([40, 41, null, null, null]);
    expect(ghost.active).toBe(false);
    expect(ghost.opacity).toBe(0);
    expect(ghost.getBufferedCount()).toBe(0);
  });
});
