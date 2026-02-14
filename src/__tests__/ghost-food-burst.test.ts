import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { GhostFoodScheduler } from "@/game/systems/ghostFoodBurst";
import { EchoGhost } from "@/game/entities/EchoGhost";
import { type GridPos, gridToPixel } from "@/game/utils/grid";

const ROOT = path.resolve(__dirname, "../..");

// ── Helpers ──────────────────────────────────────────────────────

/** Build a simple segments array for testing. */
function seg(...positions: [number, number][]): GridPos[] {
  return positions.map(([col, row]) => ({ col, row }));
}

// ── GhostFoodScheduler unit tests ────────────────────────────────

describe("GhostFoodScheduler", () => {
  let scheduler: GhostFoodScheduler;
  let ghost: EchoGhost;

  beforeEach(() => {
    scheduler = new GhostFoodScheduler();
    // Use 1000ms tick interval for simpler math: delay = 5 ticks
    ghost = new EchoGhost(1000, 15);
  });

  it("starts with zero pending bursts", () => {
    expect(scheduler.getPendingCount()).toBe(0);
  });

  it("increments pending count on schedule", () => {
    scheduler.schedule(3);
    expect(scheduler.getPendingCount()).toBe(1);
    scheduler.schedule(7);
    expect(scheduler.getPendingCount()).toBe(2);
  });

  it("reset clears all pending bursts", () => {
    scheduler.schedule(1);
    scheduler.schedule(2);
    scheduler.schedule(3);
    expect(scheduler.getPendingCount()).toBe(3);

    scheduler.reset();
    expect(scheduler.getPendingCount()).toBe(0);
  });

  it("returns empty array when no bursts are pending", () => {
    // Record enough to make ghost active
    for (let i = 0; i < ghost.delayInTicks; i++) {
      ghost.record(seg([i, 0]));
    }
    const results = scheduler.processTick(ghost);
    expect(results).toEqual([]);
  });

  it("returns empty array when ghost is not yet active", () => {
    scheduler.schedule(0);
    // Record only 1 frame — ghost not yet active
    ghost.record(seg([0, 0]));
    const results = scheduler.processTick(ghost);
    expect(results).toEqual([]);
  });

  it("fires burst at ghost head position when replay tick matches eatTick", () => {
    const delay = ghost.delayInTicks; // 5

    // Record frames 0 through delay (inclusive)
    for (let i = 0; i <= delay; i++) {
      ghost.record(seg([10 + i, 5]));
    }
    // After delay+1 records, currentTick = delay+1
    // Ghost frame: tick = currentTick - delay = 1
    // So schedule eatTick = 1
    scheduler.schedule(1);

    const results = scheduler.processTick(ghost);
    expect(results).toHaveLength(1);

    // Ghost head at tick 1 was at (11, 5)
    const expectedPixel = gridToPixel({ col: 11, row: 5 });
    expect(results[0].x).toBe(expectedPixel.x);
    expect(results[0].y).toBe(expectedPixel.y);
  });

  it("removes burst from pending after firing", () => {
    const delay = ghost.delayInTicks;

    for (let i = 0; i <= delay; i++) {
      ghost.record(seg([i, 0]));
    }
    scheduler.schedule(1); // replay tick will be 1 at this point

    scheduler.processTick(ghost);
    expect(scheduler.getPendingCount()).toBe(0);
  });

  it("does not fire burst before the replay tick matches", () => {
    const delay = ghost.delayInTicks; // 5

    // Schedule a burst at tick 3
    scheduler.schedule(3);

    // Record frames 0 through delay-1 → ghost replays tick 0
    for (let i = 0; i < delay; i++) {
      ghost.record(seg([i, 0]));
    }
    // ghostFrame.tick = 0, but eatTick = 3, so no fire
    const results = scheduler.processTick(ghost);
    expect(results).toEqual([]);
    expect(scheduler.getPendingCount()).toBe(1);
  });

  it("fires burst exactly at the right tick — not before, not after", () => {
    const delay = ghost.delayInTicks; // 5

    // Schedule burst at tick 2
    scheduler.schedule(2);

    // Record ticks 0..delay+1 → ghost replays tick 0, 1
    for (let i = 0; i < delay; i++) {
      ghost.record(seg([i, 0]));
    }
    // ghostFrame.tick = 0 → no fire
    expect(scheduler.processTick(ghost)).toEqual([]);

    ghost.record(seg([delay, 0]));
    // ghostFrame.tick = 1 → no fire
    expect(scheduler.processTick(ghost)).toEqual([]);

    ghost.record(seg([delay + 1, 0]));
    // ghostFrame.tick = 2 → fire!
    const results = scheduler.processTick(ghost);
    expect(results).toHaveLength(1);
    expect(scheduler.getPendingCount()).toBe(0);
  });

  it("fires multiple bursts scheduled at the same tick", () => {
    const delay = ghost.delayInTicks;

    // Schedule two bursts at the same eatTick
    scheduler.schedule(0);
    scheduler.schedule(0);

    for (let i = 0; i < delay; i++) {
      ghost.record(seg([i, 0]));
    }
    // ghostFrame.tick = 0 → both should fire
    const results = scheduler.processTick(ghost);
    expect(results).toHaveLength(2);
    expect(scheduler.getPendingCount()).toBe(0);
  });

  it("fires bursts on different ticks in correct order", () => {
    const delay = ghost.delayInTicks; // 5

    scheduler.schedule(0);
    scheduler.schedule(2);

    // Record enough to reach tick 0 replay
    for (let i = 0; i < delay; i++) {
      ghost.record(seg([i, 0]));
    }
    // ghostFrame.tick = 0 → first burst fires
    let results = scheduler.processTick(ghost);
    expect(results).toHaveLength(1);
    expect(scheduler.getPendingCount()).toBe(1);

    // Record one more → ghostFrame.tick = 1
    ghost.record(seg([delay, 0]));
    results = scheduler.processTick(ghost);
    expect(results).toHaveLength(0);

    // Record one more → ghostFrame.tick = 2
    ghost.record(seg([delay + 1, 0]));
    results = scheduler.processTick(ghost);
    expect(results).toHaveLength(1);
    expect(scheduler.getPendingCount()).toBe(0);
  });

  it("discards missed bursts (eatTick < current replayTick)", () => {
    const delay = ghost.delayInTicks; // 5

    // Record well past delay
    for (let i = 0; i < delay + 5; i++) {
      ghost.record(seg([i, 0]));
    }
    // ghostFrame.tick = 5

    // Schedule a burst at tick 2 (already passed)
    scheduler.schedule(2);

    const results = scheduler.processTick(ghost);
    // The missed burst should be discarded
    expect(results).toHaveLength(0);
    expect(scheduler.getPendingCount()).toBe(0);
  });
});

