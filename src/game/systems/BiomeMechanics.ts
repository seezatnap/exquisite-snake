import { GRID_COLS, GRID_ROWS } from "../config";
import type { GridPos } from "../utils/grid";
import { isInBounds } from "../utils/grid";

// ── Shared Biome-Mechanic Balancing Constants ────────────────────
//
// Single source of truth for all biome-mechanic tuning values.
// Individual mechanic files re-export the subset they need, but
// external callers (MainScene, tests) can also import directly
// from here when they need cross-biome constants.

// ── Ice Cavern ──────────────────────────────────────────────────

/** Number of extra tiles the snake slides in the old direction before turning. */
export const ICE_SLIDE_TILES = 2;

/** Minimum slide tiles (floor for any runtime override). */
export const ICE_SLIDE_TILES_MIN = 1;

/** Maximum slide tiles (ceiling for any runtime override). */
export const ICE_SLIDE_TILES_MAX = 5;

// ── Molten Core ─────────────────────────────────────────────────

/** Number of tail segments burned when the snake touches a lava pool. */
export const LAVA_BURN_SEGMENTS = 3;

/** Minimum snake length to survive a lava burn (head + burn count). */
export const LAVA_SURVIVAL_THRESHOLD = LAVA_BURN_SEGMENTS + 1;

/** Maximum number of lava pools that can exist simultaneously. */
export const LAVA_MAX_POOLS = 8;

/** Time between lava pool spawns in ms. */
export const LAVA_SPAWN_INTERVAL_MS = 3_000;

/** Minimum allowed pool cap (floor for any runtime override). */
export const LAVA_MAX_POOLS_MIN = 1;

/** Maximum allowed pool cap (ceiling for any runtime override). */
export const LAVA_MAX_POOLS_MAX = 20;

/** Minimum spawn interval in ms (floor — prevents overwhelming the player). */
export const LAVA_SPAWN_INTERVAL_MIN_MS = 500;

/** Maximum spawn interval in ms (ceiling — keeps lava relevant). */
export const LAVA_SPAWN_INTERVAL_MAX_MS = 10_000;

// ── Void Rift ───────────────────────────────────────────────────

/** Default cadence: apply one gravity nudge every N snake steps. */
export const GRAVITY_PULL_CADENCE = 4;

/** The center of the arena in grid coordinates (gravity target). */
export const GRAVITY_CENTER: Readonly<GridPos> = Object.freeze({
  col: Math.floor(GRID_COLS / 2),
  row: Math.floor(GRID_ROWS / 2),
});

/** Minimum pull cadence (strongest allowed pull — one nudge per step). */
export const GRAVITY_PULL_CADENCE_MIN = 1;

/** Maximum pull cadence (weakest allowed pull). */
export const GRAVITY_PULL_CADENCE_MAX = 20;

// ── Deterministic Seeded RNG ────────────────────────────────────
//
// A simple, fast, deterministic PRNG (Mulberry32) that can be used
// for any biome mechanic that needs randomness — lava pool placement,
// future random spawns, etc.
//
// All mechanic managers accept an `rng: () => number` function so
// callers can inject either `Math.random` (production) or a seeded
// instance (testing / replays).

/**
 * Create a deterministic RNG function from an integer seed.
 *
 * Based on Mulberry32 — a fast, well-distributed 32-bit PRNG.
 * Returns values in [0, 1), matching the `Math.random()` contract.
 *
 * Usage:
 * ```ts
 * const rng = createSeededRng(42);
 * rng(); // 0.6011037519201636
 * rng(); // 0.28316244948655367
 * ```
 */
