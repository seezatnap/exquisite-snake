import { describe, it, expect } from "vitest";
import {
  // ── Ice Cavern constants ──────────────────────────────────────
  ICE_SLIDE_TILES,
  ICE_SLIDE_TILES_MIN,
  ICE_SLIDE_TILES_MAX,
  // ── Molten Core constants ─────────────────────────────────────
  LAVA_BURN_SEGMENTS,
  LAVA_SURVIVAL_THRESHOLD,
  LAVA_MAX_POOLS,
  LAVA_SPAWN_INTERVAL_MS,
  LAVA_MAX_POOLS_MIN,
  LAVA_MAX_POOLS_MAX,
  LAVA_SPAWN_INTERVAL_MIN_MS,
  LAVA_SPAWN_INTERVAL_MAX_MS,
  // ── Void Rift constants ───────────────────────────────────────
  GRAVITY_PULL_CADENCE,
  GRAVITY_CENTER,
  GRAVITY_PULL_CADENCE_MIN,
  GRAVITY_PULL_CADENCE_MAX,
  // ── Deterministic RNG ─────────────────────────────────────────
  createSeededRng,
  // ── Edge-case utilities ───────────────────────────────────────
  clampInt,
  clampToGrid,
  safeNudge,
  isSafeSpawnCell,
  collectFreeCells,
  pickRandomCell,
  // ── Config builders ───────────────────────────────────────────
  getDefaultBiomeMechanicConfigs,
  createBiomeMechanicConfigs,
} from "@/game/systems/BiomeMechanics";
import { GRID_COLS, GRID_ROWS } from "@/game/config";
import type { GridPos } from "@/game/utils/grid";

// ════════════════════════════════════════════════════════════════
// Balancing Constants
// ════════════════════════════════════════════════════════════════

describe("BiomeMechanics – Balancing Constants", () => {
  describe("Ice Cavern constants", () => {
    it("slide tiles default is 2", () => {
      expect(ICE_SLIDE_TILES).toBe(2);
    });

    it("slide tiles min is 1", () => {
      expect(ICE_SLIDE_TILES_MIN).toBe(1);
    });

    it("slide tiles max is 5", () => {
      expect(ICE_SLIDE_TILES_MAX).toBe(5);
    });

    it("min <= default <= max", () => {
      expect(ICE_SLIDE_TILES).toBeGreaterThanOrEqual(ICE_SLIDE_TILES_MIN);
      expect(ICE_SLIDE_TILES).toBeLessThanOrEqual(ICE_SLIDE_TILES_MAX);
    });
  });

  describe("Molten Core constants", () => {
    it("burn segments default is 3", () => {
      expect(LAVA_BURN_SEGMENTS).toBe(3);
    });

    it("survival threshold is burn + 1", () => {
      expect(LAVA_SURVIVAL_THRESHOLD).toBe(LAVA_BURN_SEGMENTS + 1);
    });

    it("max pools default is 8", () => {
      expect(LAVA_MAX_POOLS).toBe(8);
    });

    it("spawn interval default is 3000ms", () => {
      expect(LAVA_SPAWN_INTERVAL_MS).toBe(3_000);
    });

    it("pool cap range is valid", () => {
      expect(LAVA_MAX_POOLS_MIN).toBeLessThanOrEqual(LAVA_MAX_POOLS);
      expect(LAVA_MAX_POOLS).toBeLessThanOrEqual(LAVA_MAX_POOLS_MAX);
    });

    it("spawn interval range is valid", () => {
      expect(LAVA_SPAWN_INTERVAL_MIN_MS).toBeLessThanOrEqual(
        LAVA_SPAWN_INTERVAL_MS,
      );
      expect(LAVA_SPAWN_INTERVAL_MS).toBeLessThanOrEqual(
        LAVA_SPAWN_INTERVAL_MAX_MS,
      );
    });
  });

  describe("Void Rift constants", () => {
    it("pull cadence default is 4", () => {
      expect(GRAVITY_PULL_CADENCE).toBe(4);
    });

    it("gravity center is arena midpoint", () => {
      expect(GRAVITY_CENTER.col).toBe(Math.floor(GRID_COLS / 2));
      expect(GRAVITY_CENTER.row).toBe(Math.floor(GRID_ROWS / 2));
    });

    it("cadence range is valid", () => {
      expect(GRAVITY_PULL_CADENCE_MIN).toBeLessThanOrEqual(
        GRAVITY_PULL_CADENCE,
      );
      expect(GRAVITY_PULL_CADENCE).toBeLessThanOrEqual(
        GRAVITY_PULL_CADENCE_MAX,
      );
    });

    it("gravity center is frozen (immutable)", () => {
      expect(Object.isFrozen(GRAVITY_CENTER)).toBe(true);
    });
  });
});

