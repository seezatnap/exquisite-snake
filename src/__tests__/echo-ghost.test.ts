import { describe, it, expect, beforeEach } from "vitest";
import {
  EchoGhost,
  CircularBuffer,
} from "../game/entities/EchoGhost";
import { DEFAULT_MOVE_INTERVAL_MS } from "../game/utils/grid";
import type { GridPos } from "../game/utils/grid";

// ── Helper ───────────────────────────────────────────────────────

/** Build a minimal snake snapshot from a list of [col, row] pairs. */
function snap(...positions: [number, number][]): GridPos[] {
  return positions.map(([col, row]) => ({ col, row }));
}

// ── CircularBuffer unit tests ────────────────────────────────────

describe("CircularBuffer", () => {
  it("starts empty", () => {
    const buf = new CircularBuffer<number>(5);
    expect(buf.count).toBe(0);
    expect(buf.size).toBe(5);
  });

  it("writes and reads values in order", () => {
    const buf = new CircularBuffer<number>(5);
    buf.write(10);
    buf.write(20);
    buf.write(30);

    expect(buf.count).toBe(3);
    // With delay 0 we can read all entries
    expect(buf.read(0, 0)).toBe(10);
    expect(buf.read(0, 1)).toBe(20);
    expect(buf.read(0, 2)).toBe(30);
  });

  it("overwrites oldest entries when full", () => {
    const buf = new CircularBuffer<number>(3);
    buf.write(1);
    buf.write(2);
    buf.write(3);
    buf.write(4); // overwrites 1

    expect(buf.count).toBe(3);
    // The oldest readable entry is now 2
    expect(buf.read(0, 0)).toBe(2);
    expect(buf.read(0, 1)).toBe(3);
    expect(buf.read(0, 2)).toBe(4);
  });

  it("returns undefined for out-of-range reads", () => {
    const buf = new CircularBuffer<number>(5);
    buf.write(10);
    expect(buf.read(0, -1)).toBeUndefined();
    expect(buf.read(0, 1)).toBeUndefined();
    expect(buf.read(0, 100)).toBeUndefined();
  });

  it("readableCount respects delay", () => {
    const buf = new CircularBuffer<number>(10);
    for (let i = 0; i < 5; i++) buf.write(i);

    expect(buf.readableCount(0)).toBe(5);
    expect(buf.readableCount(3)).toBe(2);
    expect(buf.readableCount(5)).toBe(0);
    expect(buf.readableCount(10)).toBe(0);
  });

  it("read with delay skips recent entries", () => {
    const buf = new CircularBuffer<number>(10);
    for (let i = 0; i < 8; i++) buf.write(i * 10);

    // With delay of 3, we can read entries 0–4 (5 entries, skipping last 3)
    expect(buf.readableCount(3)).toBe(5);
    expect(buf.read(3, 0)).toBe(0);
    expect(buf.read(3, 4)).toBe(40);
    expect(buf.read(3, 5)).toBeUndefined();
  });

  it("reset clears all state", () => {
    const buf = new CircularBuffer<number>(5);
    buf.write(1);
    buf.write(2);
    buf.reset();

    expect(buf.count).toBe(0);
    expect(buf.readableCount(0)).toBe(0);
    expect(buf.read(0, 0)).toBeUndefined();
  });

  it("snapshot and restore round-trip", () => {
    const buf = new CircularBuffer<number>(5);
    buf.write(10);
    buf.write(20);
    buf.write(30);

    const snapshot = buf.toSnapshot();

    // Mutate buffer after snapshot
    buf.write(40);
    buf.write(50);

    // Restore
    buf.fromSnapshot(snapshot);
    expect(buf.count).toBe(3);
    expect(buf.read(0, 0)).toBe(10);
    expect(buf.read(0, 2)).toBe(30);
  });
});

// ── EchoGhost unit tests ─────────────────────────────────────────

