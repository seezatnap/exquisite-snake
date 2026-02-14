import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  EchoGhost,
  CircularBuffer,
} from "../game/entities/EchoGhost";
import type { RewindEvent, RewindStateProvider } from "../game/entities/EchoGhost";
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

  // ── Lifecycle management tests ──────────────────────────────────

  describe("lifecycle states", () => {
    it("starts in 'inactive' state", () => {
      expect(ghost.getLifecycleState()).toBe("inactive");
      expect(ghost.isExpired()).toBe(false);
      expect(ghost.isFadingOut()).toBe(false);
    });

    it("transitions to 'active' when delay ticks are reached", () => {
      const delayTicks = ghost.getDelayTicks();
      for (let i = 0; i < delayTicks - 1; i++) {
        ghost.recordTick(snap([i, 0]));
      }
      expect(ghost.getLifecycleState()).toBe("inactive");

      ghost.recordTick(snap([delayTicks - 1, 0]));
      expect(ghost.getLifecycleState()).toBe("active");
    });

    it("transitions to 'fadingOut' when stopRecording is called", () => {
      const g = new EchoGhost(100, 500, 20);
      const delayTicks = g.getDelayTicks(); // 5
      for (let i = 0; i < delayTicks + 3; i++) {
        g.recordTick(snap([i, 0]));
      }
      expect(g.getLifecycleState()).toBe("active");

      g.stopRecording();
      expect(g.getLifecycleState()).toBe("fadingOut");
      expect(g.isFadingOut()).toBe(true);
    });

    it("transitions to 'expired' after all fade-out ticks", () => {
      const g = new EchoGhost(100, 500, 20);
      const delayTicks = g.getDelayTicks(); // 5
      for (let i = 0; i < delayTicks + 3; i++) {
        g.recordTick(snap([i, 0]));
      }

      g.stopRecording();

      const fadeOutDuration = g.getTrailWindow(); // 5
      for (let i = 0; i < fadeOutDuration - 1; i++) {
        expect(g.advanceFadeOut()).toBe(true);
        expect(g.getLifecycleState()).toBe("fadingOut");
      }

      expect(g.advanceFadeOut()).toBe(false);
      expect(g.getLifecycleState()).toBe("expired");
      expect(g.isExpired()).toBe(true);
    });

    it("stopRecording is a no-op when inactive", () => {
      ghost.stopRecording();
      expect(ghost.getLifecycleState()).toBe("inactive");
    });

    it("stopRecording is a no-op when already fading out", () => {
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < g.getDelayTicks() + 3; i++) {
        g.recordTick(snap([i, 0]));
      }
      g.stopRecording();
      expect(g.getLifecycleState()).toBe("fadingOut");

      // Advance a bit, then call stopRecording again
      g.advanceFadeOut();
      g.stopRecording();
      expect(g.getLifecycleState()).toBe("fadingOut");
    });

    it("stopRecording is a no-op when expired", () => {
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < g.getDelayTicks() + 3; i++) {
        g.recordTick(snap([i, 0]));
      }
      g.stopRecording();
      for (let i = 0; i < g.getTrailWindow(); i++) {
        g.advanceFadeOut();
      }
      expect(g.getLifecycleState()).toBe("expired");

      g.stopRecording();
      expect(g.getLifecycleState()).toBe("expired");
    });

    it("advanceFadeOut returns false when not fading out", () => {
      expect(ghost.advanceFadeOut()).toBe(false);

      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < g.getDelayTicks() + 3; i++) {
        g.recordTick(snap([i, 0]));
      }
      // Still active, not fading
      expect(g.advanceFadeOut()).toBe(false);
    });
  });

  describe("recordTick during fadingOut/expired", () => {
    it("recordTick is a no-op during fadingOut", () => {
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < g.getDelayTicks() + 3; i++) {
        g.recordTick(snap([i, 0]));
      }
      const ticksBefore = g.getTotalTicksWritten();
      g.stopRecording();

      g.recordTick(snap([99, 99]));
      expect(g.getTotalTicksWritten()).toBe(ticksBefore);
    });

    it("recordTick is a no-op after expired", () => {
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < g.getDelayTicks() + 3; i++) {
        g.recordTick(snap([i, 0]));
      }
      g.stopRecording();
      for (let i = 0; i < g.getTrailWindow(); i++) {
        g.advanceFadeOut();
      }
      const ticksBefore = g.getTotalTicksWritten();

      g.recordTick(snap([99, 99]));
      expect(g.getTotalTicksWritten()).toBe(ticksBefore);
    });
  });

  describe("rolling replay window (trailWindow)", () => {
    it("defaults trailWindow to delayTicks", () => {
      const g = new EchoGhost(100, 500, 20);
      expect(g.getTrailWindow()).toBe(g.getDelayTicks()); // 5
    });

    it("accepts custom trail window size", () => {
      const g = new EchoGhost(100, 500, 20, 8);
      expect(g.getTrailWindow()).toBe(8);
    });

    it("caps ghost trail length to trailWindow", () => {
      // delayTicks = 5, capacity = 30, trailWindow = 3
      const g = new EchoGhost(100, 500, 30, 3);

      // Record 15 entries; readable = 15 - 5 = 10, but window = 3
      for (let i = 0; i < 15; i++) {
        g.recordTick(snap([i, 0]));
      }

      expect(g.getGhostLength()).toBe(3);
      const trail = g.getGhostTrail();
      expect(trail.length).toBe(3);
      // Trail should contain the 3 most recent readable entries
      expect(trail[0].segments[0]).toEqual({ col: 7, row: 0 });
      expect(trail[1].segments[0]).toEqual({ col: 8, row: 0 });
      expect(trail[2].segments[0]).toEqual({ col: 9, row: 0 });
    });

    it("trail does not exceed trailWindow even with large buffer", () => {
      // delayTicks = 5, capacity = 100, trailWindow = 5
      const g = new EchoGhost(100, 500, 100);

      // Record 60 entries; readable = 55, but window = 5
      for (let i = 0; i < 60; i++) {
        g.recordTick(snap([i, 0]));
      }

      expect(g.getGhostLength()).toBe(5);
      const trail = g.getGhostTrail();
      expect(trail.length).toBe(5);
    });

    it("trail is a sliding window showing most recent readable entries", () => {
      // delayTicks = 3, capacity = 20, trailWindow = 4
      const g = new EchoGhost(100, 300, 20, 4);

      for (let i = 0; i < 10; i++) {
        g.recordTick(snap([i, 0]));
      }
      // readable = 10 - 3 = 7, window = 4
      const trail = g.getGhostTrail();
      expect(trail.length).toBe(4);
      // Should show entries [3, 4, 5, 6] (the most recent 4 readable)
      expect(trail[0].segments[0]).toEqual({ col: 3, row: 0 });
      expect(trail[3].segments[0]).toEqual({ col: 6, row: 0 });
    });
  });

  describe("fade-out opacity", () => {
    it("getFadeOpacity returns 1 when active", () => {
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < g.getDelayTicks() + 3; i++) {
        g.recordTick(snap([i, 0]));
      }
      expect(g.getFadeOpacity()).toBe(1);
    });

    it("getFadeOpacity returns 1 when inactive", () => {
      expect(ghost.getFadeOpacity()).toBe(1);
    });

    it("getFadeOpacity decreases during fade-out", () => {
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < g.getDelayTicks() + 3; i++) {
        g.recordTick(snap([i, 0]));
      }
      g.stopRecording();

      const fadeOutDuration = g.getTrailWindow();
      const opacities: number[] = [];
      for (let i = 0; i < fadeOutDuration; i++) {
        opacities.push(g.getFadeOpacity());
        g.advanceFadeOut();
      }

      // Each opacity should be less than or equal to the previous
      for (let i = 1; i < opacities.length; i++) {
        expect(opacities[i]).toBeLessThanOrEqual(opacities[i - 1]);
      }
      // First should be 1, last should be near 0
      expect(opacities[0]).toBe(1);
      expect(opacities[opacities.length - 1]).toBeGreaterThan(0);
    });

    it("getFadeOpacity returns 0 when expired", () => {
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < g.getDelayTicks() + 3; i++) {
        g.recordTick(snap([i, 0]));
      }
      g.stopRecording();
      for (let i = 0; i < g.getTrailWindow(); i++) {
        g.advanceFadeOut();
      }
      expect(g.getFadeOpacity()).toBe(0);
    });
  });

  describe("getGhostTrailWithOpacity", () => {
    it("returns empty array when inactive", () => {
      expect(ghost.getGhostTrailWithOpacity()).toEqual([]);
    });

    it("returns empty array when expired", () => {
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < g.getDelayTicks() + 3; i++) {
        g.recordTick(snap([i, 0]));
      }
      g.stopRecording();
      for (let i = 0; i < g.getTrailWindow(); i++) {
        g.advanceFadeOut();
      }
      expect(g.getGhostTrailWithOpacity()).toEqual([]);
    });

    it("returns entries with positional opacity gradient", () => {
      // delayTicks = 3, capacity = 20, trailWindow = 3
      const g = new EchoGhost(100, 300, 20);

      for (let i = 0; i < 7; i++) {
        g.recordTick(snap([i, 0]));
      }

      const trailWithOpacity = g.getGhostTrailWithOpacity();
      expect(trailWithOpacity.length).toBe(3);

      // Oldest entry should have lower opacity than newest
      expect(trailWithOpacity[0].opacity).toBeLessThan(
        trailWithOpacity[trailWithOpacity.length - 1].opacity,
      );

      // Newest entry should be at full opacity (1.0)
      expect(trailWithOpacity[trailWithOpacity.length - 1].opacity).toBe(1);

      // Oldest entry should be at ~0.2
      expect(trailWithOpacity[0].opacity).toBeCloseTo(0.2, 2);
    });

    it("single-entry trail has opacity 1", () => {
      const g = new EchoGhost(100, 300, 20);

      // Record exactly delayTicks + 1 entries
      for (let i = 0; i < 4; i++) {
        g.recordTick(snap([i, 0]));
      }

      const trailWithOpacity = g.getGhostTrailWithOpacity();
      expect(trailWithOpacity.length).toBe(1);
      expect(trailWithOpacity[0].opacity).toBe(1);
    });

    it("applies global fade multiplier during fade-out", () => {
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < g.getDelayTicks() + 3; i++) {
        g.recordTick(snap([i, 0]));
      }

      // Get opacities before fade-out
      const beforeFade = g.getGhostTrailWithOpacity();
      const maxOpacityBefore = beforeFade[beforeFade.length - 1].opacity;

      g.stopRecording();
      // Advance fade-out halfway
      const halfDuration = Math.floor(g.getTrailWindow() / 2);
      for (let i = 0; i < halfDuration; i++) {
        g.advanceFadeOut();
      }

      const duringFade = g.getGhostTrailWithOpacity();
      const maxOpacityDuring = duringFade[duringFade.length - 1].opacity;

      // All opacities should be reduced during fade-out
      expect(maxOpacityDuring).toBeLessThan(maxOpacityBefore);
    });

    it("snapshots in trail match getGhostTrail", () => {
      const g = new EchoGhost(100, 300, 20);

      for (let i = 0; i < 8; i++) {
        g.recordTick(snap([i, 0]));
      }

      const trail = g.getGhostTrail();
      const trailWithOpacity = g.getGhostTrailWithOpacity();

      expect(trailWithOpacity.length).toBe(trail.length);
      for (let i = 0; i < trail.length; i++) {
        expect(trailWithOpacity[i].snapshot).toEqual(trail[i]);
      }
    });
  });

  describe("expired ghost behavior", () => {
    it("getGhostTrail returns empty after expiry", () => {
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < g.getDelayTicks() + 3; i++) {
        g.recordTick(snap([i, 0]));
      }
      g.stopRecording();
      for (let i = 0; i < g.getTrailWindow(); i++) {
        g.advanceFadeOut();
      }

      expect(g.getGhostTrail()).toEqual([]);
      expect(g.getGhostHead()).toBeUndefined();
      expect(g.getGhostLength()).toBe(0);
      expect(g.isActive()).toBe(false);
      expect(g.isOnGhost({ col: 0, row: 0 })).toBe(false);
    });
  });

  describe("reset clears lifecycle state", () => {
    it("resets from fadingOut to inactive", () => {
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < g.getDelayTicks() + 3; i++) {
        g.recordTick(snap([i, 0]));
      }
      g.stopRecording();
      g.advanceFadeOut();

      g.reset();
      expect(g.getLifecycleState()).toBe("inactive");
      expect(g.isFadingOut()).toBe(false);
      expect(g.getFadeOpacity()).toBe(1);
    });

    it("resets from expired to inactive", () => {
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < g.getDelayTicks() + 3; i++) {
        g.recordTick(snap([i, 0]));
      }
      g.stopRecording();
      for (let i = 0; i < g.getTrailWindow(); i++) {
        g.advanceFadeOut();
      }
      expect(g.isExpired()).toBe(true);

      g.reset();
      expect(g.getLifecycleState()).toBe("inactive");
      expect(g.isExpired()).toBe(false);
      expect(g.getFadeOpacity()).toBe(1);
    });

    it("can record and activate again after reset", () => {
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < g.getDelayTicks() + 3; i++) {
        g.recordTick(snap([i, 0]));
      }
      g.stopRecording();
      for (let i = 0; i < g.getTrailWindow(); i++) {
        g.advanceFadeOut();
      }

      g.reset();

      // Should be able to start a fresh lifecycle
      for (let i = 0; i < g.getDelayTicks() + 2; i++) {
        g.recordTick(snap([100 + i, 0]));
      }
      expect(g.isActive()).toBe(true);
      expect(g.getLifecycleState()).toBe("active");
      expect(g.getGhostTrail().length).toBe(2);
    });
  });

  describe("rewind support preserves lifecycle state", () => {
    it("snapshot/restore round-trip preserves fadingOut state", () => {
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < g.getDelayTicks() + 3; i++) {
        g.recordTick(snap([i, 0]));
      }
      g.stopRecording();
      g.advanceFadeOut();
      g.advanceFadeOut();

      const snap1 = g.snapshot();

      // Mutate further
      g.advanceFadeOut();
      g.advanceFadeOut();

      g.restore(snap1);
      expect(g.getLifecycleState()).toBe("fadingOut");
      expect(g.getFadeOpacity()).toBeGreaterThan(0);
    });

    it("snapshot includes lifecycle fields", () => {
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < g.getDelayTicks() + 3; i++) {
        g.recordTick(snap([i, 0]));
      }
      g.stopRecording();

      const snap1 = g.snapshot();
      expect(snap1.lifecycleState).toBe("fadingOut");
      expect(snap1.fadeOutTick).toBe(0);
      expect(snap1.fadeOutDuration).toBe(g.getTrailWindow());
    });
  });

  // ── RewindStateProvider interface tests ──────────────────────────

  describe("RewindStateProvider interface", () => {
    it("EchoGhost satisfies RewindStateProvider", () => {
      const provider: RewindStateProvider = new EchoGhost(100, 500, 20);
      expect(typeof provider.snapshot).toBe("function");
      expect(typeof provider.restore).toBe("function");
      expect(typeof provider.onRewindEvent).toBe("function");
      expect(typeof provider.canRewind).toBe("function");
      expect(typeof provider.getTickIndex).toBe("function");
      expect(typeof provider.getLifecycleState).toBe("function");
    });
  });

  describe("canRewind", () => {
    it("returns false when no ticks recorded", () => {
      expect(ghost.canRewind()).toBe(false);
    });

    it("returns true after recording a tick", () => {
      ghost.recordTick(snap([0, 0]));
      expect(ghost.canRewind()).toBe(true);
    });

    it("returns true even during fadingOut", () => {
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < g.getDelayTicks() + 3; i++) {
        g.recordTick(snap([i, 0]));
      }
      g.stopRecording();
      expect(g.canRewind()).toBe(true);
    });

    it("returns false after reset", () => {
      ghost.recordTick(snap([0, 0]));
      ghost.reset();
      expect(ghost.canRewind()).toBe(false);
    });
  });

  describe("getTickIndex", () => {
    it("returns 0 initially", () => {
      expect(ghost.getTickIndex()).toBe(0);
    });

    it("matches getTotalTicksWritten", () => {
      ghost.recordTick(snap([0, 0]));
      ghost.recordTick(snap([1, 0]));
      ghost.recordTick(snap([2, 0]));
      expect(ghost.getTickIndex()).toBe(ghost.getTotalTicksWritten());
      expect(ghost.getTickIndex()).toBe(3);
    });

    it("is restored by snapshot/restore", () => {
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < 7; i++) {
        g.recordTick(snap([i, 0]));
      }
      const s = g.snapshot();
      for (let i = 0; i < 5; i++) {
        g.recordTick(snap([100 + i, 0]));
      }
      g.restore(s);
      expect(g.getTickIndex()).toBe(7);
    });
  });

  // ── Rewind hook listener tests ──────────────────────────────────

  describe("onRewindEvent", () => {
    it("returns an unsubscribe function", () => {
      const listener = vi.fn();
      const unsub = ghost.onRewindEvent(listener);
      expect(typeof unsub).toBe("function");
      unsub();
    });

    it("emits tick events on each recordTick", () => {
      const events: RewindEvent[] = [];
      ghost.onRewindEvent((e) => events.push(e));

      ghost.recordTick(snap([0, 0]));
      ghost.recordTick(snap([1, 0]));

      const tickEvents = events.filter((e) => e.type === "tick");
      expect(tickEvents.length).toBe(2);
      expect(tickEvents[0]).toEqual({ type: "tick", tickIndex: 1 });
      expect(tickEvents[1]).toEqual({ type: "tick", tickIndex: 2 });
    });

    it("emits lifecycleChange when transitioning inactive → active", () => {
      const events: RewindEvent[] = [];
      const g = new EchoGhost(100, 500, 20);
      g.onRewindEvent((e) => events.push(e));

      const delayTicks = g.getDelayTicks(); // 5
      for (let i = 0; i < delayTicks; i++) {
        g.recordTick(snap([i, 0]));
      }

      const lifecycleEvents = events.filter((e) => e.type === "lifecycleChange");
      expect(lifecycleEvents.length).toBe(1);
      expect(lifecycleEvents[0]).toEqual({
        type: "lifecycleChange",
        from: "inactive",
        to: "active",
      });
    });

    it("emits lifecycleChange when transitioning active → fadingOut", () => {
      const events: RewindEvent[] = [];
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < g.getDelayTicks() + 3; i++) {
        g.recordTick(snap([i, 0]));
      }

      g.onRewindEvent((e) => events.push(e));
      g.stopRecording();

      const lifecycleEvents = events.filter((e) => e.type === "lifecycleChange");
      expect(lifecycleEvents.length).toBe(1);
      expect(lifecycleEvents[0]).toEqual({
        type: "lifecycleChange",
        from: "active",
        to: "fadingOut",
      });
    });

    it("emits lifecycleChange when transitioning fadingOut → expired", () => {
      const events: RewindEvent[] = [];
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < g.getDelayTicks() + 3; i++) {
        g.recordTick(snap([i, 0]));
      }
      g.stopRecording();

      g.onRewindEvent((e) => events.push(e));

      for (let i = 0; i < g.getTrailWindow(); i++) {
        g.advanceFadeOut();
      }

      const lifecycleEvents = events.filter((e) => e.type === "lifecycleChange");
      expect(lifecycleEvents.length).toBe(1);
      expect(lifecycleEvents[0]).toEqual({
        type: "lifecycleChange",
        from: "fadingOut",
        to: "expired",
      });
    });

    it("emits restore event when snapshot is restored", () => {
      const events: RewindEvent[] = [];
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < 5; i++) {
        g.recordTick(snap([i, 0]));
      }
      const s = g.snapshot();

      g.onRewindEvent((e) => events.push(e));
      g.restore(s);

      const restoreEvents = events.filter((e) => e.type === "restore");
      expect(restoreEvents.length).toBe(1);
      expect(restoreEvents[0].type).toBe("restore");
      if (restoreEvents[0].type === "restore") {
        expect(restoreEvents[0].snapshot).toBe(s);
      }
    });

    it("unsubscribed listener does not receive events", () => {
      const listener = vi.fn();
      const unsub = ghost.onRewindEvent(listener);
      unsub();

      ghost.recordTick(snap([0, 0]));
      expect(listener).not.toHaveBeenCalled();
    });

    it("supports multiple listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      ghost.onRewindEvent(listener1);
      ghost.onRewindEvent(listener2);

      ghost.recordTick(snap([0, 0]));

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it("unsubscribing one listener does not affect others", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const unsub1 = ghost.onRewindEvent(listener1);
      ghost.onRewindEvent(listener2);

      unsub1();
      ghost.recordTick(snap([0, 0]));

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it("does not emit tick events during fadingOut/expired", () => {
      const g = new EchoGhost(100, 500, 20);
      for (let i = 0; i < g.getDelayTicks() + 3; i++) {
        g.recordTick(snap([i, 0]));
      }
      g.stopRecording();

      const events: RewindEvent[] = [];
      g.onRewindEvent((e) => events.push(e));

      // recordTick should no-op during fadingOut
      g.recordTick(snap([99, 99]));
      const tickEvents = events.filter((e) => e.type === "tick");
      expect(tickEvents.length).toBe(0);
    });

    it("lifecycleChange event fires before tick event on activation", () => {
      const events: RewindEvent[] = [];
      const g = new EchoGhost(100, 500, 20);
      g.onRewindEvent((e) => events.push(e));

      const delayTicks = g.getDelayTicks();
      for (let i = 0; i < delayTicks; i++) {
        g.recordTick(snap([i, 0]));
      }

      // On the activation tick, lifecycleChange should fire before tick
      const activationTick = delayTicks; // this is the tick that triggers activation
      const lcIndex = events.findIndex(
        (e) => e.type === "lifecycleChange" && "to" in e && e.to === "active"
      );
      const tickIndex = events.findIndex(
        (e) => e.type === "tick" && "tickIndex" in e && e.tickIndex === activationTick
      );
      expect(lcIndex).toBeGreaterThanOrEqual(0);
      expect(tickIndex).toBeGreaterThanOrEqual(0);
      expect(lcIndex).toBeLessThan(tickIndex);
    });
  });
});
