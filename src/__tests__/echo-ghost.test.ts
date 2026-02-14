import { describe, it, expect, beforeEach } from "vitest";
import {
  EchoGhost,
  ECHO_DELAY_MS,
  delayTicks,
} from "@/game/entities/EchoGhost";
import { DEFAULT_MOVE_INTERVAL_MS, type GridPos } from "@/game/utils/grid";

// ── Helpers ──────────────────────────────────────────────────────

/** Build a simple segments array for testing. */
function seg(...positions: [number, number][]): GridPos[] {
  return positions.map(([col, row]) => ({ col, row }));
}

// ── delayTicks helper ────────────────────────────────────────────

describe("delayTicks", () => {
  it("returns 40 for default 125ms interval", () => {
    expect(delayTicks(DEFAULT_MOVE_INTERVAL_MS)).toBe(40);
  });

  it("returns 50 for 100ms interval", () => {
    expect(delayTicks(100)).toBe(50);
  });

  it("rounds up when delay is not evenly divisible", () => {
    // 5000 / 130 ≈ 38.46 → ceil → 39
    expect(delayTicks(130)).toBe(39);
  });

  it("returns 5 for 1000ms interval", () => {
    expect(delayTicks(1000)).toBe(5);
  });
});

// ── Construction ─────────────────────────────────────────────────

describe("EchoGhost construction", () => {
  it("creates with default tick interval", () => {
    const ghost = new EchoGhost();
    expect(ghost.delayInTicks).toBe(40);
    expect(ghost.capacity).toBeGreaterThan(40);
  });

  it("creates with custom tick interval", () => {
    const ghost = new EchoGhost(100);
    expect(ghost.delayInTicks).toBe(50);
  });

  it("creates with custom buffer seconds", () => {
    const ghost = new EchoGhost(125, 15);
    // 15s / 0.125s = 120 frames
    expect(ghost.capacity).toBe(120);
  });

  it("ensures capacity is at least delayInTicks + 1", () => {
    // Request a very small buffer (1 second) — should be clamped
    const ghost = new EchoGhost(125, 1);
    // 1s → 8 frames, but delay = 40, so capacity should be 41
    expect(ghost.capacity).toBe(41);
  });

  it("starts with zero tick count", () => {
    const ghost = new EchoGhost();
    expect(ghost.getCurrentTick()).toBe(0);
  });

  it("starts with zero stored frames", () => {
    const ghost = new EchoGhost();
    expect(ghost.getCount()).toBe(0);
  });

  it("starts inactive", () => {
    const ghost = new EchoGhost();
    expect(ghost.isActive()).toBe(false);
  });
});

// ── Recording ────────────────────────────────────────────────────

describe("EchoGhost recording", () => {
  let ghost: EchoGhost;

  beforeEach(() => {
    ghost = new EchoGhost(125);
  });

  it("increments tick counter on each record", () => {
    ghost.record(seg([10, 10], [9, 10]));
    expect(ghost.getCurrentTick()).toBe(1);

    ghost.record(seg([11, 10], [10, 10]));
    expect(ghost.getCurrentTick()).toBe(2);
  });

  it("increments count up to capacity", () => {
    const capacity = ghost.capacity;

    for (let i = 0; i < capacity + 5; i++) {
      ghost.record(seg([i, 0]));
    }

    // Count saturates at capacity
    expect(ghost.getCount()).toBe(capacity);
  });

  it("stores a deep copy of segments (mutations don't corrupt buffer)", () => {
    const segments: GridPos[] = [{ col: 10, row: 10 }];
    ghost.record(segments);

    // Mutate the original
    segments[0].col = 999;

    // Buffer should still have the original value
    const frame = ghost.getFrameAtTick(0);
    expect(frame).not.toBeNull();
    expect(frame!.segments[0].col).toBe(10);
  });

  it("records multiple segments per frame", () => {
    ghost.record(seg([10, 10], [9, 10], [8, 10]));

    const frame = ghost.getFrameAtTick(0);
    expect(frame).not.toBeNull();
    expect(frame!.segments).toHaveLength(3);
    expect(frame!.segments[0]).toEqual({ col: 10, row: 10 });
    expect(frame!.segments[1]).toEqual({ col: 9, row: 10 });
    expect(frame!.segments[2]).toEqual({ col: 8, row: 10 });
  });

  it("tags each frame with the correct tick number", () => {
    ghost.record(seg([1, 0]));
    ghost.record(seg([2, 0]));
    ghost.record(seg([3, 0]));

    expect(ghost.getFrameAtTick(0)!.tick).toBe(0);
    expect(ghost.getFrameAtTick(1)!.tick).toBe(1);
    expect(ghost.getFrameAtTick(2)!.tick).toBe(2);
  });
});

