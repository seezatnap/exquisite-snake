import { describe, it, expect } from "vitest";
import { EchoGhost } from "@/game/entities/EchoGhost";
import type { GridPos } from "@/game/utils/grid";

function sample(col: number, row: number = 0): GridPos[] {
  return [{ col, row }];
}

describe("EchoGhost", () => {
  it("replays recorded path on a 5-second delay", () => {
    const ghost = new EchoGhost({ delayMs: 5_000, maxSamples: 32 });

    ghost.recordPath(sample(1)); // t = 0
    ghost.advance(2_500);
    ghost.recordPath(sample(2)); // t = 2500

    ghost.advance(2_499); // t = 4999
    expect(ghost.isActive()).toBe(false);
    expect(ghost.getPlaybackSegments()).toEqual([]);

    ghost.advance(1); // t = 5000, delayed cursor = 0
    expect(ghost.isActive()).toBe(true);
    expect(ghost.getPlaybackSegments()).toEqual(sample(1));

    ghost.advance(2_500); // t = 7500, delayed cursor = 2500
    expect(ghost.getPlaybackSegments()).toEqual(sample(2));
  });

  it("stores history in a bounded circular buffer", () => {
    const ghost = new EchoGhost({ delayMs: 0, maxSamples: 3 });

    for (let i = 0; i < 6; i++) {
      ghost.recordPath(sample(i));
      ghost.advance(16);
    }

    expect(ghost.getBufferedSampleCount()).toBe(3);
    expect(ghost.getPlaybackSegments()).toEqual(sample(5));
  });

  it("consumes buffered playback after stop and fades out when exhausted", () => {
    const ghost = new EchoGhost({
      delayMs: 100,
      fadeOutMs: 200,
      maxSamples: 16,
    });

    ghost.recordPath(sample(0)); // t = 0
    ghost.advance(100);
    ghost.recordPath(sample(1)); // t = 100
    ghost.advance(100);
    ghost.recordPath(sample(2)); // t = 200

    ghost.stopRecording();
    ghost.advance(100); // t = 300, delayed cursor = 200
    expect(ghost.getPlaybackSegments()).toEqual(sample(2));
    expect(ghost.getBufferedSampleCount()).toBeLessThan(3);

    ghost.advance(100); // t = 400, delayed cursor = 300 (final sample consumed)
    expect(ghost.getBufferedSampleCount()).toBe(0);
    expect(ghost.isActive()).toBe(true);

    ghost.advance(100); // fade step 1
    expect(ghost.getOpacity()).toBeGreaterThan(0);
    expect(ghost.getOpacity()).toBeLessThan(1);

    ghost.advance(100); // fade step 2 completes
    expect(ghost.getOpacity()).toBe(0);
    expect(ghost.isActive()).toBe(false);
    expect(ghost.getPlaybackSegments()).toEqual([]);
  });

  it("returns head positions from history at or before a timestamp", () => {
    const ghost = new EchoGhost({ delayMs: 5_000, maxSamples: 16 });

    ghost.recordPath([{ col: 2, row: 4 }]); // t = 0
    ghost.advance(120);
    ghost.recordPath([{ col: 3, row: 4 }]); // t = 120

    expect(ghost.getHeadAtOrBefore(-1)).toBeNull();
    expect(ghost.getHeadAtOrBefore(0)).toEqual({ col: 2, row: 4 });
    expect(ghost.getHeadAtOrBefore(119)).toEqual({ col: 2, row: 4 });
    expect(ghost.getHeadAtOrBefore(120)).toEqual({ col: 3, row: 4 });
    expect(ghost.getHeadAtOrBefore(9999)).toEqual({ col: 3, row: 4 });
  });

  it("returns null when the requested timestamp sample is unavailable", () => {
    const ghost = new EchoGhost({ delayMs: 0, maxSamples: 2 });

    ghost.recordPath([{ col: 1, row: 0 }]); // t = 0
    ghost.advance(50);
    ghost.recordPath([{ col: 2, row: 0 }]); // t = 50
    ghost.advance(50);
    ghost.recordPath([{ col: 3, row: 0 }]); // t = 100; overwrites t=0 sample

    expect(ghost.getHeadAtOrBefore(0)).toBeNull();
    expect(ghost.getHeadAtOrBefore(50)).toEqual({ col: 2, row: 0 });
  });
});
