import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  GhostFoodBurstQueue,
  GHOST_FOOD_BURST_DELAY_TICKS,
} from "@/game/systems/GhostFoodBurstQueue";
import { EchoGhost } from "@/game/entities/EchoGhost";
import { DEFAULT_MOVE_INTERVAL_MS } from "@/game/utils/grid";
import {
  DELAY_TICKS,
  makeSegments,
  recordNTicks,
} from "@/__tests__/echo-ghost-harness";

const ROOT = path.resolve(__dirname, "../..");

// ── GhostFoodBurstQueue unit tests ───────────────────────────────

describe("GhostFoodBurstQueue construction", () => {
  it("starts with zero pending bursts", () => {
    const queue = new GhostFoodBurstQueue();
    expect(queue.getPendingCount()).toBe(0);
    expect(queue.getCurrentTick()).toBe(0);
  });

  it("delay matches ECHO_DELAY_MS / DEFAULT_MOVE_INTERVAL_MS", () => {
    expect(GHOST_FOOD_BURST_DELAY_TICKS).toBe(DELAY_TICKS);
    expect(GHOST_FOOD_BURST_DELAY_TICKS).toBe(40);
  });

  it("accepts custom delay ticks", () => {
    const queue = new GhostFoodBurstQueue(10);
    expect(queue.getDelayTicks()).toBe(10);
  });

  it("clamps delay to minimum of 1", () => {
    const queue = new GhostFoodBurstQueue(0);
    expect(queue.getDelayTicks()).toBe(1);
  });
});

describe("GhostFoodBurstQueue enqueue", () => {
  it("increments pending count when a burst is enqueued", () => {
    const queue = new GhostFoodBurstQueue();
    queue.enqueue();
    expect(queue.getPendingCount()).toBe(1);
    queue.enqueue();
    expect(queue.getPendingCount()).toBe(2);
  });
});

describe("GhostFoodBurstQueue processTick with no ghost", () => {
  it("drops burst silently when ghost is null", () => {
    const queue = new GhostFoodBurstQueue(3);
    queue.enqueue();

    // Advance 3 ticks to fire the burst
    queue.processTick(null);
    queue.processTick(null);
    const results = queue.processTick(null);

    expect(results).toEqual([]);
    expect(queue.getPendingCount()).toBe(0);
  });

  it("advances tick counter on each processTick call", () => {
    const queue = new GhostFoodBurstQueue();
    expect(queue.getCurrentTick()).toBe(0);
    queue.processTick(null);
    expect(queue.getCurrentTick()).toBe(1);
    queue.processTick(null);
    expect(queue.getCurrentTick()).toBe(2);
  });
});

describe("GhostFoodBurstQueue processTick with active ghost", () => {
  it("fires burst at ghost head position after delay ticks", () => {
    const delayTicks = 5;
    const queue = new GhostFoodBurstQueue(delayTicks);
    const ghost = new EchoGhost(250, DEFAULT_MOVE_INTERVAL_MS); // 2-tick delay

    // Activate the ghost
    recordNTicks(ghost, 2);
    expect(ghost.active).toBe(true);

    // Enqueue a burst
    queue.enqueue();

    // Process ticks until the burst fires
    for (let i = 0; i < delayTicks - 1; i++) {
      ghost.record(makeSegments(12 + i));
      const results = queue.processTick(ghost);
      expect(results).toEqual([]);
    }

    // On the delay tick, the burst should fire
    ghost.record(makeSegments(12 + delayTicks - 1));
    const results = queue.processTick(ghost);

    expect(results).toHaveLength(1);
    expect(results[0].x).toBeGreaterThan(0);
    expect(results[0].y).toBeGreaterThan(0);
    expect(queue.getPendingCount()).toBe(0);
  });

  it("fires burst at correct pixel position based on ghost head", () => {
    const delayTicks = 3;
    const queue = new GhostFoodBurstQueue(delayTicks);
    const ghost = new EchoGhost(125, DEFAULT_MOVE_INTERVAL_MS); // 1-tick delay

    // Ghost activates after 1 tick, so first recorded position will be played back
    ghost.record(makeSegments(5)); // tick 0 -> activates, plays back seg at col 5
    expect(ghost.active).toBe(true);

    // Enqueue a burst now
    queue.enqueue();

    // Process ticks while keeping ghost alive
    ghost.record(makeSegments(6));
    queue.processTick(ghost); // tick 1
    ghost.record(makeSegments(7));
    queue.processTick(ghost); // tick 2
    ghost.record(makeSegments(8));
    const results = queue.processTick(ghost); // tick 3 — burst fires

    expect(results).toHaveLength(1);
    // Ghost head position at this point depends on playback advancement
    const ghostHead = ghost.getSegments()[0];
    expect(results[0]).toEqual({
      x: (ghostHead.col + 0.5) * 20, // TILE_SIZE = 20
      y: (ghostHead.row + 0.5) * 20,
    });
  });

  it("does not fire burst before delay ticks", () => {
    const delayTicks = 10;
    const queue = new GhostFoodBurstQueue(delayTicks);
    const ghost = new EchoGhost(125, DEFAULT_MOVE_INTERVAL_MS);

    ghost.record(makeSegments(5));
    queue.enqueue();

    for (let i = 0; i < delayTicks - 1; i++) {
      ghost.record(makeSegments(6 + i));
      const results = queue.processTick(ghost);
      expect(results).toEqual([]);
      expect(queue.getPendingCount()).toBe(1);
    }
  });
});