// ════════════════════════════════════════════════════════════════
// Deterministic Seeded RNG
// ════════════════════════════════════════════════════════════════

describe("BiomeMechanics – createSeededRng", () => {
  it("returns a function", () => {
    const rng = createSeededRng(42);
    expect(typeof rng).toBe("function");
  });

  it("returns values in [0, 1)", () => {
    const rng = createSeededRng(123);
    for (let i = 0; i < 1000; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it("is deterministic — same seed produces same sequence", () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);

    const seq1 = Array.from({ length: 100 }, () => rng1());
    const seq2 = Array.from({ length: 100 }, () => rng2());

    expect(seq1).toEqual(seq2);
  });

  it("different seeds produce different sequences", () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(99);

    const seq1 = Array.from({ length: 20 }, () => rng1());
    const seq2 = Array.from({ length: 20 }, () => rng2());

    expect(seq1).not.toEqual(seq2);
  });

  it("produces well-distributed values (no obvious bias)", () => {
    const rng = createSeededRng(7);
    const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // 10 buckets
    const samples = 10000;

    for (let i = 0; i < samples; i++) {
      const bucket = Math.floor(rng() * 10);
      buckets[bucket]++;
    }

    // Each bucket should have roughly 1000 samples (±300 tolerance)
    for (const count of buckets) {
      expect(count).toBeGreaterThan(700);
      expect(count).toBeLessThan(1300);
    }
  });

  it("handles seed of 0", () => {
    const rng = createSeededRng(0);
    const val = rng();
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThan(1);
  });

  it("handles negative seeds", () => {
    const rng = createSeededRng(-42);
    const val = rng();
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThan(1);
  });

  it("handles very large seeds", () => {
    const rng = createSeededRng(2147483647);
    const val = rng();
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThan(1);
  });

  it("consecutive calls produce different values", () => {
    const rng = createSeededRng(42);
    const first = rng();
    const second = rng();
    const third = rng();

    // They should not all be the same
    expect(new Set([first, second, third]).size).toBeGreaterThan(1);
  });
});

// ════════════════════════════════════════════════════════════════
// Edge-Case Utilities
// ════════════════════════════════════════════════════════════════

describe("BiomeMechanics – clampInt", () => {
  it("returns value when within range", () => {
    expect(clampInt(5, 1, 10)).toBe(5);
  });

  it("clamps to min when value is too low", () => {
    expect(clampInt(-3, 1, 10)).toBe(1);
  });

  it("clamps to max when value is too high", () => {
    expect(clampInt(15, 1, 10)).toBe(10);
  });

  it("rounds fractional values", () => {
    expect(clampInt(3.7, 1, 10)).toBe(4);
    expect(clampInt(3.2, 1, 10)).toBe(3);
  });

  it("handles min === max", () => {
    expect(clampInt(5, 3, 3)).toBe(3);
  });

  it("handles exact boundary values", () => {
    expect(clampInt(1, 1, 10)).toBe(1);
    expect(clampInt(10, 1, 10)).toBe(10);
  });
});