export function createSeededRng(seed: number): () => number {
  let state = seed | 0; // coerce to 32-bit int
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Type alias for the injectable RNG function used by biome mechanics.
 * Returns a value in [0, 1), matching the `Math.random()` contract.
 */
export type BiomeRng = () => number;

// ── Edge-Case Handling Utilities ────────────────────────────────
//
// Helpers that enforce safe bounds for mechanic parameters and
// positions, preventing off-grid or invalid-state scenarios.

/**
 * Clamp an integer value to [min, max].
 *
 * Used to enforce safe ranges on configurable mechanic parameters
 * (slide tiles, pool caps, cadences, etc.).
 */
export function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Clamp a grid position so it stays inside the arena bounds.
 *
 * Useful after applying a gravity nudge or any positional modifier —
 * returns a new position that is guaranteed to be within the grid.
 * Does NOT mutate the input.
 */
export function clampToGrid(pos: GridPos): GridPos {
  return {
    col: Math.max(0, Math.min(GRID_COLS - 1, pos.col)),
    row: Math.max(0, Math.min(GRID_ROWS - 1, pos.row)),
  };
}

/**
 * Check whether a gravity nudge would push the snake out of bounds,
 * and return a safe nudge vector (clamped to grid edges).
 *
 * If the nudge would move the head to an invalid cell, the axis
 * component that causes the violation is zeroed out.
 *
 * @param head   - Current head position (must be in-bounds)
 * @param nudge  - Proposed nudge delta
 * @returns A safe nudge vector with out-of-bounds components zeroed.
 */
export function safeNudge(head: GridPos, nudge: GridPos): GridPos {
  const resultCol = head.col + nudge.col;
  const resultRow = head.row + nudge.row;

  return {
    col: resultCol >= 0 && resultCol < GRID_COLS ? nudge.col : 0,
    row: resultRow >= 0 && resultRow < GRID_ROWS ? nudge.row : 0,
  };
}

/**
 * Validate that a grid position is a safe spawn location.
 *
 * A cell is "safe" if it's in-bounds and not occupied by any of the
 * provided occupied-set check functions.
 *
 * @param pos       - Position to check
 * @param occupants - Array of functions that return true if `pos` is occupied
 * @returns `true` if the position is safe for spawning
 */
export function isSafeSpawnCell(
  pos: GridPos,
  occupants: ReadonlyArray<(p: GridPos) => boolean>,
): boolean {
  if (!isInBounds(pos)) return false;
  for (const isOccupied of occupants) {
    if (isOccupied(pos)) return false;
  }
  return true;
}

/**
 * Collect all free (unoccupied) cells in the grid.
 *
 * Iterates the entire grid and returns positions that pass all
 * occupancy checks. Used for deterministic lava pool placement
 * and any future biome mechanic that needs random safe positions.
 *
 * @param occupants - Array of functions that return true if a cell is occupied
 * @returns Array of free grid positions
 */
export function collectFreeCells(
  occupants: ReadonlyArray<(p: GridPos) => boolean>,
): GridPos[] {
  const free: GridPos[] = [];
  for (let col = 0; col < GRID_COLS; col++) {
    for (let row = 0; row < GRID_ROWS; row++) {
      const pos: GridPos = { col, row };
      if (isSafeSpawnCell(pos, occupants)) {
        free.push(pos);
      }
    }
  }
  return free;
}

/**
 * Pick a random cell from a list using the given RNG.
 *
 * Returns `null` if the array is empty (grid full — no free cells).
 * This is the shared random-selection primitive for biome mechanics.
 */
export function pickRandomCell(
  cells: readonly GridPos[],
  rng: BiomeRng,
): GridPos | null {
  if (cells.length === 0) return null;
  const index = Math.floor(rng() * cells.length);
  return { ...cells[index] };
}

// ── Mechanic Config Types ───────────────────────────────────────
//
// Strongly-typed configuration objects for each biome mechanic.
// These allow runtime customisation (e.g. difficulty scaling,
// accessibility options) while enforcing safe clamped ranges.

/** Configuration for Ice Cavern momentum. */
export interface IceMechanicConfig {
  readonly slideTiles: number;
}

/** Configuration for Molten Core lava pools. */
export interface LavaMechanicConfig {
  readonly burnSegments: number;
  readonly survivalThreshold: number;
  readonly maxPools: number;
  readonly spawnIntervalMs: number;
}

/** Configuration for Void Rift gravity well. */
export interface GravityMechanicConfig {
  readonly pullCadence: number;
  readonly center: Readonly<GridPos>;
}

/** Full biome-mechanic configuration bundle. */
export interface BiomeMechanicConfigs {
  readonly ice: IceMechanicConfig;
  readonly lava: LavaMechanicConfig;
  readonly gravity: GravityMechanicConfig;
}

/**
 * Build the default biome-mechanic configuration.
 *
 * Returns a frozen config object with all values set to their
 * canonical balancing defaults. Used by MainScene and tests.
 */
export function getDefaultBiomeMechanicConfigs(): BiomeMechanicConfigs {
  return {
    ice: {
      slideTiles: ICE_SLIDE_TILES,
    },
    lava: {
      burnSegments: LAVA_BURN_SEGMENTS,
      survivalThreshold: LAVA_SURVIVAL_THRESHOLD,
      maxPools: LAVA_MAX_POOLS,
      spawnIntervalMs: LAVA_SPAWN_INTERVAL_MS,
    },
    gravity: {
      pullCadence: GRAVITY_PULL_CADENCE,
      center: { ...GRAVITY_CENTER },
    },
  };
}

/**
 * Build a custom biome-mechanic configuration with clamped values.
 *
 * Accepts partial overrides and applies safe clamping to ensure
 * all parameters stay within valid ranges. Unspecified fields use
 * the canonical defaults.
 */
export function createBiomeMechanicConfigs(
  overrides?: Partial<{
    ice: Partial<IceMechanicConfig>;
    lava: Partial<LavaMechanicConfig>;
    gravity: Partial<GravityMechanicConfig>;
  }>,
): BiomeMechanicConfigs {
  const defaults = getDefaultBiomeMechanicConfigs();

  const slideTiles = clampInt(
    overrides?.ice?.slideTiles ?? defaults.ice.slideTiles,
    ICE_SLIDE_TILES_MIN,
    ICE_SLIDE_TILES_MAX,
  );

  const burnSegments = Math.max(
    1,
    Math.round(overrides?.lava?.burnSegments ?? defaults.lava.burnSegments),
  );

  const maxPools = clampInt(
    overrides?.lava?.maxPools ?? defaults.lava.maxPools,
    LAVA_MAX_POOLS_MIN,
    LAVA_MAX_POOLS_MAX,
  );

  const spawnIntervalMs = clampInt(
    overrides?.lava?.spawnIntervalMs ?? defaults.lava.spawnIntervalMs,
    LAVA_SPAWN_INTERVAL_MIN_MS,
    LAVA_SPAWN_INTERVAL_MAX_MS,
  );

  const pullCadence = clampInt(
    overrides?.gravity?.pullCadence ?? defaults.gravity.pullCadence,
    GRAVITY_PULL_CADENCE_MIN,
    GRAVITY_PULL_CADENCE_MAX,
  );

  const center = overrides?.gravity?.center
    ? clampToGrid(overrides.gravity.center)
    : { ...defaults.gravity.center };

  return {
    ice: { slideTiles },
    lava: {
      burnSegments,
      survivalThreshold: burnSegments + 1,
      maxPools,
      spawnIntervalMs,
    },
    gravity: { pullCadence, center },
  };
}