describe("GhostFoodBurstQueue handles unavailable ghost state", () => {
  it("drops burst when ghost is inactive at fire time", () => {
    const delayTicks = 3;
    const queue = new GhostFoodBurstQueue(delayTicks);
    const ghost = new EchoGhost(); // default 40-tick delay — won't activate in 3 ticks

    queue.enqueue();

    for (let i = 0; i < delayTicks; i++) {
      ghost.record(makeSegments(10 + i));
      queue.processTick(ghost);
    }

    // Ghost is still inactive, so burst should be dropped
    expect(ghost.active).toBe(false);
    expect(queue.getPendingCount()).toBe(0); // burst was consumed (dropped)
  });

  it("drops burst when ghost has no segments", () => {
    const delayTicks = 2;
    const queue = new GhostFoodBurstQueue(delayTicks);

    // Create a ghost that can return empty segments
    const ghost = new EchoGhost();
    // Ghost is inactive and has no segments
    queue.enqueue();

    queue.processTick(ghost);
    const results = queue.processTick(ghost);

    expect(results).toEqual([]);
    expect(queue.getPendingCount()).toBe(0);
  });
});

describe("GhostFoodBurstQueue multiple bursts", () => {
  it("handles multiple bursts queued at different times", () => {
    const delayTicks = 3;
    const queue = new GhostFoodBurstQueue(delayTicks);
    const ghost = new EchoGhost(125, DEFAULT_MOVE_INTERVAL_MS);

    // Activate ghost
    ghost.record(makeSegments(5));

    // Queue first burst at tick 0
    queue.enqueue();

    // Advance 1 tick
    ghost.record(makeSegments(6));
    queue.processTick(ghost); // tick 1

    // Queue second burst at tick 1
    queue.enqueue();

    // Advance to tick 3 — first burst fires
    ghost.record(makeSegments(7));
    queue.processTick(ghost); // tick 2
    ghost.record(makeSegments(8));
    const results1 = queue.processTick(ghost); // tick 3

    expect(results1).toHaveLength(1);
    expect(queue.getPendingCount()).toBe(1); // second burst still pending

    // Advance to tick 4 — second burst fires
    ghost.record(makeSegments(9));
    const results2 = queue.processTick(ghost); // tick 4

    expect(results2).toHaveLength(1);
    expect(queue.getPendingCount()).toBe(0);
  });

  it("fires multiple bursts that are due on the same tick", () => {
    const delayTicks = 2;
    const queue = new GhostFoodBurstQueue(delayTicks);
    const ghost = new EchoGhost(125, DEFAULT_MOVE_INTERVAL_MS);

    ghost.record(makeSegments(5));

    // Queue two bursts at the same tick
    queue.enqueue();
    queue.enqueue();

    ghost.record(makeSegments(6));
    queue.processTick(ghost); // tick 1
    ghost.record(makeSegments(7));
    const results = queue.processTick(ghost); // tick 2

    expect(results).toHaveLength(2);
    expect(queue.getPendingCount()).toBe(0);
  });
});

describe("GhostFoodBurstQueue reset", () => {
  it("clears all pending bursts and resets tick counter", () => {
    const queue = new GhostFoodBurstQueue();
    queue.enqueue();
    queue.enqueue();
    queue.processTick(null);
    queue.processTick(null);

    queue.reset();

    expect(queue.getPendingCount()).toBe(0);
    expect(queue.getCurrentTick()).toBe(0);
  });

  it("allows re-enqueuing after reset", () => {
    const queue = new GhostFoodBurstQueue(2);
    queue.enqueue();
    queue.reset();

    const ghost = new EchoGhost(125, DEFAULT_MOVE_INTERVAL_MS);
    ghost.record(makeSegments(5));

    queue.enqueue();
    expect(queue.getPendingCount()).toBe(1);

    ghost.record(makeSegments(6));
    queue.processTick(ghost);
    ghost.record(makeSegments(7));
    const results = queue.processTick(ghost);

    expect(results).toHaveLength(1);
  });
});