// ── 5-second delay accuracy ──────────────────────────────────────

describe("Ghost food burst fires exactly 5 seconds after food eat", () => {
  it("burst fires at delayInTicks ticks after scheduling (default 125ms interval)", () => {
    const ghost = new EchoGhost(125); // delay = 40 ticks = 5000ms
    const scheduler = new GhostFoodScheduler();
    const delay = ghost.delayInTicks;

    // Simulate: snake eats food at tick 10
    const eatTick = 10;

    // Record ticks 0..eatTick (ghost records before food check)
    for (let i = 0; i <= eatTick; i++) {
      ghost.record(seg([i, 0]));
    }
    // currentTick is now eatTick + 1 = 11
    scheduler.schedule(eatTick);

    // Record more ticks. Ghost replays eatTick when currentTick = eatTick + delay.
    // After recording tick N, currentTick = N + 1.
    // So ghost replays eatTick after recording tick (eatTick + delay - 1).
    // Record ticks before that — none should fire.
    for (let i = eatTick + 1; i < eatTick + delay - 1; i++) {
      ghost.record(seg([i, 0]));
      const results = scheduler.processTick(ghost);
      // Should not fire yet
      expect(results).toHaveLength(0);
    }

    // Record tick eatTick + delay - 1 → currentTick = eatTick + delay
    // ghostFrame.tick = (eatTick + delay) - delay = eatTick → fire!
    ghost.record(seg([eatTick + delay - 1, 0]));
    const results = scheduler.processTick(ghost);
    expect(results).toHaveLength(1);

    // Verify the position matches the ghost head at eatTick
    const expectedPixel = gridToPixel({ col: eatTick, row: 0 });
    expect(results[0].x).toBe(expectedPixel.x);
    expect(results[0].y).toBe(expectedPixel.y);
  });

  it("burst fires at correct position even with a moving snake", () => {
    const ghost = new EchoGhost(1000, 15); // delay = 5
    const scheduler = new GhostFoodScheduler();
    const delay = ghost.delayInTicks; // 5

    // Record ticks 0..2 with distinct positions for each tick
    // tick 0: head at (0, 0), tick 1: head at (3, 2), tick 2: head at (6, 4)
    for (let i = 0; i <= 2; i++) {
      ghost.record(seg([i * 3, i * 2]));
    }
    // currentTick = 3
    scheduler.schedule(2);

    // Ghost replays tick 2 when currentTick = 2 + delay = 7
    // After recording tick N, currentTick = N + 1
    // So we need to record up to tick 6 (currentTick = 7)
    // Record ticks 3..5 (none should fire)
    for (let i = 3; i <= delay; i++) {
      ghost.record(seg([i * 3, i * 2]));
      // currentTick goes from 4 to 6 → ghostFrame.tick goes from -1 to 1
      const results = scheduler.processTick(ghost);
      expect(results).toHaveLength(0);
    }

    // Record tick delay+1=6 → currentTick = 7 → ghostFrame.tick = 2 → fire!
    ghost.record(seg([18, 12]));
    const results = scheduler.processTick(ghost);
    expect(results).toHaveLength(1);

    // Ghost head at tick 2 was at (6, 4)
    const expectedPixel = gridToPixel({ col: 6, row: 4 });
    expect(results[0].x).toBe(expectedPixel.x);
    expect(results[0].y).toBe(expectedPixel.y);
  });
});

