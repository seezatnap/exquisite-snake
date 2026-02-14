import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  EchoGhost,
  ECHO_DELAY_MS,
} from "@/game/entities/EchoGhost";
import { GhostFoodBurstQueue } from "@/game/systems/GhostFoodBurstQueue";
import { EchoRewindHook } from "@/game/systems/RewindHook";
import type { EchoStateSnapshot } from "@/game/systems/RewindHook";
import type { GridPos } from "@/game/utils/grid";
import { DEFAULT_MOVE_INTERVAL_MS } from "@/game/utils/grid";

const ROOT = path.resolve(__dirname, "../..");

// ── Helpers ──────────────────────────────────────────────────────

const DELAY_TICKS = Math.round(ECHO_DELAY_MS / DEFAULT_MOVE_INTERVAL_MS);

function makeSegments(headCol: number, length = 3): GridPos[] {
  return Array.from({ length }, (_, i) => ({
    col: headCol - i,
    row: 10,
  }));
}

function recordNTicks(
  ghost: EchoGhost,
  n: number,
  startCol = 10,
  length = 3,
): void {
  for (let i = 0; i < n; i++) {
    ghost.record(makeSegments(startCol + i, length));
  }
}

// ── GhostFoodBurstQueue snapshot/restore ─────────────────────────

describe("GhostFoodBurstQueue snapshot/restore", () => {
  let queue: GhostFoodBurstQueue;

  beforeEach(() => {
    queue = new GhostFoodBurstQueue(5);
  });

  it("snapshot captures current tick and pending bursts", () => {
    queue.enqueue(); // burst at tick 5
    queue.processTick(null); // tick 1
    queue.processTick(null); // tick 2
    queue.enqueue(); // burst at tick 7

    const snap = queue.snapshot();

    expect(snap.currentTick).toBe(2);
    expect(snap.queue).toHaveLength(2);
    expect(snap.queue[0].fireTick).toBe(5);
    expect(snap.queue[1].fireTick).toBe(7);
  });

  it("restore recovers identical state", () => {
    queue.enqueue();
    queue.processTick(null);
    queue.processTick(null);

    const snap = queue.snapshot();

    // Mutate by advancing further
    queue.enqueue();
    queue.processTick(null);
    queue.processTick(null);
    queue.processTick(null);

    queue.restore(snap);

    expect(queue.getCurrentTick()).toBe(snap.currentTick);
    expect(queue.getPendingCount()).toBe(snap.queue.length);
  });

  it("snapshot creates deep copies (no shared references)", () => {
    queue.enqueue();
    queue.processTick(null);

    const snap = queue.snapshot();
    snap.queue[0].fireTick = 999;
    snap.currentTick = 999;

    // Queue state should not be affected
    expect(queue.getCurrentTick()).toBe(1);
  });

  it("restore creates deep copies (mutating snap after restore has no effect)", () => {
    queue.enqueue();
    queue.processTick(null);

    const snap = queue.snapshot();
    queue.processTick(null);
    queue.processTick(null);
    queue.processTick(null);

    queue.restore(snap);
    snap.currentTick = 999;

    expect(queue.getCurrentTick()).toBe(1);
  });

  it("restored queue fires bursts at correct ticks", () => {
    const ghost = new EchoGhost(125, DEFAULT_MOVE_INTERVAL_MS);
    ghost.record(makeSegments(5)); // activate ghost (1-tick delay)

    queue.enqueue(); // burst fires at tick 5
    queue.processTick(ghost); // tick 1
    ghost.record(makeSegments(6));
    queue.processTick(ghost); // tick 2
    ghost.record(makeSegments(7));

    const snap = queue.snapshot();

    // Advance past fire tick
    ghost.record(makeSegments(8));
    queue.processTick(ghost); // tick 3
    ghost.record(makeSegments(9));
    queue.processTick(ghost); // tick 4
    ghost.record(makeSegments(10));
    queue.processTick(ghost); // tick 5 — burst fires

    expect(queue.getPendingCount()).toBe(0);

    // Restore to tick 2
    queue.restore(snap);

    expect(queue.getPendingCount()).toBe(1);
    expect(queue.getCurrentTick()).toBe(2);

    // Re-advance — burst should fire at tick 5 again
    ghost.record(makeSegments(11));
    queue.processTick(ghost); // tick 3
    ghost.record(makeSegments(12));
    queue.processTick(ghost); // tick 4
    expect(queue.getPendingCount()).toBe(1);

    ghost.record(makeSegments(13));
    const results = queue.processTick(ghost); // tick 5
    expect(results).toHaveLength(1);
    expect(queue.getPendingCount()).toBe(0);
  });

  it("snapshot of empty queue returns empty state", () => {
    const snap = queue.snapshot();
    expect(snap.queue).toEqual([]);
    expect(snap.currentTick).toBe(0);
  });
});

