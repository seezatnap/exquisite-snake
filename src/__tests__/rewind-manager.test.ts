import { describe, it, expect, beforeEach } from "vitest";
import { RewindManager } from "@/game/systems/RewindManager";
import { EchoGhost } from "@/game/entities/EchoGhost";
import type { GridPos } from "@/game/utils/grid";

// ── Helpers ──────────────────────────────────────────────────────

/** Build a simple segments array for testing. */
function seg(...positions: [number, number][]): GridPos[] {
  return positions.map(([col, row]) => ({ col, row }));
}

/** Record enough ticks to activate an EchoGhost (past the delay). */
function activateGhost(ghost: EchoGhost): void {
  const delay = ghost.delayInTicks;
  for (let i = 0; i < delay + 5; i++) {
    ghost.record(seg([i, 0]));
  }
}

// ── Registration ─────────────────────────────────────────────────

describe("RewindManager registration", () => {
  let manager: RewindManager;

  beforeEach(() => {
    manager = new RewindManager();
  });

  it("starts with zero registered entities", () => {
    expect(manager.size).toBe(0);
    expect(manager.getRegisteredIds()).toEqual([]);
  });

  it("registers an entity", () => {
    const ghost = new EchoGhost();
    manager.register("echoGhost", ghost);

    expect(manager.size).toBe(1);
    expect(manager.has("echoGhost")).toBe(true);
    expect(manager.getRegisteredIds()).toEqual(["echoGhost"]);
  });

  it("registers multiple entities", () => {
    const ghost1 = new EchoGhost();
    const ghost2 = new EchoGhost();
    manager.register("ghost1", ghost1);
    manager.register("ghost2", ghost2);

    expect(manager.size).toBe(2);
    expect(manager.has("ghost1")).toBe(true);
    expect(manager.has("ghost2")).toBe(true);
  });

  it("overwrites an entry with the same id", () => {
    const ghost1 = new EchoGhost();
    const ghost2 = new EchoGhost();
    manager.register("echoGhost", ghost1);
    manager.register("echoGhost", ghost2);

    expect(manager.size).toBe(1);
  });

  it("unregisters an entity by id", () => {
    const ghost = new EchoGhost();
    manager.register("echoGhost", ghost);
    manager.unregister("echoGhost");

    expect(manager.size).toBe(0);
    expect(manager.has("echoGhost")).toBe(false);
  });

  it("unregister is a no-op for unknown ids", () => {
    manager.unregister("nonexistent");
    expect(manager.size).toBe(0);
  });

  it("clears all registered entities", () => {
    manager.register("a", new EchoGhost());
    manager.register("b", new EchoGhost());
    manager.clear();

    expect(manager.size).toBe(0);
    expect(manager.getRegisteredIds()).toEqual([]);
  });

  it("has returns false for unknown ids", () => {
    expect(manager.has("unknown")).toBe(false);
  });
});

// ── Snapshot ─────────────────────────────────────────────────────

describe("RewindManager snapshot", () => {
  let manager: RewindManager;

  beforeEach(() => {
    manager = new RewindManager();
  });

  it("creates an empty snapshot when no entities are registered", () => {
    const snap = manager.snapshot(0);
    expect(snap.timestamp).toBe(0);
    expect(snap.entries.size).toBe(0);
  });

  it("creates a snapshot with the correct timestamp", () => {
    const ghost = new EchoGhost();
    manager.register("echoGhost", ghost);

    const snap = manager.snapshot(42);
    expect(snap.timestamp).toBe(42);
  });

  it("captures the state of all registered entities", () => {
    const ghost1 = new EchoGhost(1000, 10);
    const ghost2 = new EchoGhost(1000, 10);
    ghost1.record(seg([1, 0]));
    ghost1.record(seg([2, 0]));
    ghost2.record(seg([10, 10]));

    manager.register("ghost1", ghost1);
    manager.register("ghost2", ghost2);

    const snap = manager.snapshot(5);

    expect(snap.entries.size).toBe(2);
    expect(snap.entries.has("ghost1")).toBe(true);
    expect(snap.entries.has("ghost2")).toBe(true);

    const snap1 = snap.entries.get("ghost1")!;
    expect(snap1.currentTick).toBe(2);
    expect(snap1.count).toBe(2);

    const snap2 = snap.entries.get("ghost2")!;
    expect(snap2.currentTick).toBe(1);
    expect(snap2.count).toBe(1);
  });

  it("snapshot is a deep copy (modifying entity after doesn't affect snapshot)", () => {
    const ghost = new EchoGhost(1000, 10);
    ghost.record(seg([1, 0]));
    manager.register("echoGhost", ghost);

    const snap = manager.snapshot(0);

    // Record more frames after snapshot
    ghost.record(seg([2, 0]));
    ghost.record(seg([3, 0]));

    // Snapshot should still reflect old state
    const entry = snap.entries.get("echoGhost")!;
    expect(entry.currentTick).toBe(1);
    expect(entry.count).toBe(1);
  });
});

// ── Restore ──────────────────────────────────────────────────────