describe("BiomeMechanics – clampToGrid", () => {
  it("returns position unchanged when in-bounds", () => {
    const pos = { col: 10, row: 15 };
    expect(clampToGrid(pos)).toEqual(pos);
  });

  it("clamps negative col to 0", () => {
    expect(clampToGrid({ col: -1, row: 10 })).toEqual({ col: 0, row: 10 });
  });

  it("clamps negative row to 0", () => {
    expect(clampToGrid({ col: 10, row: -5 })).toEqual({ col: 10, row: 0 });
  });

  it("clamps col to GRID_COLS - 1", () => {
    expect(clampToGrid({ col: GRID_COLS + 5, row: 10 })).toEqual({
      col: GRID_COLS - 1,
      row: 10,
    });
  });

  it("clamps row to GRID_ROWS - 1", () => {
    expect(clampToGrid({ col: 10, row: GRID_ROWS + 5 })).toEqual({
      col: 10,
      row: GRID_ROWS - 1,
    });
  });

  it("clamps both axes simultaneously", () => {
    expect(clampToGrid({ col: -1, row: GRID_ROWS + 1 })).toEqual({
      col: 0,
      row: GRID_ROWS - 1,
    });
  });

  it("does not mutate the input", () => {
    const pos = { col: -1, row: -1 };
    clampToGrid(pos);
    expect(pos).toEqual({ col: -1, row: -1 });
  });

  it("handles corner positions", () => {
    expect(clampToGrid({ col: 0, row: 0 })).toEqual({ col: 0, row: 0 });
    expect(clampToGrid({ col: GRID_COLS - 1, row: GRID_ROWS - 1 })).toEqual({
      col: GRID_COLS - 1,
      row: GRID_ROWS - 1,
    });
  });
});

describe("BiomeMechanics – safeNudge", () => {
  it("passes through nudge when result is in-bounds", () => {
    const head = { col: 10, row: 10 };
    const nudge = { col: 1, row: 0 };
    expect(safeNudge(head, nudge)).toEqual({ col: 1, row: 0 });
  });

  it("zeroes col component when nudge would go below col 0", () => {
    const head = { col: 0, row: 10 };
    const nudge = { col: -1, row: 0 };
    expect(safeNudge(head, nudge)).toEqual({ col: 0, row: 0 });
  });

  it("zeroes col component when nudge would exceed GRID_COLS", () => {
    const head = { col: GRID_COLS - 1, row: 10 };
    const nudge = { col: 1, row: 0 };
    expect(safeNudge(head, nudge)).toEqual({ col: 0, row: 0 });
  });

  it("zeroes row component when nudge would go below row 0", () => {
    const head = { col: 10, row: 0 };
    const nudge = { col: 0, row: -1 };
    expect(safeNudge(head, nudge)).toEqual({ col: 0, row: 0 });
  });

  it("zeroes row component when nudge would exceed GRID_ROWS", () => {
    const head = { col: 10, row: GRID_ROWS - 1 };
    const nudge = { col: 0, row: 1 };
    expect(safeNudge(head, nudge)).toEqual({ col: 0, row: 0 });
  });

  it("zeroes only the violating axis when both are specified", () => {
    // Head at bottom-left corner, nudge is diagonal
    const head = { col: 0, row: GRID_ROWS - 1 };
    // col -1 would go out, but row -1 is fine
    const nudge = { col: -1, row: -1 };
    expect(safeNudge(head, nudge)).toEqual({ col: 0, row: -1 });
  });

  it("returns zero nudge when both axes would violate", () => {
    const head = { col: 0, row: 0 };
    const nudge = { col: -1, row: -1 };
    expect(safeNudge(head, nudge)).toEqual({ col: 0, row: 0 });
  });

  it("allows nudge at last valid position", () => {
    const head = { col: GRID_COLS - 2, row: GRID_ROWS - 2 };
    const nudge = { col: 1, row: 1 };
    expect(safeNudge(head, nudge)).toEqual({ col: 1, row: 1 });
  });
});