// ── EchoRewindHook ───────────────────────────────────────────────

describe("EchoRewindHook", () => {
  let ghost: EchoGhost;
  let burstQueue: GhostFoodBurstQueue;
  let hook: EchoRewindHook;

  beforeEach(() => {
    ghost = new EchoGhost();
    burstQueue = new GhostFoodBurstQueue(5);
    hook = new EchoRewindHook(ghost, burstQueue);
  });

  it("snapshot captures both ghost and burst queue state", () => {
    recordNTicks(ghost, DELAY_TICKS + 5);
    burstQueue.enqueue();
    burstQueue.processTick(ghost);

    const snap = hook.snapshot();

    expect(snap.ghost).not.toBeNull();
    expect(snap.ghost!.active).toBe(true);
    expect(snap.ghost!.ticksSinceStart).toBe(DELAY_TICKS + 5);
    expect(snap.burstQueue).not.toBeNull();
    expect(snap.burstQueue!.currentTick).toBe(1);
    expect(snap.burstQueue!.queue).toHaveLength(1);
  });

  it("restore recovers both ghost and burst queue state", () => {
    recordNTicks(ghost, DELAY_TICKS + 3);
    burstQueue.enqueue();
    burstQueue.processTick(ghost);

    const snap = hook.snapshot();

    // Mutate both entities
    recordNTicks(ghost, 10, 100);
    burstQueue.enqueue();
    burstQueue.processTick(ghost);
    burstQueue.processTick(ghost);

    hook.restore(snap);

    expect(ghost.getBufferedCount()).toBe(snap.ghost!.count);
    expect(burstQueue.getCurrentTick()).toBe(snap.burstQueue!.currentTick);
    expect(burstQueue.getPendingCount()).toBe(snap.burstQueue!.queue.length);
  });

  it("handles null ghost gracefully in snapshot", () => {
    const hookNoGhost = new EchoRewindHook(null, burstQueue);
    burstQueue.enqueue();
    burstQueue.processTick(null);

    const snap = hookNoGhost.snapshot();

    expect(snap.ghost).toBeNull();
    expect(snap.burstQueue).not.toBeNull();
    expect(snap.burstQueue!.currentTick).toBe(1);
  });

  it("handles null burst queue gracefully in snapshot", () => {
    const hookNoQueue = new EchoRewindHook(ghost, null);
    recordNTicks(ghost, DELAY_TICKS);

    const snap = hookNoQueue.snapshot();

    expect(snap.ghost).not.toBeNull();
    expect(snap.ghost!.active).toBe(true);
    expect(snap.burstQueue).toBeNull();
  });

  it("handles both null gracefully in snapshot", () => {
    const hookEmpty = new EchoRewindHook(null, null);
    const snap = hookEmpty.snapshot();

    expect(snap.ghost).toBeNull();
    expect(snap.burstQueue).toBeNull();
  });

  it("restore skips null ghost in snapshot (does not crash)", () => {
    recordNTicks(ghost, DELAY_TICKS + 3);

    const snapWithGhost = hook.snapshot();
    const snapNoGhost: EchoStateSnapshot = {
      ghost: null,
      burstQueue: snapWithGhost.burstQueue,
    };

    // Should not throw — ghost field is null in snapshot
    hook.restore(snapNoGhost);

    // Ghost should be unchanged (not reset)
    expect(ghost.active).toBe(true);
  });

  it("restore skips null burst queue in snapshot (does not crash)", () => {
    burstQueue.enqueue();
    burstQueue.processTick(null);

    const snapNoBurst: EchoStateSnapshot = {
      ghost: hook.snapshot().ghost,
      burstQueue: null,
    };

    // Should not throw
    hook.restore(snapNoBurst);

    // Burst queue should be unchanged
    expect(burstQueue.getCurrentTick()).toBe(1);
  });

  it("setEntities updates references for subsequent snapshots", () => {
    const newGhost = new EchoGhost(1000, DEFAULT_MOVE_INTERVAL_MS);
    const newQueue = new GhostFoodBurstQueue(10);

    hook.setEntities(newGhost, newQueue);

    recordNTicks(newGhost, 8); // 8 ticks (delay = 1000/125 = 8)
    newQueue.enqueue();

    const snap = hook.snapshot();

    expect(snap.ghost!.ticksSinceStart).toBe(8);
    expect(snap.burstQueue!.queue).toHaveLength(1);
  });

  it("setEntities to null produces null snapshots", () => {
    hook.setEntities(null, null);
    const snap = hook.snapshot();

    expect(snap.ghost).toBeNull();
    expect(snap.burstQueue).toBeNull();
  });
});

