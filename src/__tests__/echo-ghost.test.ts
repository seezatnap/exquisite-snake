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

  it("supports rewind snapshots via createSnapshot/restoreSnapshot", () => {
    const ghost = new EchoGhost({
      delayMs: 100,
      fadeOutMs: 150,
      maxSamples: 8,
    });

    ghost.recordPath(sample(1, 1)); // t = 0
    ghost.advance(100);
    ghost.recordPath(sample(2, 2)); // t = 100
    ghost.advance(100); // t = 200

    const snapshot = ghost.createSnapshot();

    ghost.stopRecording();
    ghost.advance(200);
    ghost.reset();
    expect(ghost.getBufferedSampleCount()).toBe(0);

    ghost.restoreSnapshot(snapshot);
    expect(ghost.createSnapshot()).toEqual(snapshot);
  });

  it("returns detached snapshot payloads so callers cannot mutate live state", () => {
    const ghost = new EchoGhost({ delayMs: 0, maxSamples: 4 });

    ghost.recordPath(sample(7, 3));
    ghost.advance(16);

    const snapshot = ghost.createSnapshot();
    snapshot.playbackSegments[0].col = 99;
    snapshot.samples[0].segments[0].row = 88;

    const liveState = ghost.createSnapshot();
    expect(liveState.playbackSegments[0].col).toBe(7);
    expect(liveState.samples[0].segments[0].row).toBe(3);
  });
});
