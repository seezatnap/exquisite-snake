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

// ── Constructor edge cases (zero / negative tick interval & delay) ──

describe("EchoGhost constructor edge cases", () => {
  it("throws RangeError for zero tick interval (Infinity capacity)", () => {
    // Math.ceil(5000 / 0) = Infinity → new Array(Infinity) throws
    expect(() => new EchoGhost(0)).toThrow(RangeError);
  });

  it("throws RangeError for negative tick interval (negative capacity)", () => {
    // Math.ceil(5000 / -125) = -40 → new Array(-40) throws
    expect(() => new EchoGhost(-125)).toThrow(RangeError);
  });

  it("delayTicks returns Infinity for zero interval", () => {
    expect(delayTicks(0)).toBe(Infinity);
  });

  it("delayTicks returns negative value for negative interval", () => {
    expect(delayTicks(-100)).toBe(-50);
  });

  it("handles negative bufferSeconds by clamping capacity to delayInTicks + 1", () => {
    const ghost = new EchoGhost(125, -5);
    // -5 * 1000 = -5000ms → Math.ceil(-5000 / 125) = -40
    // Math.max(41, -40) = 41 → capacity clamped to delayInTicks + 1
    expect(ghost.capacity).toBe(41);
  });

  it("handles zero bufferSeconds by clamping capacity to delayInTicks + 1", () => {
    const ghost = new EchoGhost(125, 0);
    // 0 * 1000 = 0ms → Math.ceil(0 / 125) = 0
    // Math.max(41, 0) = 41 → capacity clamped to delayInTicks + 1
    expect(ghost.capacity).toBe(41);
  });

  it("handles very small positive tick interval (1ms)", () => {
    const ghost = new EchoGhost(1);
    // 5000 / 1 = 5000 ticks delay
    expect(ghost.delayInTicks).toBe(5000);
    expect(ghost.capacity).toBeGreaterThan(5000);
  });

  it("handles fractional tick interval", () => {
    const ghost = new EchoGhost(0.5);
    // Math.ceil(5000 / 0.5) = 10000
    expect(ghost.delayInTicks).toBe(10000);
  });
});

// ── Reset (comprehensive) ───────────────────────────────────────