describe("BiomeMechanics – isSafeSpawnCell", () => {
  it("returns true for in-bounds unoccupied cell", () => {
    expect(isSafeSpawnCell({ col: 10, row: 10 }, [])).toBe(true);
  });

  it("returns false for out-of-bounds cell", () => {
    expect(isSafeSpawnCell({ col: -1, row: 10 }, [])).toBe(false);
    expect(isSafeSpawnCell({ col: GRID_COLS, row: 10 }, [])).toBe(false);
    expect(isSafeSpawnCell({ col: 10, row: -1 }, [])).toBe(false);
    expect(isSafeSpawnCell({ col: 10, row: GRID_ROWS }, [])).toBe(false);
  });

  it("returns false when any occupant check returns true", () => {
    const isSnake = (p: GridPos) => p.col === 10 && p.row === 10;
    expect(isSafeSpawnCell({ col: 10, row: 10 }, [isSnake])).toBe(false);
    expect(isSafeSpawnCell({ col: 11, row: 10 }, [isSnake])).toBe(true);
  });

  it("checks all occupant functions", () => {
    const isSnake = (p: GridPos) => p.col === 10 && p.row === 10;
    const isFood = (p: GridPos) => p.col === 5 && p.row === 5;
    const isLava = (p: GridPos) => p.col === 15 && p.row === 15;

    expect(isSafeSpawnCell({ col: 10, row: 10 }, [isSnake, isFood, isLava])).toBe(false);
    expect(isSafeSpawnCell({ col: 5, row: 5 }, [isSnake, isFood, isLava])).toBe(false);
    expect(isSafeSpawnCell({ col: 15, row: 15 }, [isSnake, isFood, isLava])).toBe(false);
    expect(isSafeSpawnCell({ col: 20, row: 20 }, [isSnake, isFood, isLava])).toBe(true);
  });
});

describe("BiomeMechanics – collectFreeCells", () => {
  it("returns all grid cells when no occupants", () => {
    const free = collectFreeCells([]);
    expect(free.length).toBe(GRID_COLS * GRID_ROWS);
  });

  it("excludes occupied cells", () => {
    const isOccupied = (p: GridPos) => p.col === 0 && p.row === 0;
    const free = collectFreeCells([isOccupied]);
    expect(free.length).toBe(GRID_COLS * GRID_ROWS - 1);
    expect(free.some((p) => p.col === 0 && p.row === 0)).toBe(false);
  });

  it("returns empty array when all cells occupied", () => {
    const allOccupied = () => true;
    const free = collectFreeCells([allOccupied]);
    expect(free.length).toBe(0);
  });

  it("all returned cells are in-bounds", () => {
    const free = collectFreeCells([]);
    for (const pos of free) {
      expect(pos.col).toBeGreaterThanOrEqual(0);
      expect(pos.col).toBeLessThan(GRID_COLS);
      expect(pos.row).toBeGreaterThanOrEqual(0);
      expect(pos.row).toBeLessThan(GRID_ROWS);
    }
  });
});

describe("BiomeMechanics – pickRandomCell", () => {
  it("returns null for empty array", () => {
    const rng = createSeededRng(42);
    expect(pickRandomCell([], rng)).toBeNull();
  });

  it("returns a cell from the provided array", () => {
    const cells: GridPos[] = [
      { col: 1, row: 1 },
      { col: 2, row: 2 },
      { col: 3, row: 3 },
    ];
    const rng = createSeededRng(42);
    const picked = pickRandomCell(cells, rng);
    expect(picked).not.toBeNull();
    expect(cells.some((c) => c.col === picked!.col && c.row === picked!.row)).toBe(true);
  });

  it("returns a copy (does not alias input cells)", () => {
    const cells: GridPos[] = [{ col: 5, row: 5 }];
    const rng = createSeededRng(42);
    const picked = pickRandomCell(cells, rng)!;
    picked.col = 99;
    expect(cells[0].col).toBe(5); // original unchanged
  });

  it("produces deterministic picks with the same RNG", () => {
    const cells = Array.from({ length: 100 }, (_, i) => ({
      col: i % GRID_COLS,
      row: Math.floor(i / GRID_COLS),
    }));

    const rng1 = createSeededRng(77);
    const rng2 = createSeededRng(77);

    const picks1 = Array.from({ length: 10 }, () => pickRandomCell(cells, rng1));
    const picks2 = Array.from({ length: 10 }, () => pickRandomCell(cells, rng2));

    expect(picks1).toEqual(picks2);
  });

  it("returns single-element array's element", () => {
    const cells: GridPos[] = [{ col: 7, row: 8 }];
    const rng = createSeededRng(42);
    expect(pickRandomCell(cells, rng)).toEqual({ col: 7, row: 8 });
  });
});