// ── Deterministic rewind scenario ────────────────────────────────

describe("EchoRewindHook deterministic rewind scenarios", () => {
  it("snapshot at tick T, advance to T+N, restore to T, replay produces same state at T+N", () => {
    const ghost = new EchoGhost();
    const burstQueue = new GhostFoodBurstQueue();
    const hook = new EchoRewindHook(ghost, burstQueue);

    // Advance to activation + 5 ticks
    recordNTicks(ghost, DELAY_TICKS + 5);
    burstQueue.enqueue();
    for (let i = 0; i < 5; i++) {
      burstQueue.processTick(ghost);
    }

    // Take snapshot at this point
    const snapAtT = hook.snapshot();

    // Record the exact segments we'll record during replay
    const replaySegments: GridPos[][] = [];
    for (let i = 0; i < 10; i++) {
      replaySegments.push(makeSegments(100 + i));
    }

    // Advance 10 more ticks with known inputs
    for (let i = 0; i < 10; i++) {
      ghost.record(replaySegments[i]);
      burstQueue.processTick(ghost);
    }

    // Capture the state after those 10 ticks
    const stateAfterAdvance = {
      ghostActive: ghost.active,
      ghostSegments: [...ghost.getSegments()],
      ghostBufferedCount: ghost.getBufferedCount(),
      ghostOpacity: ghost.opacity,
      burstTick: burstQueue.getCurrentTick(),
      burstPending: burstQueue.getPendingCount(),
    };

    // Restore to snapshot
    hook.restore(snapAtT);

    // Replay the same 10 ticks
    for (let i = 0; i < 10; i++) {
      ghost.record(replaySegments[i]);
      burstQueue.processTick(ghost);
    }

    // State should be identical
    expect(ghost.active).toBe(stateAfterAdvance.ghostActive);
    expect([...ghost.getSegments()]).toEqual(stateAfterAdvance.ghostSegments);
    expect(ghost.getBufferedCount()).toBe(stateAfterAdvance.ghostBufferedCount);
    expect(ghost.opacity).toBe(stateAfterAdvance.ghostOpacity);
    expect(burstQueue.getCurrentTick()).toBe(stateAfterAdvance.burstTick);
    expect(burstQueue.getPendingCount()).toBe(stateAfterAdvance.burstPending);
  });

  it("multiple restore cycles produce consistent state", () => {
    const ghost = new EchoGhost();
    const burstQueue = new GhostFoodBurstQueue();
    const hook = new EchoRewindHook(ghost, burstQueue);

    recordNTicks(ghost, DELAY_TICKS + 3);
    const snap = hook.snapshot();

    for (let cycle = 0; cycle < 3; cycle++) {
      // Advance with random-ish inputs
      recordNTicks(ghost, 5, 200 + cycle * 10);
      burstQueue.enqueue();
      burstQueue.processTick(ghost);

      // Restore
      hook.restore(snap);

      // Verify state matches snapshot
      expect(ghost.active).toBe(snap.ghost!.active);
      expect(ghost.opacity).toBe(snap.ghost!.opacity);
      expect(ghost.getBufferedCount()).toBe(snap.ghost!.count);
      expect(burstQueue.getCurrentTick()).toBe(snap.burstQueue!.currentTick);
    }
  });

  it("divergent paths from same snapshot produce different future write state", () => {
    const ghost = new EchoGhost();
    const burstQueue = new GhostFoodBurstQueue();
    const hook = new EchoRewindHook(ghost, burstQueue);

    // Snapshot before activation so the read cursor hasn't started yet.
    // Divergent writes will produce different buffers for when playback
    // eventually catches up.
    recordNTicks(ghost, 5);
    const snap = hook.snapshot();

    // Path A: fill the remaining delay with cols starting at 100
    recordNTicks(ghost, DELAY_TICKS - 5, 100);
    // Ghost now activated — the first read entry comes from the snapshot's
    // buffer, but new writes differ between paths.
    recordNTicks(ghost, DELAY_TICKS, 200); // advance enough for path-A writes to surface
    const pathABufferSnap = ghost.snapshot();

    // Restore and take path B: fill remaining delay with cols starting at 500
    hook.restore(snap);
    recordNTicks(ghost, DELAY_TICKS - 5, 500);
    recordNTicks(ghost, DELAY_TICKS, 600);
    const pathBBufferSnap = ghost.snapshot();

    // The buffer contents should differ because the recorded segments were different
    expect(pathABufferSnap.currentSegments[0].col).not.toBe(
      pathBBufferSnap.currentSegments[0].col,
    );
  });
});