describe("EchoGhost reset (comprehensive)", () => {
  it("preserves delayInTicks and capacity after reset", () => {
    const ghost = new EchoGhost(100, 15);
    const originalDelay = ghost.delayInTicks;
    const originalCapacity = ghost.capacity;

    for (let i = 0; i < 20; i++) {
      ghost.record(seg([i, 0]));
    }

    ghost.reset();

    expect(ghost.delayInTicks).toBe(originalDelay);
    expect(ghost.capacity).toBe(originalCapacity);
  });

  it("clears all individual frames from the buffer", () => {
    const ghost = new EchoGhost(1000, 10);
    // delay = 5 ticks, capacity = 10

    for (let i = 0; i < 8; i++) {
      ghost.record(seg([i, 0]));
    }
    // Verify frames are present before reset
    expect(ghost.getFrameAtTick(3)).not.toBeNull();

    ghost.reset();

    // All old frames should be gone
    for (let i = 0; i < 8; i++) {
      expect(ghost.getFrameAtTick(i)).toBeNull();
    }
  });

  it("reset after partial recording (less than delay)", () => {
    const ghost = new EchoGhost(125);
    // delay = 40, only record 10 frames
    for (let i = 0; i < 10; i++) {
      ghost.record(seg([i, 0]));
    }

    expect(ghost.getCurrentTick()).toBe(10);
    expect(ghost.getCount()).toBe(10);
    expect(ghost.isActive()).toBe(false);

    ghost.reset();

    expect(ghost.getCurrentTick()).toBe(0);
    expect(ghost.getCount()).toBe(0);
    expect(ghost.isActive()).toBe(false);
  });

  it("reset after buffer has wrapped around", () => {
    const ghost = new EchoGhost(1000, 6);
    // delay = 5 ticks, capacity = 6

    // Overfill the buffer to cause wrap-around
    for (let i = 0; i < 15; i++) {
      ghost.record(seg([i, 0]));
    }
    expect(ghost.getCount()).toBe(6);
    expect(ghost.getCurrentTick()).toBe(15);

    ghost.reset();

    expect(ghost.getCurrentTick()).toBe(0);
    expect(ghost.getCount()).toBe(0);
    expect(ghost.isActive()).toBe(false);
    expect(ghost.getGhostTrail()).toBeNull();
    expect(ghost.getGhostFrame()).toBeNull();
  });

  it("getGhostFrame returns null after reset", () => {
    const ghost = new EchoGhost(125);
    const delay = ghost.delayInTicks;

    for (let i = 0; i < delay + 5; i++) {
      ghost.record(seg([i, 0]));
    }
    expect(ghost.getGhostFrame()).not.toBeNull();

    ghost.reset();
    expect(ghost.getGhostFrame()).toBeNull();
  });

  it("multiple consecutive resets are idempotent", () => {
    const ghost = new EchoGhost(125);

    for (let i = 0; i < 10; i++) {
      ghost.record(seg([i, 0]));
    }

    ghost.reset();
    ghost.reset();
    ghost.reset();

    expect(ghost.getCurrentTick()).toBe(0);
    expect(ghost.getCount()).toBe(0);
    expect(ghost.isActive()).toBe(false);
  });

  it("recording after reset uses tick 0 again", () => {
    const ghost = new EchoGhost(125);

    for (let i = 0; i < 5; i++) {
      ghost.record(seg([i, 0]));
    }
    expect(ghost.getCurrentTick()).toBe(5);

    ghost.reset();
    ghost.record(seg([99, 99]));

    expect(ghost.getCurrentTick()).toBe(1);
    const frame = ghost.getFrameAtTick(0);
    expect(frame).not.toBeNull();
    expect(frame!.tick).toBe(0);
    expect(frame!.segments[0]).toEqual({ col: 99, row: 99 });
  });

  it("snapshot taken before reset is not affected by reset", () => {
    const ghost = new EchoGhost(125);
    ghost.record(seg([1, 1]));
    ghost.record(seg([2, 2]));

    const snap = ghost.snapshot();

    ghost.reset();

    // Snapshot should still have original data
    expect(snap.currentTick).toBe(2);
    expect(snap.count).toBe(2);
    expect(snap.frames).toHaveLength(2);
  });

  it("can restore a snapshot after reset", () => {
    const ghost = new EchoGhost(1000, 10);
    const delay = ghost.delayInTicks;

    for (let i = 0; i < delay + 3; i++) {
      ghost.record(seg([i, 0]));
    }
    const snap = ghost.snapshot();
    const trailBeforeReset = ghost.getGhostTrail();

    ghost.reset();
    expect(ghost.isActive()).toBe(false);

    ghost.restore(snap);
    expect(ghost.getCurrentTick()).toBe(snap.currentTick);
    expect(ghost.getGhostTrail()).toEqual(trailBeforeReset);
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

// ── Lifecycle management ────────────────────────────────────────

describe("EchoGhost lifecycle state", () => {
  it("starts in warming state", () => {
    const ghost = new EchoGhost(125);
    expect(ghost.getLifecycleState()).toBe("warming");
  });

  it("stays in warming until delay ticks have been recorded", () => {
    const ghost = new EchoGhost(125);
    const delay = ghost.delayInTicks;

    for (let i = 0; i < delay - 1; i++) {
      ghost.record(seg([i, 0]));
      expect(ghost.getLifecycleState()).toBe("warming");
    }
  });

  it("transitions to active once delay is reached", () => {
    const ghost = new EchoGhost(125);
    const delay = ghost.delayInTicks;

    for (let i = 0; i < delay; i++) {
      ghost.record(seg([i, 0]));
    }

    expect(ghost.getLifecycleState()).toBe("active");
  });

  it("remains active during normal recording", () => {
    const ghost = new EchoGhost(125);
    const delay = ghost.delayInTicks;

    for (let i = 0; i < delay + 20; i++) {
      ghost.record(seg([i, 0]));
    }

    expect(ghost.getLifecycleState()).toBe("active");
  });

  it("returns warming state before delay even with no recording", () => {
    const ghost = new EchoGhost(125);
    expect(ghost.getLifecycleState()).toBe("warming");
    expect(ghost.getOpacity()).toBe(0);
  });
});

describe("EchoGhost stopRecording", () => {
  it("marks recording as stopped", () => {
    const ghost = new EchoGhost(125);
    expect(ghost.isRecordingStopped()).toBe(false);

    ghost.stopRecording();
    expect(ghost.isRecordingStopped()).toBe(true);
  });

  it("is idempotent (calling twice has no extra effect)", () => {
    const ghost = new EchoGhost(125);
    const delay = ghost.delayInTicks;

    for (let i = 0; i < delay + 5; i++) {
      ghost.record(seg([i, 0]));
    }

    ghost.stopRecording();
    const tick1 = ghost.getCurrentTick();

    ghost.stopRecording();
    expect(ghost.getCurrentTick()).toBe(tick1);
  });

  it("prevents further recording changes to lastRecordedTick", () => {
    const ghost = new EchoGhost(125);
    ghost.record(seg([0, 0]));
    ghost.record(seg([1, 0]));
    ghost.stopRecording();

    // advancePlayhead should not change the lastRecordedTick
    ghost.advancePlayhead();
    ghost.advancePlayhead();

    // The snapshot captures the internal lastRecordedTick
    const snap = ghost.snapshot();
    expect(snap.lastRecordedTick).toBe(1);
  });
});

describe("EchoGhost advancePlayhead", () => {
  it("does nothing when recording has not been stopped", () => {
    const ghost = new EchoGhost(125);
    ghost.record(seg([0, 0]));
    const tickBefore = ghost.getCurrentTick();

    ghost.advancePlayhead();
    expect(ghost.getCurrentTick()).toBe(tickBefore);
  });

  it("advances currentTick after stopRecording", () => {
    const ghost = new EchoGhost(125);
    ghost.record(seg([0, 0]));
    ghost.stopRecording();

    const tickBefore = ghost.getCurrentTick();
    ghost.advancePlayhead();
    expect(ghost.getCurrentTick()).toBe(tickBefore + 1);
  });

  it("drains the buffer as playhead advances past recorded frames", () => {
    const ghost = new EchoGhost(1000, 10); // delay=5, cap=10
    const delay = ghost.delayInTicks;

    // Record delay + 3 frames (ticks 0..7), ghost becomes active at tick 5
    for (let i = 0; i < delay + 3; i++) {
      ghost.record(seg([i, 0]));
    }
    expect(ghost.isActive()).toBe(true);

    ghost.stopRecording();
    // lastRecordedTick = 7, currentTick = 8

    // Advance playhead until the ghost runs out of frames
    // targetTick = currentTick - delay, and we have frames up to tick 7
    // So when currentTick = 13, target = 8 → no frame → inactive
    let advanceCount = 0;
    while (ghost.getGhostTrail() !== null && advanceCount < 100) {
      ghost.advancePlayhead();
      advanceCount++;
    }

    expect(ghost.getGhostTrail()).toBeNull();
    expect(ghost.getLifecycleState()).toBe("inactive");
  });
});

describe("EchoGhost fade-out behavior", () => {
  it("has correct fadeDurationTicks at default interval", () => {
    const ghost = new EchoGhost(125);
    // 1000ms / 125ms = 8 ticks
    expect(ghost.fadeDurationTicks).toBe(8);
  });

  it("has correct fadeDurationTicks at different intervals", () => {
    expect(new EchoGhost(100).fadeDurationTicks).toBe(10); // 1000/100
    expect(new EchoGhost(200).fadeDurationTicks).toBe(5);  // 1000/200
    expect(new EchoGhost(1000).fadeDurationTicks).toBe(1);  // 1000/1000
    expect(new EchoGhost(500).fadeDurationTicks).toBe(2);  // 1000/500
  });

  it("fadeDurationTicks is at least 1", () => {
    // Even with very large tick intervals
    const ghost = new EchoGhost(2000);
    expect(ghost.fadeDurationTicks).toBeGreaterThanOrEqual(1);
  });

  it("returns opacity 0 during warming", () => {
    const ghost = new EchoGhost(125);
    expect(ghost.getOpacity()).toBe(0);
  });

  it("returns opacity 1 during active state", () => {
    const ghost = new EchoGhost(125);
    const delay = ghost.delayInTicks;

    for (let i = 0; i < delay + 10; i++) {
      ghost.record(seg([i, 0]));
    }

    expect(ghost.getLifecycleState()).toBe("active");
    expect(ghost.getOpacity()).toBe(1);
  });

  it("fades from 1 to 0 after stopRecording when approaching last frame", () => {
    // Use 1000ms interval for simpler math: delay=5, fadeDuration=1
    const ghost = new EchoGhost(1000, 10); // delay=5, cap=10
    expect(ghost.delayInTicks).toBe(5);

    // Record 10 frames (ticks 0..9)
    for (let i = 0; i < 10; i++) {
      ghost.record(seg([i, 0]));
    }
    // currentTick=10, lastRecordedTick=9
    expect(ghost.getLifecycleState()).toBe("active");
    expect(ghost.getOpacity()).toBe(1);

    ghost.stopRecording();

    // Advance until we start fading
    // Target = currentTick - 5, remaining = 9 - target
    // fadeDurationTicks = 1 at 1000ms interval
    // When remaining < 1, we're fading → when remaining = 0

    // At currentTick=10: target=5, remaining=4 → active
    expect(ghost.getLifecycleState()).toBe("active");

    // Advance to currentTick=14: target=9, remaining=0 → fading
    ghost.advancePlayhead(); // 11: target=6, remaining=3 → active
    ghost.advancePlayhead(); // 12: target=7, remaining=2 → active
    ghost.advancePlayhead(); // 13: target=8, remaining=1 → active
    ghost.advancePlayhead(); // 14: target=9, remaining=0 → fading
    expect(ghost.getLifecycleState()).toBe("fading");

    ghost.advancePlayhead(); // 15: target=10, no frame → inactive
    expect(ghost.getLifecycleState()).toBe("inactive");
    expect(ghost.getOpacity()).toBe(0);
  });

  it("fades gradually with longer fade duration", () => {
    // Use 125ms interval: delay=40, fadeDuration=8
    const ghost = new EchoGhost(125);
    const delay = ghost.delayInTicks; // 40
    const fadeTicks = ghost.fadeDurationTicks; // 8

    // Record delay + fadeTicks + 10 frames to have plenty of buffer
    const totalFrames = delay + fadeTicks + 10;
    for (let i = 0; i < totalFrames; i++) {
      ghost.record(seg([i, 0]));
    }
    // lastRecordedTick = totalFrames - 1

    ghost.stopRecording();
    expect(ghost.getLifecycleState()).toBe("active");
    expect(ghost.getOpacity()).toBe(1);

    // Advance until remaining = fadeTicks - 1 (entering fade)
    // target = currentTick - delay
    // remaining = lastRecordedTick - target
    // We want remaining = fadeTicks - 1
    // lastRecordedTick - (currentTick - delay) = fadeTicks - 1
    // currentTick = lastRecordedTick + delay - fadeTicks + 1
    const lastRec = totalFrames - 1;
    const targetTick = lastRec + delay - fadeTicks + 1;
    const ticksToAdvance = targetTick - ghost.getCurrentTick();

    for (let i = 0; i < ticksToAdvance; i++) {
      ghost.advancePlayhead();
    }

    expect(ghost.getLifecycleState()).toBe("fading");
    // At remaining = fadeTicks - 1, opacity should be 1.0
    expect(ghost.getOpacity()).toBe(1);

    // Advance one more — opacity should decrease
    ghost.advancePlayhead();
    expect(ghost.getLifecycleState()).toBe("fading");
    const opacity = ghost.getOpacity();
    expect(opacity).toBeLessThan(1);
    expect(opacity).toBeGreaterThan(0);

    // Advance until inactive
    let prevOpacity = opacity;
    let steps = 0;
    while (ghost.getLifecycleState() === "fading" && steps < 100) {
      ghost.advancePlayhead();
      const currentOpacity = ghost.getOpacity();
      expect(currentOpacity).toBeLessThanOrEqual(prevOpacity);
      prevOpacity = currentOpacity;
      steps++;
    }

    expect(ghost.getLifecycleState()).toBe("inactive");
    expect(ghost.getOpacity()).toBe(0);
  });

  it("opacity is 0 after all frames are exhausted", () => {
    const ghost = new EchoGhost(1000, 10); // delay=5, cap=10
    const delay = ghost.delayInTicks;

    for (let i = 0; i < delay + 2; i++) {
      ghost.record(seg([i, 0]));
    }

    ghost.stopRecording();

    // Drain all frames
    for (let i = 0; i < 20; i++) {
      ghost.advancePlayhead();
    }

    expect(ghost.getLifecycleState()).toBe("inactive");
    expect(ghost.getOpacity()).toBe(0);
    expect(ghost.getGhostTrail()).toBeNull();
  });
});

describe("EchoGhost bounded playback / rolling window", () => {
  it("does not grow buffer beyond capacity during continuous recording", () => {
    const ghost = new EchoGhost(125);
    const capacity = ghost.capacity;

    // Record 3x the capacity
    for (let i = 0; i < capacity * 3; i++) {
      ghost.record(seg([i % 40, 0]));
      expect(ghost.getCount()).toBeLessThanOrEqual(capacity);
    }
  });

  it("maintains rolling replay window (oldest frames are overwritten)", () => {
    const ghost = new EchoGhost(125);
    const capacity = ghost.capacity;
    const delay = ghost.delayInTicks;

    // Record well past the buffer capacity
    for (let i = 0; i < capacity + delay + 10; i++) {
      ghost.record(seg([i, 0]));
    }

    // Ghost trail should still be available (rolling window)
    expect(ghost.isActive()).toBe(true);
    const trail = ghost.getGhostTrail();
    expect(trail).not.toBeNull();

    // Very old frames should be gone
    expect(ghost.getFrameAtTick(0)).toBeNull();
  });

  it("ghost does not extend indefinitely after stopRecording", () => {
    const ghost = new EchoGhost(1000, 10); // delay=5, cap=10
    const delay = ghost.delayInTicks;

    // Record enough to activate
    for (let i = 0; i < delay + 5; i++) {
      ghost.record(seg([i, 0]));
    }
    expect(ghost.isActive()).toBe(true);

    ghost.stopRecording();

    // The ghost should eventually become inactive
    let active = true;
    let ticks = 0;
    while (active && ticks < 200) {
      ghost.advancePlayhead();
      active = ghost.isActive();
      ticks++;
    }

    expect(active).toBe(false);
    expect(ghost.getLifecycleState()).toBe("inactive");
    // Should not take more than the number of recorded frames + delay
    expect(ticks).toBeLessThanOrEqual(delay + 5 + 1);
  });
});

describe("EchoGhost lifecycle reset", () => {
  it("reset clears lifecycle state back to warming", () => {
    const ghost = new EchoGhost(125);
    const delay = ghost.delayInTicks;

    // Get to active state
    for (let i = 0; i < delay + 5; i++) {
      ghost.record(seg([i, 0]));
    }
    expect(ghost.getLifecycleState()).toBe("active");

    ghost.reset();
    expect(ghost.getLifecycleState()).toBe("warming");
    expect(ghost.isRecordingStopped()).toBe(false);
    expect(ghost.getOpacity()).toBe(0);
  });

  it("reset clears fading state", () => {
    const ghost = new EchoGhost(1000, 10);
    const delay = ghost.delayInTicks;

    for (let i = 0; i < delay + 5; i++) {
      ghost.record(seg([i, 0]));
    }
    ghost.stopRecording();

    // Advance into fading
    for (let i = 0; i < 5; i++) {
      ghost.advancePlayhead();
    }

    ghost.reset();
    expect(ghost.getLifecycleState()).toBe("warming");
    expect(ghost.isRecordingStopped()).toBe(false);
  });

  it("reset from inactive allows re-recording", () => {
    const ghost = new EchoGhost(1000, 10);
    const delay = ghost.delayInTicks;

    // Record, stop, drain to inactive
    for (let i = 0; i < delay + 2; i++) {
      ghost.record(seg([i, 0]));
    }
    ghost.stopRecording();
    for (let i = 0; i < 20; i++) {
      ghost.advancePlayhead();
    }
    expect(ghost.getLifecycleState()).toBe("inactive");

    ghost.reset();

    // Re-record and verify lifecycle works again
    for (let i = 0; i < delay; i++) {
      ghost.record(seg([100 + i, 5]));
    }
    expect(ghost.getLifecycleState()).toBe("active");
    expect(ghost.getOpacity()).toBe(1);
  });
});

describe("EchoGhost snapshot/restore with lifecycle", () => {
  it("snapshot preserves lifecycle state (recording stopped)", () => {
    const ghost = new EchoGhost(1000, 10);
    const delay = ghost.delayInTicks;

    for (let i = 0; i < delay + 3; i++) {
      ghost.record(seg([i, 0]));
    }
    ghost.stopRecording();
    ghost.advancePlayhead();

    const snap = ghost.snapshot();
    expect(snap.recordingStoppedAtTick).toBeGreaterThanOrEqual(0);
    expect(snap.lastRecordedTick).toBe(delay + 2);

    // Mutate state
    ghost.reset();

    // Restore
    ghost.restore(snap);
    expect(ghost.isRecordingStopped()).toBe(true);
  });

  it("snapshot preserves active lifecycle (recording not stopped)", () => {
    const ghost = new EchoGhost(1000, 10);
    const delay = ghost.delayInTicks;

    for (let i = 0; i < delay + 3; i++) {
      ghost.record(seg([i, 0]));
    }

    const snap = ghost.snapshot();
    ghost.stopRecording();
    ghost.reset();

    ghost.restore(snap);
    expect(ghost.isRecordingStopped()).toBe(false);
    expect(ghost.getLifecycleState()).toBe("active");
  });
});