// ════════════════════════════════════════════════════════════════
// Config Builders
// ════════════════════════════════════════════════════════════════

describe("BiomeMechanics – getDefaultBiomeMechanicConfigs", () => {
  it("returns ice config with default slide tiles", () => {
    const cfg = getDefaultBiomeMechanicConfigs();
    expect(cfg.ice.slideTiles).toBe(ICE_SLIDE_TILES);
  });

  it("returns lava config with all defaults", () => {
    const cfg = getDefaultBiomeMechanicConfigs();
    expect(cfg.lava.burnSegments).toBe(LAVA_BURN_SEGMENTS);
    expect(cfg.lava.survivalThreshold).toBe(LAVA_SURVIVAL_THRESHOLD);
    expect(cfg.lava.maxPools).toBe(LAVA_MAX_POOLS);
    expect(cfg.lava.spawnIntervalMs).toBe(LAVA_SPAWN_INTERVAL_MS);
  });

  it("returns gravity config with all defaults", () => {
    const cfg = getDefaultBiomeMechanicConfigs();
    expect(cfg.gravity.pullCadence).toBe(GRAVITY_PULL_CADENCE);
    expect(cfg.gravity.center).toEqual(GRAVITY_CENTER);
  });

  it("returns independent objects on each call", () => {
    const cfg1 = getDefaultBiomeMechanicConfigs();
    const cfg2 = getDefaultBiomeMechanicConfigs();
    expect(cfg1).toEqual(cfg2);
    expect(cfg1).not.toBe(cfg2);
    expect(cfg1.gravity.center).not.toBe(cfg2.gravity.center);
  });
});