// ── Circular buffer behavior ─────────────────────────────────────

describe("EchoGhost circular buffer", () => {
  it("overwrites oldest frames when buffer is full", () => {
    // Use a small buffer for testability
    const ghost = new EchoGhost(1000, 6); // 5 ticks delay, 6 capacity
    const cap = ghost.capacity; // 6

    // Fill the buffer completely
    for (let i = 0; i < cap; i++) {
      ghost.record(seg([i, 0]));
    }

    // Tick 0 is still available
    expect(ghost.getFrameAtTick(0)).not.toBeNull();

    // One more record overwrites tick 0
    ghost.record(seg([cap, 0]));
    expect(ghost.getFrameAtTick(0)).toBeNull();

    // Most recent frame is available
    expect(ghost.getFrameAtTick(cap)).not.toBeNull();
    expect(ghost.getFrameAtTick(cap)!.segments[0].col).toBe(cap);
  });

  it("maintains correct frame lookup after wrap-around", () => {
    const ghost = new EchoGhost(1000, 8); // 5 ticks delay, 8 cap
    const cap = ghost.capacity;

    // Write 2x the capacity
    for (let i = 0; i < cap * 2; i++) {
      ghost.record(seg([i, 0]));
    }

    // Only the last `capacity` frames should be available
    for (let i = 0; i < cap; i++) {
      expect(ghost.getFrameAtTick(i)).toBeNull();
    }
    for (let i = cap; i < cap * 2; i++) {
      const frame = ghost.getFrameAtTick(i);
      expect(frame).not.toBeNull();
      expect(frame!.segments[0].col).toBe(i);
    }
  });
});

// ── 5-second delay / ghost trail reading ─────────────────────────

describe("EchoGhost 5-second delay", () => {
  it("returns null before delay ticks have elapsed", () => {
    const ghost = new EchoGhost(125); // delay = 40 ticks

    // Record 39 ticks — not enough
    for (let i = 0; i < 39; i++) {
      ghost.record(seg([i, 0]));
    }

    expect(ghost.getGhostTrail()).toBeNull();
    expect(ghost.isActive()).toBe(false);
  });

  it("returns the trail after exactly delayInTicks recordings", () => {
    const ghost = new EchoGhost(125); // delay = 40
    const delay = ghost.delayInTicks;

    for (let i = 0; i < delay; i++) {
      ghost.record(seg([i, 0]));
    }

    // After 40 records, currentTick = 40, target = tick 0
    const trail = ghost.getGhostTrail();
    expect(trail).not.toBeNull();
    expect(trail![0]).toEqual({ col: 0, row: 0 });
    expect(ghost.isActive()).toBe(true);
  });

  it("ghost trail advances as new ticks are recorded", () => {
    const ghost = new EchoGhost(125);
    const delay = ghost.delayInTicks;

    // Record delay + 5 ticks
    for (let i = 0; i < delay + 5; i++) {
      ghost.record(seg([i, 0]));
    }

    // Ghost should show tick 5 (currentTick=45, target=5)
    const trail = ghost.getGhostTrail();
    expect(trail).not.toBeNull();
    expect(trail![0]).toEqual({ col: 5, row: 0 });
  });

  it("delay ticks match 5 seconds at default interval", () => {
    const ghost = new EchoGhost(DEFAULT_MOVE_INTERVAL_MS);
    // 5000ms / 125ms = 40 ticks
    expect(ghost.delayInTicks).toBe(40);
    // 40 ticks * 125ms = 5000ms = 5 seconds exactly
    expect(ghost.delayInTicks * DEFAULT_MOVE_INTERVAL_MS).toBe(ECHO_DELAY_MS);
  });

  it("delay ticks adapt to different tick rates", () => {
    const ghost100 = new EchoGhost(100);
    expect(ghost100.delayInTicks).toBe(50); // 5000/100

    const ghost200 = new EchoGhost(200);
    expect(ghost200.delayInTicks).toBe(25); // 5000/200

    const ghost50 = new EchoGhost(50);
    expect(ghost50.delayInTicks).toBe(100); // 5000/50
  });
});