describe("EchoGhost", () => {
  let ghost: EchoGhost;

  // Default tick interval = 125 ms, so 5 000 / 125 = 40 delay ticks
  beforeEach(() => {
    ghost = new EchoGhost();
  });

  describe("construction", () => {
    it("computes correct delay ticks from default interval", () => {
      expect(ghost.getDelayTicks()).toBe(
        Math.ceil(5000 / DEFAULT_MOVE_INTERVAL_MS),
      );
    });

    it("computes delay ticks from custom interval", () => {
      const g = new EchoGhost(100, 5000);
      expect(g.getDelayTicks()).toBe(50);
    });

    it("computes delay ticks from custom delay", () => {
      const g = new EchoGhost(125, 3000);
      expect(g.getDelayTicks()).toBe(24); // ceil(3000/125)
    });

    it("accepts custom buffer capacity", () => {
      const g = new EchoGhost(125, 5000, 100);
      expect(g.getBufferCapacity()).toBe(100);
    });

    it("defaults buffer capacity to 2× delay ticks", () => {
      const g = new EchoGhost(125, 5000);
      expect(g.getBufferCapacity()).toBe(g.getDelayTicks() * 2);
    });

    it("starts with zero ticks written", () => {
      expect(ghost.getTotalTicksWritten()).toBe(0);
    });

    it("starts inactive", () => {
      expect(ghost.isActive()).toBe(false);
    });
  });

  describe("recording (write API)", () => {
    it("records ticks and increments counter", () => {
      ghost.recordTick(snap([5, 5]));
      expect(ghost.getTotalTicksWritten()).toBe(1);

      ghost.recordTick(snap([6, 5]));
      expect(ghost.getTotalTicksWritten()).toBe(2);
    });

    it("defensively copies segment data", () => {
      const segments = [{ col: 1, row: 1 }];
      ghost.recordTick(segments);

      // Mutate original — ghost should not be affected
      segments[0].col = 99;

      // We need delayTicks more entries so the first one becomes readable
      const delayTicks = ghost.getDelayTicks();
      for (let i = 1; i <= delayTicks; i++) {
        ghost.recordTick(snap([i + 1, 1]));
      }

      const trail = ghost.getGhostTrail();
      expect(trail.length).toBe(1);
      expect(trail[0].segments[0].col).toBe(1); // original value preserved
    });
  });

  describe("5-second replay delay", () => {
    it("ghost is not active before delay ticks are reached", () => {
      const delayTicks = ghost.getDelayTicks();
      for (let i = 0; i < delayTicks - 1; i++) {
        ghost.recordTick(snap([i, 0]));
      }
      expect(ghost.isActive()).toBe(false);
      expect(ghost.getGhostTrail()).toEqual([]);
      expect(ghost.getGhostHead()).toBeUndefined();
    });

    it("ghost becomes active exactly at delay ticks", () => {
      const delayTicks = ghost.getDelayTicks();
      for (let i = 0; i < delayTicks; i++) {
        ghost.recordTick(snap([i, 0]));
      }
      expect(ghost.isActive()).toBe(true);
    });

    it("delay ticks matches 5 seconds at default tick rate", () => {
      const g = new EchoGhost(DEFAULT_MOVE_INTERVAL_MS, 5000);
      const expectedTicks = Math.ceil(5000 / DEFAULT_MOVE_INTERVAL_MS);
      expect(g.getDelayTicks()).toBe(expectedTicks);

      // Verify the delay is 5 seconds worth of ticks
      const actualDelayMs = g.getDelayTicks() * DEFAULT_MOVE_INTERVAL_MS;
      expect(actualDelayMs).toBeGreaterThanOrEqual(5000);
      // Should not exceed 5 seconds + 1 tick
      expect(actualDelayMs).toBeLessThanOrEqual(5000 + DEFAULT_MOVE_INTERVAL_MS);
    });

    it("delay ticks correct for alternative tick rates", () => {
      // 100ms tick rate → 50 ticks for 5 seconds
      const g100 = new EchoGhost(100, 5000);
      expect(g100.getDelayTicks()).toBe(50);

      // 200ms tick rate → 25 ticks for 5 seconds
      const g200 = new EchoGhost(200, 5000);
      expect(g200.getDelayTicks()).toBe(25);

      // 60ms tick rate → ceil(5000/60) = 84 ticks
      const g60 = new EchoGhost(60, 5000);
      expect(g60.getDelayTicks()).toBe(84);
    });
  });

  describe("read API — ghost trail", () => {
    it("returns empty trail when ghost is inactive", () => {
      ghost.recordTick(snap([0, 0]));
      expect(ghost.getGhostTrail()).toEqual([]);
    });

    it("returns the delayed snapshot after delay ticks", () => {
      const delayTicks = ghost.getDelayTicks();

      // Record delayTicks entries: positions (0,0), (1,0), (2,0), ...
      for (let i = 0; i < delayTicks; i++) {
        ghost.recordTick(snap([i, 0]));
      }

      // The ghost trail should contain exactly 1 snapshot (the very first one)
      // since only 1 entry is delayTicks old
      // Actually: readableCount = count - delayTicks = delayTicks - delayTicks = 0
      // Need one more tick to have 1 readable
      ghost.recordTick(snap([delayTicks, 0]));

      const trail = ghost.getGhostTrail();
      expect(trail.length).toBe(1);
      expect(trail[0].segments).toEqual([{ col: 0, row: 0 }]);
    });

    it("trail grows as more ticks are recorded past the delay", () => {
      const delayTicks = ghost.getDelayTicks();

      // Record delayTicks + 5 entries
      for (let i = 0; i < delayTicks + 5; i++) {
        ghost.recordTick(snap([i, 0]));
      }

      const trail = ghost.getGhostTrail();
      expect(trail.length).toBe(5);
      // First readable should be position (0,0)
      expect(trail[0].segments[0]).toEqual({ col: 0, row: 0 });
      // Last readable should be position (4,0)
      expect(trail[4].segments[0]).toEqual({ col: 4, row: 0 });
    });

    it("handles multi-segment snake snapshots", () => {
      const delayTicks = ghost.getDelayTicks();

      // Record a 3-segment snake
      for (let i = 0; i < delayTicks + 1; i++) {
        ghost.recordTick(snap([i, 0], [i - 1, 0], [i - 2, 0]));
      }

      const head = ghost.getGhostHead();
      expect(head).toBeDefined();
      expect(head!.segments.length).toBe(3);
      expect(head!.segments[0]).toEqual({ col: 0, row: 0 });
      expect(head!.segments[1]).toEqual({ col: -1, row: 0 });
      expect(head!.segments[2]).toEqual({ col: -2, row: 0 });
    });
  });

  describe("getGhostHead", () => {
    it("returns undefined when ghost is inactive", () => {
      expect(ghost.getGhostHead()).toBeUndefined();
    });

    it("returns the most recent delayed snapshot", () => {
      const delayTicks = ghost.getDelayTicks();

      for (let i = 0; i < delayTicks + 3; i++) {
        ghost.recordTick(snap([i, 0]));
      }

      const head = ghost.getGhostHead();
      expect(head).toBeDefined();
      // The ghost head should be the snapshot from 3 ticks past the start
      // i.e., position (2,0) since indices 0,1,2 are now readable
      expect(head!.segments[0]).toEqual({ col: 2, row: 0 });
    });
  });

  describe("isOnGhost", () => {
    it("returns false when ghost is inactive", () => {
      expect(ghost.isOnGhost({ col: 0, row: 0 })).toBe(false);
    });

    it("returns true when position matches ghost head segment", () => {
      const delayTicks = ghost.getDelayTicks();
      for (let i = 0; i < delayTicks + 1; i++) {
        ghost.recordTick(snap([i, 5], [i - 1, 5]));
      }

      // Ghost head's segments should be at (0,5) and (-1,5)
      expect(ghost.isOnGhost({ col: 0, row: 5 })).toBe(true);
      expect(ghost.isOnGhost({ col: -1, row: 5 })).toBe(true);
    });

    it("returns false when position does not match", () => {
      const delayTicks = ghost.getDelayTicks();
      for (let i = 0; i < delayTicks + 1; i++) {
        ghost.recordTick(snap([i, 5]));
      }

      expect(ghost.isOnGhost({ col: 99, row: 99 })).toBe(false);
    });
  });

  describe("getGhostLength", () => {
    it("returns 0 before ghost is active", () => {
      expect(ghost.getGhostLength()).toBe(0);
    });

    it("returns correct count of readable snapshots", () => {
      const delayTicks = ghost.getDelayTicks();
      for (let i = 0; i < delayTicks + 10; i++) {
        ghost.recordTick(snap([i, 0]));
      }
      expect(ghost.getGhostLength()).toBe(10);
    });
  });

  describe("bounded buffer (circular overwrite)", () => {
    it("does not grow past buffer capacity", () => {
      // Small buffer for testing: 10 capacity, 5 tick delay
      const g = new EchoGhost(100, 500, 10);
      expect(g.getDelayTicks()).toBe(5);

      // Write 20 entries — buffer holds max 10
      for (let i = 0; i < 20; i++) {
        g.recordTick(snap([i, 0]));
      }

      expect(g.getTotalTicksWritten()).toBe(20);
      // Readable count is capped by buffer capacity minus delay
      expect(g.getGhostLength()).toBe(5); // 10 (capacity) - 5 (delay)
    });

    it("oldest entries are overwritten when buffer wraps", () => {
      const g = new EchoGhost(100, 500, 10);
      // delayTicks = 5, capacity = 10

      for (let i = 0; i < 15; i++) {
        g.recordTick(snap([i, 0]));
      }

      // Readable = min(count, capacity) - delay = 10 - 5 = 5
      const trail = g.getGhostTrail();
      expect(trail.length).toBe(5);
      // The oldest readable entry should be position 5 (entries 0-4 overwritten)
      expect(trail[0].segments[0]).toEqual({ col: 5, row: 0 });
      expect(trail[4].segments[0]).toEqual({ col: 9, row: 0 });
    });
  });

  describe("reset", () => {
    it("clears all state", () => {
      const delayTicks = ghost.getDelayTicks();
      for (let i = 0; i < delayTicks + 5; i++) {
        ghost.recordTick(snap([i, 0]));
      }

      expect(ghost.isActive()).toBe(true);
      expect(ghost.getGhostLength()).toBeGreaterThan(0);

      ghost.reset();

      expect(ghost.getTotalTicksWritten()).toBe(0);
      expect(ghost.isActive()).toBe(false);
      expect(ghost.getGhostTrail()).toEqual([]);
      expect(ghost.getGhostHead()).toBeUndefined();
      expect(ghost.getGhostLength()).toBe(0);
    });
  });

  describe("rewind support (Phase 6 hook)", () => {
    it("snapshot and restore round-trip preserves state", () => {
      const g = new EchoGhost(100, 500, 20);
      const delayTicks = g.getDelayTicks(); // 5

      // Write some entries
      for (let i = 0; i < delayTicks + 3; i++) {
        g.recordTick(snap([i, 0]));
      }

      const beforeTrail = g.getGhostTrail();
      const beforeHead = g.getGhostHead();
      const beforeTicks = g.getTotalTicksWritten();

      // Take snapshot
      const snapshot = g.snapshot();

      // Mutate state
      for (let i = 0; i < 10; i++) {
        g.recordTick(snap([100 + i, 100]));
      }

      // Verify state changed
      expect(g.getTotalTicksWritten()).not.toBe(beforeTicks);

      // Restore
      g.restore(snapshot);

      expect(g.getTotalTicksWritten()).toBe(beforeTicks);
      expect(g.getGhostTrail()).toEqual(beforeTrail);
      expect(g.getGhostHead()).toEqual(beforeHead);
    });

    it("snapshot has correct brand", () => {
      const snapshot = ghost.snapshot();
      expect(snapshot._brand).toBe("BufferSnapshot");
    });
  });

  describe("deterministic behavior", () => {
    it("produces identical trails given identical input sequences", () => {
      const g1 = new EchoGhost(100, 500, 20);
      const g2 = new EchoGhost(100, 500, 20);

      const positions: [number, number][][] = [];
      for (let i = 0; i < 15; i++) {
        positions.push([[i, i % 5]]);
      }

      for (const pos of positions) {
        g1.recordTick(snap(...pos));
        g2.recordTick(snap(...pos));
      }

      expect(g1.getGhostTrail()).toEqual(g2.getGhostTrail());
      expect(g1.getGhostHead()).toEqual(g2.getGhostHead());
      expect(g1.getGhostLength()).toBe(g2.getGhostLength());
      expect(g1.isActive()).toBe(g2.isActive());
    });

    it("read order is always oldest-first", () => {
      const g = new EchoGhost(100, 300, 20);
      // delayTicks = 3

      for (let i = 0; i < 10; i++) {
        g.recordTick(snap([i * 10, 0]));
      }

      const trail = g.getGhostTrail();
      // Verify strictly increasing col values (oldest first)
      for (let i = 1; i < trail.length; i++) {
        expect(trail[i].segments[0].col).toBeGreaterThan(
          trail[i - 1].segments[0].col,
        );
      }
    });
  });
});