describe("RewindManager restore", () => {
  let manager: RewindManager;

  beforeEach(() => {
    manager = new RewindManager();
  });

  it("restores a single entity to its snapshot state", () => {
    const ghost = new EchoGhost(1000, 10);
    activateGhost(ghost);
    manager.register("echoGhost", ghost);

    const snap = manager.snapshot(10);
    const trailBefore = ghost.getGhostTrail();

    // Advance the ghost further
    for (let i = 0; i < 5; i++) {
      ghost.record(seg([100 + i, 0]));
    }
    expect(ghost.getGhostTrail()).not.toEqual(trailBefore);

    // Restore
    manager.restore(snap);
    expect(ghost.getCurrentTick()).toBe(snap.entries.get("echoGhost")!.currentTick);
    expect(ghost.getGhostTrail()).toEqual(trailBefore);
  });

  it("restores multiple entities atomically", () => {
    const ghost1 = new EchoGhost(1000, 10);
    const ghost2 = new EchoGhost(1000, 10);
    ghost1.record(seg([1, 0]));
    ghost2.record(seg([10, 10]));
    manager.register("g1", ghost1);
    manager.register("g2", ghost2);

    const snap = manager.snapshot(0);

    // Advance both
    ghost1.record(seg([2, 0]));
    ghost2.record(seg([20, 20]));

    manager.restore(snap);

    expect(ghost1.getCurrentTick()).toBe(1);
    expect(ghost2.getCurrentTick()).toBe(1);
  });

  it("skips snapshot entries for unregistered entities", () => {
    const ghost = new EchoGhost(1000, 10);
    ghost.record(seg([1, 0]));
    manager.register("echoGhost", ghost);

    const snap = manager.snapshot(0);

    // Unregister the entity before restoring
    manager.unregister("echoGhost");

    // Should not throw
    expect(() => manager.restore(snap)).not.toThrow();
  });

  it("leaves entities untouched if they weren't in the snapshot", () => {
    const ghost1 = new EchoGhost(1000, 10);
    ghost1.record(seg([1, 0]));
    manager.register("g1", ghost1);

    const snap = manager.snapshot(0);

    // Register a new entity after the snapshot
    const ghost2 = new EchoGhost(1000, 10);
    ghost2.record(seg([10, 10]));
    ghost2.record(seg([11, 10]));
    manager.register("g2", ghost2);

    manager.restore(snap);

    // ghost1 should be restored
    expect(ghost1.getCurrentTick()).toBe(1);
    // ghost2 should be untouched (it wasn't in the snapshot)
    expect(ghost2.getCurrentTick()).toBe(2);
  });

  it("can restore from a snapshot taken before entity was fully active", () => {
    const ghost = new EchoGhost(1000, 10);
    ghost.record(seg([1, 0]));
    ghost.record(seg([2, 0]));
    manager.register("echoGhost", ghost);

    const earlySnap = manager.snapshot(2);

    // Activate the ghost
    activateGhost(ghost);
    expect(ghost.isActive()).toBe(true);

    // Restore to early state
    manager.restore(earlySnap);
    expect(ghost.getCurrentTick()).toBe(2);
  });
});

// ── Lifecycle integration ────────────────────────────────────────

describe("RewindManager lifecycle integration", () => {
  it("snapshot preserves recording-stopped state", () => {
    const manager = new RewindManager();
    const ghost = new EchoGhost(1000, 10);
    activateGhost(ghost);
    ghost.stopRecording();
    manager.register("echoGhost", ghost);

    const snap = manager.snapshot(0);
    ghost.reset();
    manager.restore(snap);

    expect(ghost.isRecordingStopped()).toBe(true);
  });

  it("snapshot preserves active (not stopped) state", () => {
    const manager = new RewindManager();
    const ghost = new EchoGhost(1000, 10);
    activateGhost(ghost);
    manager.register("echoGhost", ghost);

    const snap = manager.snapshot(0);
    ghost.stopRecording();
    ghost.reset();
    manager.restore(snap);

    expect(ghost.isRecordingStopped()).toBe(false);
    expect(ghost.getLifecycleState()).toBe("active");
  });

  it("works after clear and re-registration", () => {
    const manager = new RewindManager();
    const ghost1 = new EchoGhost(1000, 10);
    ghost1.record(seg([1, 0]));
    manager.register("echoGhost", ghost1);

    manager.clear();

    const ghost2 = new EchoGhost(1000, 10);
    ghost2.record(seg([10, 10]));
    manager.register("echoGhost", ghost2);

    const snap = manager.snapshot(0);
    expect(snap.entries.size).toBe(1);
    expect(snap.entries.get("echoGhost")!.currentTick).toBe(1);
  });
});

// ── Edge cases ───────────────────────────────────────────────────

describe("RewindManager edge cases", () => {
  it("restoring an empty snapshot is a no-op", () => {
    const manager = new RewindManager();
    const ghost = new EchoGhost(1000, 10);
    ghost.record(seg([1, 0]));
    manager.register("echoGhost", ghost);

    const emptySnap = new RewindManager().snapshot(0);
    manager.restore(emptySnap);

    // Ghost should be untouched
    expect(ghost.getCurrentTick()).toBe(1);
  });

  it("multiple snapshots can be taken at different points", () => {
    const manager = new RewindManager();
    const ghost = new EchoGhost(1000, 10);
    manager.register("echoGhost", ghost);

    ghost.record(seg([1, 0]));
    const snap1 = manager.snapshot(1);

    ghost.record(seg([2, 0]));
    ghost.record(seg([3, 0]));
    const snap2 = manager.snapshot(3);

    ghost.record(seg([4, 0]));

    // Restore to snap1
    manager.restore(snap1);
    expect(ghost.getCurrentTick()).toBe(1);

    // Restore to snap2
    manager.restore(snap2);
    expect(ghost.getCurrentTick()).toBe(3);
  });

  it("snapshot timestamp is independent of entity state", () => {
    const manager = new RewindManager();
    const ghost = new EchoGhost(1000, 10);
    ghost.record(seg([1, 0]));
    manager.register("echoGhost", ghost);

    const snap = manager.snapshot(999);
    expect(snap.timestamp).toBe(999);
    expect(snap.entries.get("echoGhost")!.currentTick).toBe(1);
  });
});