describe("BiomeMechanics – createBiomeMechanicConfigs", () => {
  it("returns defaults when called with no overrides", () => {
    const cfg = createBiomeMechanicConfigs();
    const defaults = getDefaultBiomeMechanicConfigs();
    expect(cfg).toEqual(defaults);
  });

  it("applies ice slide tiles override", () => {
    const cfg = createBiomeMechanicConfigs({ ice: { slideTiles: 4 } });
    expect(cfg.ice.slideTiles).toBe(4);
  });

  it("clamps ice slide tiles below min", () => {
    const cfg = createBiomeMechanicConfigs({ ice: { slideTiles: 0 } });
    expect(cfg.ice.slideTiles).toBe(ICE_SLIDE_TILES_MIN);
  });

  it("clamps ice slide tiles above max", () => {
    const cfg = createBiomeMechanicConfigs({ ice: { slideTiles: 100 } });
    expect(cfg.ice.slideTiles).toBe(ICE_SLIDE_TILES_MAX);
  });

  it("applies lava max pools override", () => {
    const cfg = createBiomeMechanicConfigs({ lava: { maxPools: 5 } });
    expect(cfg.lava.maxPools).toBe(5);
  });

  it("clamps lava max pools below min", () => {
    const cfg = createBiomeMechanicConfigs({ lava: { maxPools: 0 } });
    expect(cfg.lava.maxPools).toBe(LAVA_MAX_POOLS_MIN);
  });

  it("clamps lava max pools above max", () => {
    const cfg = createBiomeMechanicConfigs({ lava: { maxPools: 100 } });
    expect(cfg.lava.maxPools).toBe(LAVA_MAX_POOLS_MAX);
  });

  it("applies lava spawn interval override", () => {
    const cfg = createBiomeMechanicConfigs({ lava: { spawnIntervalMs: 2000 } });
    expect(cfg.lava.spawnIntervalMs).toBe(2000);
  });

  it("clamps lava spawn interval below min", () => {
    const cfg = createBiomeMechanicConfigs({ lava: { spawnIntervalMs: 10 } });
    expect(cfg.lava.spawnIntervalMs).toBe(LAVA_SPAWN_INTERVAL_MIN_MS);
  });

  it("clamps lava spawn interval above max", () => {
    const cfg = createBiomeMechanicConfigs({
      lava: { spawnIntervalMs: 999_999 },
    });
    expect(cfg.lava.spawnIntervalMs).toBe(LAVA_SPAWN_INTERVAL_MAX_MS);
  });

  it("applies lava burn segments override and recalculates threshold", () => {
    const cfg = createBiomeMechanicConfigs({ lava: { burnSegments: 5 } });
    expect(cfg.lava.burnSegments).toBe(5);
    expect(cfg.lava.survivalThreshold).toBe(6); // burn + 1
  });

  it("clamps lava burn segments to at least 1", () => {
    const cfg = createBiomeMechanicConfigs({ lava: { burnSegments: -2 } });
    expect(cfg.lava.burnSegments).toBe(1);
    expect(cfg.lava.survivalThreshold).toBe(2);
  });

  it("applies gravity pull cadence override", () => {
    const cfg = createBiomeMechanicConfigs({ gravity: { pullCadence: 8 } });
    expect(cfg.gravity.pullCadence).toBe(8);
  });

  it("clamps gravity cadence below min", () => {
    const cfg = createBiomeMechanicConfigs({ gravity: { pullCadence: 0 } });
    expect(cfg.gravity.pullCadence).toBe(GRAVITY_PULL_CADENCE_MIN);
  });

  it("clamps gravity cadence above max", () => {
    const cfg = createBiomeMechanicConfigs({ gravity: { pullCadence: 100 } });
    expect(cfg.gravity.pullCadence).toBe(GRAVITY_PULL_CADENCE_MAX);
  });

  it("applies gravity center override with grid clamping", () => {
    const cfg = createBiomeMechanicConfigs({
      gravity: { center: { col: -5, row: 999 } },
    });
    expect(cfg.gravity.center.col).toBe(0);
    expect(cfg.gravity.center.row).toBe(GRID_ROWS - 1);
  });

  it("applies valid gravity center override as-is", () => {
    const cfg = createBiomeMechanicConfigs({
      gravity: { center: { col: 10, row: 10 } },
    });
    expect(cfg.gravity.center).toEqual({ col: 10, row: 10 });
  });

  it("preserves defaults for unspecified biomes", () => {
    const cfg = createBiomeMechanicConfigs({ ice: { slideTiles: 3 } });
    const defaults = getDefaultBiomeMechanicConfigs();
    expect(cfg.lava).toEqual(defaults.lava);
    expect(cfg.gravity).toEqual(defaults.gravity);
  });

  it("handles multiple overrides simultaneously", () => {
    const cfg = createBiomeMechanicConfigs({
      ice: { slideTiles: 3 },
      lava: { maxPools: 4, spawnIntervalMs: 5000 },
      gravity: { pullCadence: 6 },
    });
    expect(cfg.ice.slideTiles).toBe(3);
    expect(cfg.lava.maxPools).toBe(4);
    expect(cfg.lava.spawnIntervalMs).toBe(5000);
    expect(cfg.gravity.pullCadence).toBe(6);
  });

  it("handles empty override objects", () => {
    const cfg = createBiomeMechanicConfigs({
      ice: {},
      lava: {},
      gravity: {},
    });
    const defaults = getDefaultBiomeMechanicConfigs();
    expect(cfg).toEqual(defaults);
  });
});

// ════════════════════════════════════════════════════════════════
// Re-export Integrity (constants accessible from both paths)
// ════════════════════════════════════════════════════════════════

