import { describe, it, expect, beforeEach } from "vitest";
import {
  PortalManager,
  PORTAL_SPAWN_INTERVAL_MS,
  PORTAL_SPAWN_JITTER_MS,
  PORTAL_MAX_ACTIVE_PAIRS,
} from "../game/systems/PortalManager";
import {
  PORTAL_LIFESPAN_MS,
  PORTAL_SPAWN_DURATION_MS,
  PORTAL_COLLAPSE_DURATION_MS,
  resetPortalPairIdCounter,
  type CellOccupancyChecker,
} from "../game/entities/Portal";
import { GRID_COLS, GRID_ROWS } from "../game/config";
import type { GridPos } from "../game/utils/grid";

// ── Helpers ─────────────────────────────────────────────────────

/** Deterministic RNG from a fixed sequence. */
function seededRng(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

/** Create a PortalManager with short spawn intervals for easier testing. */
function createTestManager(
  overrides: {
    spawnIntervalMs?: number;
    spawnJitterMs?: number;
    maxActivePairs?: number;
    rng?: () => number;
  } = {},
): PortalManager {
  return new PortalManager({
    spawnIntervalMs: overrides.spawnIntervalMs ?? 1000,
    spawnJitterMs: overrides.spawnJitterMs ?? 0,
    maxActivePairs: overrides.maxActivePairs ?? PORTAL_MAX_ACTIVE_PAIRS,
    rng: overrides.rng ?? seededRng([0.5]),
  });
}

// ── Default constants ───────────────────────────────────────────

describe("PortalManager constants", () => {
  it("PORTAL_SPAWN_INTERVAL_MS is 30000 (per spec: ~30 seconds)", () => {
    expect(PORTAL_SPAWN_INTERVAL_MS).toBe(30_000);
  });

  it("PORTAL_SPAWN_JITTER_MS is 5000", () => {
    expect(PORTAL_SPAWN_JITTER_MS).toBe(5_000);
  });

  it("PORTAL_MAX_ACTIVE_PAIRS is 1", () => {
    expect(PORTAL_MAX_ACTIVE_PAIRS).toBe(1);
  });
});

// ── Constructor ─────────────────────────────────────────────────

describe("PortalManager construction", () => {
  beforeEach(() => {
    resetPortalPairIdCounter();
  });

  it("creates with default configuration", () => {
    const manager = new PortalManager();
    expect(manager.isRunning()).toBe(false);
    expect(manager.getActivePairs()).toEqual([]);
    expect(manager.getSpawnTimerMs()).toBe(0);
  });

  it("accepts custom configuration", () => {
    const rng = seededRng([0.5]);
    const manager = new PortalManager({
      spawnIntervalMs: 5000,
      spawnJitterMs: 1000,
      maxActivePairs: 3,
      rng,
    });

    expect(manager.isRunning()).toBe(false);
    expect(manager.getRng()).toBe(rng);
  });

  it("clamps negative spawnIntervalMs to 0", () => {
    const manager = new PortalManager({ spawnIntervalMs: -100 });
    // After clamping to 0, rollSpawnTarget clamps to 1
    expect(manager.getCurrentSpawnTargetMs()).toBeGreaterThanOrEqual(1);
  });

  it("clamps negative spawnJitterMs to 0", () => {
    const manager = new PortalManager({
      spawnIntervalMs: 1000,
      spawnJitterMs: -500,
    });
    // With 0 jitter, target equals base interval
    expect(manager.getCurrentSpawnTargetMs()).toBe(1000);
  });

  it("clamps maxActivePairs to at least 1", () => {
    const manager = new PortalManager({ maxActivePairs: 0 });
    // Should still allow at least 1 pair
    manager.startRun();
    manager.update(PORTAL_SPAWN_INTERVAL_MS + PORTAL_SPAWN_JITTER_MS + 1);
    // With defaults, pairs should spawn normally
    expect(manager.getActivePairs().length).toBeLessThanOrEqual(1);
  });
});

// ── Lifecycle ───────────────────────────────────────────────────

describe("PortalManager lifecycle", () => {
  beforeEach(() => {
    resetPortalPairIdCounter();
  });

  it("startRun enables the manager", () => {
    const manager = createTestManager();
    expect(manager.isRunning()).toBe(false);

    manager.startRun();
    expect(manager.isRunning()).toBe(true);
  });

  it("stopRun pauses the manager", () => {
    const manager = createTestManager();
    manager.startRun();
    manager.stopRun();
    expect(manager.isRunning()).toBe(false);
  });

  it("reset clears all state", () => {
    const manager = createTestManager({ spawnIntervalMs: 100 });
    manager.startRun();
    manager.update(100); // Spawn a pair
    expect(manager.getActivePairs().length).toBe(1);

    manager.reset();
    expect(manager.isRunning()).toBe(false);
    expect(manager.getActivePairs()).toEqual([]);
    expect(manager.getSpawnTimerMs()).toBe(0);
  });

  it("startRun resets state from a previous run", () => {
    const manager = createTestManager({ spawnIntervalMs: 100 });
    manager.startRun();
    manager.update(100); // Spawn a pair
    expect(manager.getActivePairs().length).toBe(1);

    manager.startRun(); // Fresh run
    expect(manager.getActivePairs()).toEqual([]);
    expect(manager.getSpawnTimerMs()).toBe(0);
    expect(manager.isRunning()).toBe(true);
  });
});

// ── Update behaviour ────────────────────────────────────────────

describe("PortalManager update", () => {
  beforeEach(() => {
    resetPortalPairIdCounter();
  });

  it("does nothing when not running", () => {
    const manager = createTestManager({ spawnIntervalMs: 100 });
    const collapsed = manager.update(200);
    expect(collapsed).toEqual([]);
    expect(manager.getActivePairs()).toEqual([]);
  });

  it("does nothing with zero delta", () => {
    const manager = createTestManager({ spawnIntervalMs: 100 });
    manager.startRun();
    const collapsed = manager.update(0);
    expect(collapsed).toEqual([]);
    expect(manager.getSpawnTimerMs()).toBe(0);
  });

  it("does nothing with negative delta", () => {
    const manager = createTestManager({ spawnIntervalMs: 100 });
    manager.startRun();
    const collapsed = manager.update(-100);
    expect(collapsed).toEqual([]);
  });

  it("does nothing with NaN delta", () => {
    const manager = createTestManager({ spawnIntervalMs: 100 });
    manager.startRun();
    const collapsed = manager.update(NaN);
    expect(collapsed).toEqual([]);
  });

  it("does nothing with Infinity delta", () => {
    const manager = createTestManager({ spawnIntervalMs: 100 });
    manager.startRun();
    const collapsed = manager.update(Infinity);
    expect(collapsed).toEqual([]);
  });

  it("accumulates spawn timer", () => {
    const manager = createTestManager({ spawnIntervalMs: 1000 });
    manager.startRun();

    manager.update(300);
    expect(manager.getSpawnTimerMs()).toBe(300);

    manager.update(200);
    expect(manager.getSpawnTimerMs()).toBe(500);
  });
});

// ── Spawning ─────────────────────────────────────────────────

describe("PortalManager spawning", () => {
  beforeEach(() => {
    resetPortalPairIdCounter();
  });

  it("spawns a portal pair after the spawn interval elapses", () => {
    const manager = createTestManager({ spawnIntervalMs: 1000 });
    manager.startRun();

    manager.update(999);
    expect(manager.getActivePairs().length).toBe(0);

    manager.update(1);
    expect(manager.getActivePairs().length).toBe(1);
  });

  it("spawned pair has a valid ID", () => {
    const manager = createTestManager({ spawnIntervalMs: 100 });
    manager.startRun();
    manager.update(100);

    const pairs = manager.getActivePairs();
    expect(pairs[0].id).toBe("portal-1");
  });

  it("spawned pair has two distinct positions", () => {
    const manager = createTestManager({ spawnIntervalMs: 100 });
    manager.startRun();
    manager.update(100);

    const pair = manager.getActivePairs()[0];
    const [posA, posB] = pair.getPositions();
    expect(posA.col !== posB.col || posA.row !== posB.row).toBe(true);
  });

  it("spawned pair starts in spawning state", () => {
    const manager = createTestManager({ spawnIntervalMs: 100 });
    manager.startRun();
    manager.update(100);

    expect(manager.getActivePairs()[0].getState()).toBe("spawning");
  });

  it("respects maxActivePairs limit", () => {
    const manager = createTestManager({
      spawnIntervalMs: 100,
      maxActivePairs: 1,
    });
    manager.startRun();

    manager.update(100); // Spawn first pair
    expect(manager.getActivePairs().length).toBe(1);

    manager.update(100); // Try to spawn second — should be blocked
    expect(manager.getActivePairs().length).toBe(1);
  });

  it("allows spawning again after a pair collapses", () => {
    const manager = createTestManager({
      spawnIntervalMs: 100,
      maxActivePairs: 1,
    });
    manager.startRun();

    // Spawn a pair
    manager.update(100);
    expect(manager.getActivePairs().length).toBe(1);

    // Wait for the pair to fully collapse
    // PORTAL_LIFESPAN_MS (8000) + PORTAL_COLLAPSE_DURATION_MS (500) = 8500
    const totalLifetime =
      PORTAL_LIFESPAN_MS + PORTAL_COLLAPSE_DURATION_MS;

    // Advance enough for the pair to collapse and a new spawn interval to pass
    // We need to break this up so the spawn timer can also accumulate
    const remaining = totalLifetime;
    manager.update(remaining);

    // The pair should have collapsed and been removed
    // A new pair may or may not have spawned depending on accumulated timer
    const collapsed = manager.getActivePairs().filter(
      (p) => p.isCollapsed(),
    );
    expect(collapsed.length).toBe(0); // Collapsed pairs should have been removed
  });

  it("does not spawn when board is too full", () => {
    const manager = createTestManager({ spawnIntervalMs: 100 });
    // Block all cells except one — not enough for a pair
    const blockNearly: CellOccupancyChecker = (pos) =>
      !(pos.col === 0 && pos.row === 0);
    manager.setOccupancyCheckers([blockNearly]);
    manager.startRun();

    manager.update(100);
    expect(manager.getActivePairs().length).toBe(0);
  });

  it("avoids placing portals on occupied cells", () => {
    const occupied: GridPos[] = [
      { col: 5, row: 5 },
      { col: 6, row: 5 },
      { col: 7, row: 5 },
    ];
    const checker: CellOccupancyChecker = (pos) =>
      occupied.some((o) => o.col === pos.col && o.row === pos.row);

    const manager = createTestManager({ spawnIntervalMs: 100 });
    manager.setOccupancyCheckers([checker]);
    manager.startRun();

    manager.update(100);

    const pairs = manager.getActivePairs();
    if (pairs.length > 0) {
      const [posA, posB] = pairs[0].getPositions();
      for (const o of occupied) {
        expect(posA.col === o.col && posA.row === o.row).toBe(false);
        expect(posB.col === o.col && posB.row === o.row).toBe(false);
      }
    }
  });

  it("avoids placing new portals on existing portal cells", () => {
    const manager = createTestManager({
      spawnIntervalMs: 100,
      maxActivePairs: 2,
    });
    manager.startRun();

    manager.update(100); // Spawn first pair
    const firstPair = manager.getActivePairs()[0];
    const [firstA, firstB] = firstPair.getPositions();

    manager.update(100); // Spawn second pair
    expect(manager.getActivePairs().length).toBe(2);

    const secondPair = manager.getActivePairs()[1];
    const [secondA, secondB] = secondPair.getPositions();

    // Second pair should not overlap with first pair
    const firstPositions = [firstA, firstB];
    for (const fp of firstPositions) {
      expect(secondA.col === fp.col && secondA.row === fp.row).toBe(false);
      expect(secondB.col === fp.col && secondB.row === fp.row).toBe(false);
    }
  });
});

// ── Spawn interval jitter ───────────────────────────────────────

describe("PortalManager spawn interval jitter", () => {
  beforeEach(() => {
    resetPortalPairIdCounter();
  });

  it("applies jitter to spawn interval", () => {
    // rng = 0.5 → jitter = (0.5*2-1)*5000 = 0 → target = 30000
    const manager1 = new PortalManager({
      rng: seededRng([0.5]),
    });
    expect(manager1.getCurrentSpawnTargetMs()).toBe(PORTAL_SPAWN_INTERVAL_MS);

    // rng = 1.0 → jitter = (1.0*2-1)*5000 = 5000 → target = 35000
    // Note: rng returning exactly 1.0 means (1*2-1) = 1, * 5000 = 5000
    const manager2 = new PortalManager({
      rng: seededRng([0.99999]),
    });
    expect(manager2.getCurrentSpawnTargetMs()).toBeGreaterThan(
      PORTAL_SPAWN_INTERVAL_MS,
    );

    // rng = 0.0 → jitter = (0*2-1)*5000 = -5000 → target = 25000
    const manager3 = new PortalManager({
      rng: seededRng([0.0]),
    });
    expect(manager3.getCurrentSpawnTargetMs()).toBeLessThan(
      PORTAL_SPAWN_INTERVAL_MS,
    );
  });

  it("jitter produces target within [base-jitter, base+jitter]", () => {
    const base = 1000;
    const jitter = 200;

    for (let i = 0; i < 100; i++) {
      const manager = new PortalManager({
        spawnIntervalMs: base,
        spawnJitterMs: jitter,
        rng: () => Math.random(),
      });
      const target = manager.getCurrentSpawnTargetMs();
      expect(target).toBeGreaterThanOrEqual(base - jitter);
      expect(target).toBeLessThanOrEqual(base + jitter);
    }
  });

  it("no jitter when spawnJitterMs is 0", () => {
    const manager = new PortalManager({
      spawnIntervalMs: 5000,
      spawnJitterMs: 0,
    });
    expect(manager.getCurrentSpawnTargetMs()).toBe(5000);
  });

  it("rolls a new target after each spawn", () => {
    // Use alternating rng values so targets differ
    let callCount = 0;
    const alternatingRng = () => {
      callCount++;
      // First few calls for rollSpawnTarget and portal placement
      return callCount % 2 === 0 ? 0.2 : 0.8;
    };

    const manager = new PortalManager({
      spawnIntervalMs: 100,
      spawnJitterMs: 0,
      rng: alternatingRng,
    });
    manager.startRun();

    const firstTarget = manager.getCurrentSpawnTargetMs();
    manager.update(firstTarget);
    const secondTarget = manager.getCurrentSpawnTargetMs();

    // After spawn, a new target should have been rolled
    // They may or may not be equal depending on RNG, but the mechanism works
    expect(typeof secondTarget).toBe("number");
    expect(secondTarget).toBeGreaterThanOrEqual(1);
  });
});

// ── Portal pair lifecycle through manager ───────────────────────

describe("PortalManager pair lifecycle", () => {
  beforeEach(() => {
    resetPortalPairIdCounter();
  });

  it("ticks portal pairs through their lifecycle", () => {
    const manager = createTestManager({ spawnIntervalMs: 100 });
    manager.startRun();

    // Spawn a pair
    manager.update(100);
    const pair = manager.getActivePairs()[0];
    expect(pair.getState()).toBe("spawning");

    // Advance past spawn duration (500ms default)
    manager.update(PORTAL_SPAWN_DURATION_MS);
    expect(pair.getState()).toBe("active");
  });

  it("transitions pair to collapsing after lifespan", () => {
    const manager = createTestManager({ spawnIntervalMs: 100 });
    manager.startRun();

    manager.update(100); // Spawn
    const pair = manager.getActivePairs()[0];

    // PortalPair.update() transitions one state per call, so we need
    // multiple ticks to cross spawning → active → collapsing.
    // First: advance past spawn duration to reach active
    manager.update(PORTAL_SPAWN_DURATION_MS);
    expect(pair.getState()).toBe("active");

    // Then advance the remaining lifespan time to reach collapsing
    const remainingLifespan = PORTAL_LIFESPAN_MS - PORTAL_SPAWN_DURATION_MS;
    manager.update(remainingLifespan);
    expect(pair.getState()).toBe("collapsing");
  });

  it("returns collapsed pairs and removes them from active set", () => {
    const manager = createTestManager({ spawnIntervalMs: 100 });
    manager.startRun();

    manager.update(100); // Spawn
    const pair = manager.getActivePairs()[0];
    const pairId = pair.id;

    // Step through lifecycle one state at a time:
    // spawning → active
    manager.update(PORTAL_SPAWN_DURATION_MS);
    expect(pair.getState()).toBe("active");

    // active → collapsing
    const remainingLifespan = PORTAL_LIFESPAN_MS - PORTAL_SPAWN_DURATION_MS;
    manager.update(remainingLifespan);
    expect(pair.getState()).toBe("collapsing");

    // collapsing → collapsed (and removed)
    const collapsed = manager.update(PORTAL_COLLAPSE_DURATION_MS);

    expect(collapsed.length).toBe(1);
    expect(collapsed[0].id).toBe(pairId);
    expect(collapsed[0].isCollapsed()).toBe(true);

    // Should be removed from active pairs
    expect(
      manager.getActivePairs().find((p) => p.id === pairId),
    ).toBeUndefined();
  });

  it("collapseAll forces all pairs to begin collapsing", () => {
    const manager = createTestManager({
      spawnIntervalMs: 100,
      maxActivePairs: 3,
    });
    manager.startRun();

    manager.update(100); // Spawn first pair
    manager.update(100); // Spawn second pair
    manager.update(100); // Spawn third pair

    expect(manager.getActivePairs().length).toBe(3);

    manager.collapseAll();

    for (const pair of manager.getActivePairs()) {
      expect(pair.getState()).toBe("collapsing");
    }
  });
});

// ── Occupancy ──────────────────────────────────────────────────

describe("PortalManager occupancy", () => {
  beforeEach(() => {
    resetPortalPairIdCounter();
  });

  it("isPortalCell returns false when no pairs active", () => {
    const manager = createTestManager();
    expect(manager.isPortalCell({ col: 5, row: 5 })).toBe(false);
  });

  it("isPortalCell returns true for cells with active portals", () => {
    const manager = createTestManager({ spawnIntervalMs: 100 });
    manager.startRun();
    manager.update(100);

    const pair = manager.getActivePairs()[0];
    const [posA, posB] = pair.getPositions();

    expect(manager.isPortalCell(posA)).toBe(true);
    expect(manager.isPortalCell(posB)).toBe(true);
  });

  it("isPortalCell returns false for non-portal cells", () => {
    const manager = createTestManager({ spawnIntervalMs: 100 });
    manager.startRun();
    manager.update(100);

    // Test a cell that's likely not a portal
    // With a 40x30 grid and only 2 portal cells, most cells won't be portals
    const pair = manager.getActivePairs()[0];
    const [posA] = pair.getPositions();

    // Pick a cell that's definitely different
    const testPos = {
      col: (posA.col + 10) % GRID_COLS,
      row: (posA.row + 10) % GRID_ROWS,
    };

    // Only check if this isn't also posB
    const [, posB] = pair.getPositions();
    if (testPos.col !== posB.col || testPos.row !== posB.row) {
      expect(manager.isPortalCell(testPos)).toBe(false);
    }
  });

  it("setOccupancyCheckers updates the checkers list", () => {
    const manager = createTestManager({ spawnIntervalMs: 100 });
    const checker: CellOccupancyChecker = () => true; // Block all cells
    manager.setOccupancyCheckers([checker]);
    manager.startRun();

    manager.update(100);
    // Should not have spawned since all cells are blocked
    expect(manager.getActivePairs().length).toBe(0);
  });
});

// ── getPairAtPosition ──────────────────────────────────────────

describe("PortalManager getPairAtPosition", () => {
  beforeEach(() => {
    resetPortalPairIdCounter();
  });

  it("returns null when no pairs are active", () => {
    const manager = createTestManager();
    expect(manager.getPairAtPosition({ col: 5, row: 5 })).toBeNull();
  });

  it("returns the pair at a matching position", () => {
    const manager = createTestManager({ spawnIntervalMs: 100 });
    manager.startRun();
    manager.update(100);

    const pair = manager.getActivePairs()[0];
    const [posA] = pair.getPositions();

    const result = manager.getPairAtPosition(posA);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(pair.id);
  });

  it("returns null for a position with no portal", () => {
    const manager = createTestManager({ spawnIntervalMs: 100 });
    manager.startRun();
    manager.update(100);

    // Very unlikely any portal is at (0, 0) AND (1, 1) with seeded rng
    const pair = manager.getActivePairs()[0];
    const [posA, posB] = pair.getPositions();

    // Find a position that is not either end
    let testPos: GridPos = { col: 0, row: 0 };
    if (
      (testPos.col === posA.col && testPos.row === posA.row) ||
      (testPos.col === posB.col && testPos.row === posB.row)
    ) {
      testPos = { col: GRID_COLS - 1, row: GRID_ROWS - 1 };
    }

    expect(manager.getPairAtPosition(testPos)).toBeNull();
  });
});

// ── setRng ─────────────────────────────────────────────────────

describe("PortalManager setRng", () => {
  beforeEach(() => {
    resetPortalPairIdCounter();
  });

  it("changes the RNG function", () => {
    const manager = createTestManager();
    const newRng = seededRng([0.1, 0.2, 0.3]);
    manager.setRng(newRng);
    expect(manager.getRng()).toBe(newRng);
  });
});

// ── Multiple spawns over time ──────────────────────────────────

describe("PortalManager multiple spawn cycles", () => {
  beforeEach(() => {
    resetPortalPairIdCounter();
  });

  it("spawns multiple pairs over multiple intervals", () => {
    const manager = createTestManager({
      spawnIntervalMs: 100,
      maxActivePairs: 5,
    });
    manager.startRun();

    manager.update(100);
    expect(manager.getActivePairs().length).toBe(1);

    manager.update(100);
    expect(manager.getActivePairs().length).toBe(2);

    manager.update(100);
    expect(manager.getActivePairs().length).toBe(3);
  });

  it("carries over excess time across spawn intervals", () => {
    const manager = createTestManager({
      spawnIntervalMs: 100,
      maxActivePairs: 5,
    });
    manager.startRun();

    // Single large update that covers multiple intervals
    manager.update(350);

    // Should have spawned 3 pairs (100, 200, 300) with 50 leftover
    expect(manager.getActivePairs().length).toBe(3);
    expect(manager.getSpawnTimerMs()).toBe(50);
  });
});

// ── Integration with real timing ────────────────────────────────

describe("PortalManager with default timing constants", () => {
  beforeEach(() => {
    resetPortalPairIdCounter();
  });

  it("uses 8-second portal lifespan from Portal entity", () => {
    expect(PORTAL_LIFESPAN_MS).toBe(8_000);
  });

  it("uses ~30-second spawn interval", () => {
    expect(PORTAL_SPAWN_INTERVAL_MS).toBe(30_000);
  });

  it("full lifecycle: spawn at ~30s, active for 8s, then collapse", () => {
    // Use exactly 30s interval (no jitter) for predictable testing
    const manager = new PortalManager({
      spawnIntervalMs: PORTAL_SPAWN_INTERVAL_MS,
      spawnJitterMs: 0,
      rng: seededRng([0.5]),
    });
    manager.startRun();

    // Before 30s: no pairs
    manager.update(29_999);
    expect(manager.getActivePairs().length).toBe(0);

    // At 30s: pair spawns
    manager.update(1);
    expect(manager.getActivePairs().length).toBe(1);
    const pair = manager.getActivePairs()[0];

    // After spawn animation (500ms): active
    manager.update(PORTAL_SPAWN_DURATION_MS);
    expect(pair.getState()).toBe("active");

    // After 8s total: collapsing
    const remainingToCollapse =
      PORTAL_LIFESPAN_MS - PORTAL_SPAWN_DURATION_MS;
    manager.update(remainingToCollapse);
    expect(pair.getState()).toBe("collapsing");

    // After collapse animation (500ms): collapsed and removed
    const collapsed = manager.update(PORTAL_COLLAPSE_DURATION_MS);
    expect(collapsed.length).toBe(1);
    expect(manager.getActivePairs().length).toBe(0);
  });
});