// ── EchoGhost implements Rewindable ──────────────────────────────

describe("EchoGhost Rewindable interface compliance", () => {
  it("EchoGhost has snapshot method", () => {
    const ghost = new EchoGhost();
    expect(typeof ghost.snapshot).toBe("function");
  });

  it("EchoGhost has restore method", () => {
    const ghost = new EchoGhost();
    expect(typeof ghost.restore).toBe("function");
  });

  it("snapshot and restore form a round-trip for all fields", () => {
    const ghost = new EchoGhost();
    recordNTicks(ghost, DELAY_TICKS + 5);

    const snap = ghost.snapshot();

    // Verify all expected fields are present
    expect(snap).toHaveProperty("buffer");
    expect(snap).toHaveProperty("head");
    expect(snap).toHaveProperty("count");
    expect(snap).toHaveProperty("writeIndex");
    expect(snap).toHaveProperty("readIndex");
    expect(snap).toHaveProperty("active");
    expect(snap).toHaveProperty("opacity");
    expect(snap).toHaveProperty("currentSegments");
    expect(snap).toHaveProperty("ticksSinceStart");

    // Mutate
    recordNTicks(ghost, 20, 500);

    // Restore
    ghost.restore(snap);

    // Verify round-trip
    expect(ghost.active).toBe(snap.active);
    expect(ghost.opacity).toBe(snap.opacity);
    expect(ghost.getBufferedCount()).toBe(snap.count);
    expect([...ghost.getSegments()]).toEqual(snap.currentSegments);
  });
});

// ── GhostFoodBurstQueue Rewindable compliance ────────────────────

describe("GhostFoodBurstQueue Rewindable interface compliance", () => {
  it("GhostFoodBurstQueue has snapshot method", () => {
    const queue = new GhostFoodBurstQueue();
    expect(typeof queue.snapshot).toBe("function");
  });

  it("GhostFoodBurstQueue has restore method", () => {
    const queue = new GhostFoodBurstQueue();
    expect(typeof queue.restore).toBe("function");
  });

  it("snapshot and restore form a round-trip", () => {
    const queue = new GhostFoodBurstQueue(5);
    queue.enqueue();
    queue.processTick(null);
    queue.enqueue();

    const snap = queue.snapshot();

    expect(snap).toHaveProperty("queue");
    expect(snap).toHaveProperty("currentTick");

    // Mutate
    queue.processTick(null);
    queue.processTick(null);
    queue.processTick(null);
    queue.processTick(null);

    queue.restore(snap);

    expect(queue.getCurrentTick()).toBe(snap.currentTick);
    expect(queue.getPendingCount()).toBe(snap.queue.length);
  });
});