// ── No score/state impact ────────────────────────────────────────

describe("Ghost food burst has no gameplay impact", () => {
  it("does not modify the ghost's state", () => {
    const ghost = new EchoGhost(1000, 15);
    const scheduler = new GhostFoodScheduler();
    const delay = ghost.delayInTicks;

    for (let i = 0; i < delay; i++) {
      ghost.record(seg([i, 0]));
    }
    scheduler.schedule(0);

    const tickBefore = ghost.getCurrentTick();
    const countBefore = ghost.getCount();
    const trailBefore = ghost.getGhostTrail();

    scheduler.processTick(ghost);

    expect(ghost.getCurrentTick()).toBe(tickBefore);
    expect(ghost.getCount()).toBe(countBefore);
    expect(ghost.getGhostTrail()).toEqual(trailBefore);
  });

  it("processTick is read-only on the scheduler (only removes fired bursts)", () => {
    const ghost = new EchoGhost(1000, 15);
    const scheduler = new GhostFoodScheduler();
    const delay = ghost.delayInTicks;

    scheduler.schedule(0);
    scheduler.schedule(3);

    for (let i = 0; i < delay; i++) {
      ghost.record(seg([i, 0]));
    }

    // Process tick — fires burst at tick 0 only
    scheduler.processTick(ghost);
    // Only burst at tick 0 was removed; tick 3 remains
    expect(scheduler.getPendingCount()).toBe(1);
  });
});

// ── MainScene integration (source checks) ────────────────────────

describe("MainScene integrates ghost food burst", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/game/scenes/MainScene.ts"),
    "utf-8",
  );

  it("imports GhostFoodScheduler", () => {
    expect(source).toContain("GhostFoodScheduler");
    expect(source).toContain("ghostFoodBurst");
  });

  it("creates GhostFoodScheduler in createEntities", () => {
    expect(source).toContain("new GhostFoodScheduler()");
  });

  it("resets ghostFoodScheduler in destroyEntities", () => {
    expect(source).toContain("ghostFoodScheduler.reset()");
  });

  it("schedules burst when food is eaten", () => {
    expect(source).toContain("ghostFoodScheduler.schedule(");
  });

  it("processes bursts each tick and emits particles", () => {
    expect(source).toContain("ghostFoodScheduler.processTick(");
    // The burst results should be used with emitFoodParticles
    expect(source).toContain("burst.x");
    expect(source).toContain("burst.y");
  });

  it("schedules burst with the correct tick (most recent recorded tick)", () => {
    // The schedule call should use getCurrentTick() - 1 since record() increments
    expect(source).toContain("getCurrentTick() - 1");
  });

  it("exposes getGhostFoodScheduler accessor", () => {
    expect(source).toContain("getGhostFoodScheduler()");
  });
});

// ── Edge cases ───────────────────────────────────────────────────

describe("GhostFoodScheduler edge cases", () => {
  it("handles scheduling at tick 0", () => {
    const ghost = new EchoGhost(1000, 15);
    const scheduler = new GhostFoodScheduler();

    scheduler.schedule(0);

    // Record until ghost replays tick 0
    for (let i = 0; i < ghost.delayInTicks; i++) {
      ghost.record(seg([i, 0]));
    }

    const results = scheduler.processTick(ghost);
    expect(results).toHaveLength(1);
  });

  it("handles reset then re-use", () => {
    const scheduler = new GhostFoodScheduler();

    scheduler.schedule(0);
    scheduler.reset();
    expect(scheduler.getPendingCount()).toBe(0);

    // Schedule new burst
    scheduler.schedule(1);
    expect(scheduler.getPendingCount()).toBe(1);
  });

  it("returns correct pixel coordinates for ghost head", () => {
    const ghost = new EchoGhost(1000, 15);
    const scheduler = new GhostFoodScheduler();
    const delay = ghost.delayInTicks;

    // Record with specific positions
    for (let i = 0; i < delay; i++) {
      ghost.record(seg([15, 20]));
    }
    scheduler.schedule(0);

    const results = scheduler.processTick(ghost);
    expect(results).toHaveLength(1);

    const expected = gridToPixel({ col: 15, row: 20 });
    expect(results[0].x).toBe(expected.x);
    expect(results[0].y).toBe(expected.y);
  });

  it("handles ghost with multi-segment snake (uses head position)", () => {
    const ghost = new EchoGhost(1000, 15);
    const scheduler = new GhostFoodScheduler();
    const delay = ghost.delayInTicks;

    // Record a 3-segment snake
    for (let i = 0; i < delay; i++) {
      ghost.record(seg([10 + i, 5], [9 + i, 5], [8 + i, 5]));
    }
    scheduler.schedule(0);

    const results = scheduler.processTick(ghost);
    expect(results).toHaveLength(1);

    // Should use head (first segment) position: (10, 5)
    const expected = gridToPixel({ col: 10, row: 5 });
    expect(results[0].x).toBe(expected.x);
    expect(results[0].y).toBe(expected.y);
  });
});