// ── getGhostFrame ────────────────────────────────────────────────

describe("EchoGhost getGhostFrame", () => {
  it("returns null before delay is reached", () => {
    const ghost = new EchoGhost(125);
    ghost.record(seg([0, 0]));
    expect(ghost.getGhostFrame()).toBeNull();
  });

  it("returns full frame with tick number after delay", () => {
    const ghost = new EchoGhost(125);
    const delay = ghost.delayInTicks;

    for (let i = 0; i <= delay; i++) {
      ghost.record(seg([i, 0]));
    }

    const frame = ghost.getGhostFrame();
    expect(frame).not.toBeNull();
    expect(frame!.tick).toBe(1); // currentTick=41, target=1
    expect(frame!.segments[0]).toEqual({ col: 1, row: 0 });
  });
});

// ── getFrameAtTick ───────────────────────────────────────────────

describe("EchoGhost getFrameAtTick", () => {
  it("returns null for negative tick", () => {
    const ghost = new EchoGhost();
    expect(ghost.getFrameAtTick(-1)).toBeNull();
  });

  it("returns null for tick not yet recorded", () => {
    const ghost = new EchoGhost();
    ghost.record(seg([0, 0]));
    expect(ghost.getFrameAtTick(1)).toBeNull();
  });

  it("returns the correct frame for a valid tick", () => {
    const ghost = new EchoGhost();
    ghost.record(seg([5, 5]));
    ghost.record(seg([6, 5]));

    const frame = ghost.getFrameAtTick(0);
    expect(frame).not.toBeNull();
    expect(frame!.segments[0]).toEqual({ col: 5, row: 5 });

    const frame1 = ghost.getFrameAtTick(1);
    expect(frame1).not.toBeNull();
    expect(frame1!.segments[0]).toEqual({ col: 6, row: 5 });
  });
});

// ── Reset ────────────────────────────────────────────────────────

describe("EchoGhost reset", () => {
  it("clears the buffer and resets counters", () => {
    const ghost = new EchoGhost(125);
    const delay = ghost.delayInTicks;

    // Record enough to activate
    for (let i = 0; i < delay + 10; i++) {
      ghost.record(seg([i, 0]));
    }
    expect(ghost.isActive()).toBe(true);

    ghost.reset();

    expect(ghost.getCurrentTick()).toBe(0);
    expect(ghost.getCount()).toBe(0);
    expect(ghost.isActive()).toBe(false);
    expect(ghost.getGhostTrail()).toBeNull();
  });

  it("can be used again after reset", () => {
    const ghost = new EchoGhost(125);
    const delay = ghost.delayInTicks;

    for (let i = 0; i < delay; i++) {
      ghost.record(seg([i, 0]));
    }
    expect(ghost.isActive()).toBe(true);

    ghost.reset();

    // Record again
    for (let i = 0; i < delay; i++) {
      ghost.record(seg([100 + i, 5]));
    }

    const trail = ghost.getGhostTrail();
    expect(trail).not.toBeNull();
    expect(trail![0]).toEqual({ col: 100, row: 5 });
  });
});

// ── Snapshot / Restore (Rewind API) ──────────────────────────────