// ── MainScene integration (source analysis) ──────────────────────

describe("MainScene ghost-food burst integration", () => {
  const mainSceneSource = fs.readFileSync(
    path.join(ROOT, "src/game/scenes/MainScene.ts"),
    "utf-8",
  );

  it("imports GhostFoodBurstQueue from systems module", () => {
    expect(mainSceneSource).toContain("GhostFoodBurstQueue");
    expect(mainSceneSource).toContain("systems/GhostFoodBurstQueue");
  });

  it("declares a ghostFoodBurstQueue field", () => {
    expect(mainSceneSource).toMatch(/ghostFoodBurstQueue/);
  });

  it("creates GhostFoodBurstQueue in createEntities", () => {
    expect(mainSceneSource).toContain("new GhostFoodBurstQueue()");
  });

  it("enqueues a burst when food is eaten", () => {
    expect(mainSceneSource).toContain("ghostFoodBurstQueue?.enqueue()");
  });

  it("processes ghost food bursts each tick", () => {
    expect(mainSceneSource).toContain("processGhostFoodBursts()");
  });

  it("resets ghostFoodBurstQueue in destroyEntities", () => {
    expect(mainSceneSource).toContain("ghostFoodBurstQueue.reset()");
  });

  it("has a getGhostFoodBurstQueue accessor", () => {
    expect(mainSceneSource).toContain("getGhostFoodBurstQueue()");
  });

  it("processes bursts after ghost recording but before collision check", () => {
    const recordIndex = mainSceneSource.indexOf(
      "echoGhost.record(this.snake.getSegments())",
    );
    const processIndex = mainSceneSource.indexOf("processGhostFoodBursts()");
    const collisionIndex = mainSceneSource.indexOf(
      "this.checkCollisions()",
      recordIndex,
    );

    expect(recordIndex).toBeGreaterThan(-1);
    expect(processIndex).toBeGreaterThan(recordIndex);
    expect(collisionIndex).toBeGreaterThan(processIndex);
  });
});

// ── GhostFoodBurstQueue source file checks ───────────────────────

describe("GhostFoodBurstQueue source file", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/game/systems/GhostFoodBurstQueue.ts"),
    "utf-8",
  );

  it("imports ECHO_DELAY_MS from EchoGhost", () => {
    expect(source).toContain("ECHO_DELAY_MS");
    expect(source).toContain("EchoGhost");
  });

  it("imports gridToPixel from grid utils", () => {
    expect(source).toContain("gridToPixel");
  });

  it("exports GHOST_FOOD_BURST_DELAY_TICKS constant", () => {
    expect(source).toMatch(/export\s+const\s+GHOST_FOOD_BURST_DELAY_TICKS/);
  });

  it("exports GhostFoodBurstQueue class", () => {
    expect(source).toMatch(/export\s+class\s+GhostFoodBurstQueue/);
  });

  it("handles ghost being null (unavailable check)", () => {
    expect(source).toContain("!ghost");
  });

  it("handles ghost being inactive (unavailable check)", () => {
    expect(source).toContain("!state.active");
  });

  it("handles ghost having no segments (unavailable check)", () => {
    expect(source).toContain("segments.length === 0");
  });
});

// ── 5-second delay timing accuracy ──────────────────────────────

describe("Ghost-food burst 5-second delay accuracy", () => {
  it("burst fires exactly DELAY_TICKS ticks after enqueue (using default EchoGhost)", () => {
    const queue = new GhostFoodBurstQueue();
    const ghost = new EchoGhost();

    // Record enough to activate the ghost
    recordNTicks(ghost, DELAY_TICKS);
    expect(ghost.active).toBe(true);

    // Enqueue a burst
    queue.enqueue();

    // Process ticks — burst should not fire before DELAY_TICKS
    for (let i = 0; i < DELAY_TICKS - 1; i++) {
      ghost.record(makeSegments(10 + DELAY_TICKS + i));
      const results = queue.processTick(ghost);
      expect(results).toEqual([]);
    }

    // On tick DELAY_TICKS, burst should fire
    ghost.record(makeSegments(10 + DELAY_TICKS + DELAY_TICKS - 1));
    const results = queue.processTick(ghost);
    expect(results).toHaveLength(1);
  });

  it("GHOST_FOOD_BURST_DELAY_TICKS equals 40 at default settings (5000ms / 125ms)", () => {
    expect(GHOST_FOOD_BURST_DELAY_TICKS).toBe(40);
  });
});