// ── Source integration checks ────────────────────────────────────

describe("Rewind hook source integration", () => {
  const mainSceneSource = fs.readFileSync(
    path.join(ROOT, "src/game/scenes/MainScene.ts"),
    "utf-8",
  );

  it("MainScene imports EchoRewindHook", () => {
    expect(mainSceneSource).toContain("EchoRewindHook");
    expect(mainSceneSource).toContain("systems/RewindHook");
  });

  it("MainScene declares echoRewindHook field", () => {
    expect(mainSceneSource).toMatch(/echoRewindHook/);
  });

  it("MainScene has getEchoRewindHook accessor", () => {
    expect(mainSceneSource).toContain("getEchoRewindHook()");
  });

  it("MainScene has snapshotEchoState convenience method", () => {
    expect(mainSceneSource).toContain("snapshotEchoState()");
  });

  it("MainScene has restoreEchoState convenience method", () => {
    expect(mainSceneSource).toContain("restoreEchoState(");
  });

  it("MainScene syncs echoRewindHook entities in createEntities", () => {
    expect(mainSceneSource).toContain(
      "echoRewindHook.setEntities(this.echoGhost, this.ghostFoodBurstQueue)",
    );
  });

  it("MainScene clears echoRewindHook entities in destroyEntities", () => {
    expect(mainSceneSource).toContain("echoRewindHook.setEntities(null, null)");
  });

  it("EchoGhost implements Rewindable interface", () => {
    const echoGhostSource = fs.readFileSync(
      path.join(ROOT, "src/game/entities/EchoGhost.ts"),
      "utf-8",
    );
    expect(echoGhostSource).toContain("implements Rewindable<EchoGhostBufferSnapshot>");
  });

  it("Rewindable interface is exported from rewindTypes", () => {
    const rewindTypesSource = fs.readFileSync(
      path.join(ROOT, "src/game/systems/rewindTypes.ts"),
      "utf-8",
    );
    expect(rewindTypesSource).toContain("export interface Rewindable<TSnapshot>");
  });

  it("EchoStateSnapshot type is exported from RewindHook module", () => {
    const rewindHookSource = fs.readFileSync(
      path.join(ROOT, "src/game/systems/RewindHook.ts"),
      "utf-8",
    );
    expect(rewindHookSource).toContain("EchoStateSnapshot");
  });

  it("GhostFoodBurstQueue has snapshot and restore methods", () => {
    const burstQueueSource = fs.readFileSync(
      path.join(ROOT, "src/game/systems/GhostFoodBurstQueue.ts"),
      "utf-8",
    );
    expect(burstQueueSource).toContain("snapshot(): GhostFoodBurstQueueSnapshot");
    expect(burstQueueSource).toContain("restore(snap: GhostFoodBurstQueueSnapshot)");
  });
});

// ── Idempotency ──────────────────────────────────────────────────

describe("Rewind hook idempotency", () => {
  it("double-snapshot produces identical payloads", () => {
    const ghost = new EchoGhost();
    const burstQueue = new GhostFoodBurstQueue();
    const hook = new EchoRewindHook(ghost, burstQueue);

    recordNTicks(ghost, DELAY_TICKS + 3);
    burstQueue.enqueue();
    burstQueue.processTick(ghost);

    const snap1 = hook.snapshot();
    const snap2 = hook.snapshot();

    expect(snap1).toEqual(snap2);
  });

  it("restore then snapshot produces equivalent payload", () => {
    const ghost = new EchoGhost();
    const burstQueue = new GhostFoodBurstQueue();
    const hook = new EchoRewindHook(ghost, burstQueue);

    recordNTicks(ghost, DELAY_TICKS + 3);
    burstQueue.enqueue();
    burstQueue.processTick(ghost);

    const snap = hook.snapshot();

    // Mutate
    recordNTicks(ghost, 10, 100);

    // Restore
    hook.restore(snap);

    // Snapshot again
    const snapAfterRestore = hook.snapshot();

    expect(snapAfterRestore).toEqual(snap);
  });
});