describe("EchoGhost snapshot/restore (rewind API)", () => {
  it("snapshot captures current state", () => {
    const ghost = new EchoGhost(125);
    ghost.record(seg([1, 0]));
    ghost.record(seg([2, 0]));

    const snap = ghost.snapshot();
    expect(snap.currentTick).toBe(2);
    expect(snap.count).toBe(2);
    expect(snap.writeIndex).toBe(2);
    expect(snap.frames).toHaveLength(2);
  });

  it("restore reverts to snapshot state", () => {
    const ghost = new EchoGhost(1000, 10);
    const delay = ghost.delayInTicks;

    // Record some frames and take a snapshot
    for (let i = 0; i < delay + 2; i++) {
      ghost.record(seg([i, 0]));
    }
    const snap = ghost.snapshot();
    const trailBefore = ghost.getGhostTrail();

    // Record more frames
    for (let i = 0; i < 5; i++) {
      ghost.record(seg([100 + i, 0]));
    }

    // Trail has changed
    const trailAfter = ghost.getGhostTrail();
    expect(trailAfter).not.toEqual(trailBefore);

    // Restore
    ghost.restore(snap);
    expect(ghost.getCurrentTick()).toBe(snap.currentTick);
    expect(ghost.getCount()).toBe(snap.count);

    const trailRestored = ghost.getGhostTrail();
    expect(trailRestored).toEqual(trailBefore);
  });

  it("snapshot creates a deep copy (independent of buffer)", () => {
    const ghost = new EchoGhost(125);
    ghost.record(seg([10, 10]));
    const snap = ghost.snapshot();

    // Record more — shouldn't affect the snapshot
    ghost.record(seg([20, 20]));

    expect(snap.frames).toHaveLength(1);
    expect(snap.frames[0].segments[0]).toEqual({ col: 10, row: 10 });
  });

  it("restore creates deep copies of snapshot data", () => {
    const ghost = new EchoGhost(125);
    ghost.record(seg([10, 10]));
    const snap = ghost.snapshot();

    ghost.reset();
    ghost.restore(snap);

    // Verify the frame is present and correct
    const frame = ghost.getFrameAtTick(0);
    expect(frame).not.toBeNull();
    expect(frame!.segments[0]).toEqual({ col: 10, row: 10 });
  });
});

// ── Deterministic behavior ───────────────────────────────────────

describe("EchoGhost determinism", () => {
  it("produces identical ghost trails given identical input sequences", () => {
    const ghost1 = new EchoGhost(125);
    const ghost2 = new EchoGhost(125);

    const delay = ghost1.delayInTicks;

    for (let i = 0; i < delay + 10; i++) {
      const segments = seg([10 + i, 5], [9 + i, 5], [8 + i, 5]);
      ghost1.record(segments);
      ghost2.record(segments);
    }

    const trail1 = ghost1.getGhostTrail();
    const trail2 = ghost2.getGhostTrail();

    expect(trail1).toEqual(trail2);
    expect(ghost1.getCurrentTick()).toBe(ghost2.getCurrentTick());
  });

  it("record then read is idempotent (reading doesn't mutate state)", () => {
    const ghost = new EchoGhost(125);
    const delay = ghost.delayInTicks;

    for (let i = 0; i < delay + 5; i++) {
      ghost.record(seg([i, 0]));
    }

    const trail1 = ghost.getGhostTrail();
    const trail2 = ghost.getGhostTrail();
    const trail3 = ghost.getGhostTrail();

    expect(trail1).toEqual(trail2);
    expect(trail2).toEqual(trail3);
    expect(ghost.getCurrentTick()).toBe(delay + 5);
  });
});

// ── Edge cases ───────────────────────────────────────────────────

describe("EchoGhost edge cases", () => {
  it("handles empty segments array", () => {
    const ghost = new EchoGhost(125);
    ghost.record([]);

    const frame = ghost.getFrameAtTick(0);
    expect(frame).not.toBeNull();
    expect(frame!.segments).toHaveLength(0);
  });

  it("handles single-segment snake", () => {
    const ghost = new EchoGhost(125);
    const delay = ghost.delayInTicks;

    for (let i = 0; i < delay; i++) {
      ghost.record(seg([i, 0]));
    }

    const trail = ghost.getGhostTrail();
    expect(trail).not.toBeNull();
    expect(trail).toHaveLength(1);
  });

  it("handles very fast tick rate (10ms)", () => {
    const ghost = new EchoGhost(10);
    expect(ghost.delayInTicks).toBe(500); // 5000/10

    // Record enough to activate
    for (let i = 0; i < 500; i++) {
      ghost.record(seg([i % 40, 0]));
    }

    expect(ghost.isActive()).toBe(true);
  });

  it("handles very slow tick rate (1000ms)", () => {
    const ghost = new EchoGhost(1000);
    expect(ghost.delayInTicks).toBe(5); // 5000/1000

    for (let i = 0; i < 5; i++) {
      ghost.record(seg([i, 0]));
    }

    expect(ghost.isActive()).toBe(true);
    const trail = ghost.getGhostTrail();
    expect(trail).not.toBeNull();
    expect(trail![0]).toEqual({ col: 0, row: 0 });
  });
});