describe("BiomeMechanics – Re-export Integrity", () => {
  it("ICE_SLIDE_TILES matches IceMomentum re-export", async () => {
    const { ICE_SLIDE_TILES: fromIce } = await import(
      "@/game/systems/IceMomentum"
    );
    expect(fromIce).toBe(ICE_SLIDE_TILES);
  });

  it("LAVA_BURN_SEGMENTS matches LavaPool re-export", async () => {
    const { LAVA_BURN_SEGMENTS: fromLava } = await import(
      "@/game/entities/LavaPool"
    );
    expect(fromLava).toBe(LAVA_BURN_SEGMENTS);
  });

  it("LAVA_SURVIVAL_THRESHOLD matches LavaPool re-export", async () => {
    const { LAVA_SURVIVAL_THRESHOLD: fromLava } = await import(
      "@/game/entities/LavaPool"
    );
    expect(fromLava).toBe(LAVA_SURVIVAL_THRESHOLD);
  });

  it("LAVA_MAX_POOLS matches LavaPool re-export", async () => {
    const { LAVA_MAX_POOLS: fromLava } = await import(
      "@/game/entities/LavaPool"
    );
    expect(fromLava).toBe(LAVA_MAX_POOLS);
  });

  it("LAVA_SPAWN_INTERVAL_MS matches LavaPool re-export", async () => {
    const { LAVA_SPAWN_INTERVAL_MS: fromLava } = await import(
      "@/game/entities/LavaPool"
    );
    expect(fromLava).toBe(LAVA_SPAWN_INTERVAL_MS);
  });

  it("GRAVITY_PULL_CADENCE matches GravityWell re-export", async () => {
    const { GRAVITY_PULL_CADENCE: fromGravity } = await import(
      "@/game/entities/GravityWell"
    );
    expect(fromGravity).toBe(GRAVITY_PULL_CADENCE);
  });

  it("GRAVITY_CENTER matches GravityWell re-export", async () => {
    const { GRAVITY_CENTER: fromGravity } = await import(
      "@/game/entities/GravityWell"
    );
    expect(fromGravity).toEqual(GRAVITY_CENTER);
  });
});

// ════════════════════════════════════════════════════════════════
// Cross-Mechanic Integration Scenarios
// ════════════════════════════════════════════════════════════════

describe("BiomeMechanics – Cross-Mechanic Integration", () => {
  it("seeded RNG produces consistent lava spawn positions via collectFreeCells + pickRandomCell", () => {
    const rng1 = createSeededRng(42);
    const rng2 = createSeededRng(42);

    const occupants: ((p: GridPos) => boolean)[] = [
      (p) => p.col === 10 && p.row === 10, // snake head
    ];

    const free = collectFreeCells(occupants);

    const pick1 = pickRandomCell(free, rng1);
    const pick2 = pickRandomCell(free, rng2);

    expect(pick1).toEqual(pick2);
    expect(pick1).not.toBeNull();
    // Picked cell should not be the occupied one
    expect(pick1!.col === 10 && pick1!.row === 10).toBe(false);
  });

  it("safeNudge prevents gravity well from pushing snake out-of-bounds", () => {
    // Snake at top-left corner, nudge would go negative
    const head = { col: 0, row: 0 };
    const nudge = { col: -1, row: -1 };
    const safe = safeNudge(head, nudge);

    // Both axes should be zeroed
    expect(safe).toEqual({ col: 0, row: 0 });
  });

  it("safeNudge allows nudge at arena interior", () => {
    const head = GRAVITY_CENTER;
    const nudge = { col: 1, row: 0 };
    expect(safeNudge(head, nudge)).toEqual(nudge);
  });

  it("custom config with extreme values stays within safe ranges", () => {
    const cfg = createBiomeMechanicConfigs({
      ice: { slideTiles: -100 },
      lava: { maxPools: -1, spawnIntervalMs: 1, burnSegments: 0 },
      gravity: { pullCadence: 0, center: { col: -999, row: -999 } },
    });

    expect(cfg.ice.slideTiles).toBe(ICE_SLIDE_TILES_MIN);
    expect(cfg.lava.maxPools).toBe(LAVA_MAX_POOLS_MIN);
    expect(cfg.lava.spawnIntervalMs).toBe(LAVA_SPAWN_INTERVAL_MIN_MS);
    expect(cfg.lava.burnSegments).toBe(1);
    expect(cfg.gravity.pullCadence).toBe(GRAVITY_PULL_CADENCE_MIN);
    expect(cfg.gravity.center).toEqual({ col: 0, row: 0 });
  });
});
