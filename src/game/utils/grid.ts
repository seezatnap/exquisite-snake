import { TILE_SIZE, GRID_COLS, GRID_ROWS } from "../config";

// ── Types ─────────────────────────────────────────────────────────

/** Integer grid position (column, row). */
export interface GridPos {
  col: number;
  row: number;
}

/** Sub-pixel world position. */
export interface PixelPos {
  x: number;
  y: number;
}

/** Cardinal direction for grid movement. */
export type Direction = "up" | "down" | "left" | "right";

/** Direction expressed as a unit-vector on the grid. */
export interface DirectionVector {
  col: number; // -1, 0, or 1
  row: number; // -1, 0, or 1
}

// ── Direction helpers ─────────────────────────────────────────────

const DIRECTION_VECTORS: Record<Direction, DirectionVector> = {
  up: { col: 0, row: -1 },
  down: { col: 0, row: 1 },
  left: { col: -1, row: 0 },
  right: { col: 1, row: 0 },
};

/** Return the unit-vector for a cardinal direction. */
export function directionVector(dir: Direction): DirectionVector {
  return DIRECTION_VECTORS[dir];
}

/** Return the opposite of a cardinal direction. */
export function oppositeDirection(dir: Direction): Direction {
  switch (dir) {
    case "up":
      return "down";
    case "down":
      return "up";
    case "left":
      return "right";
    case "right":
      return "left";
  }
}

// ── Coordinate conversion ─────────────────────────────────────────

/**
 * Convert a grid position to the center pixel of that tile.
 * The center is at `(col + 0.5) * TILE_SIZE`.
 */
export function gridToPixel(pos: GridPos): PixelPos {
  return {
    x: (pos.col + 0.5) * TILE_SIZE,
    y: (pos.row + 0.5) * TILE_SIZE,
  };
}

/**
 * Convert a pixel position to the grid cell it falls within.
 * Values are floored so a pixel at the left/top edge of a tile maps to that tile.
 */
export function pixelToGrid(pos: PixelPos): GridPos {
  return {
    col: Math.floor(pos.x / TILE_SIZE),
    row: Math.floor(pos.y / TILE_SIZE),
  };
}

// ── Bounds checking ───────────────────────────────────────────────

/** Check whether a grid position is inside the arena bounds. */
export function isInBounds(pos: GridPos): boolean {
  return pos.col >= 0 && pos.col < GRID_COLS && pos.row >= 0 && pos.row < GRID_ROWS;
}

/** Move a grid position one step in the given direction. */
export function stepInDirection(pos: GridPos, dir: Direction): GridPos {
  const v = directionVector(dir);
  return { col: pos.col + v.col, row: pos.row + v.row };
}

/** Check whether two grid positions are the same cell. */
export function gridEquals(a: GridPos, b: GridPos): boolean {
  return a.col === b.col && a.row === b.row;
}

// ── Interpolation ─────────────────────────────────────────────────

/**
 * Linearly interpolate between two numbers.
 * `t` is clamped to [0, 1].
 */
export function lerp(a: number, b: number, t: number): number {
  const ct = Math.max(0, Math.min(1, t));
  return a + (b - a) * ct;
}

/**
 * Compute the interpolated pixel position between two grid cells.
 *
 * @param from  - Grid cell the entity is moving FROM
 * @param to    - Grid cell the entity is moving TO
 * @param t     - Progress through the move, 0 → `from`, 1 → `to`
 * @returns The pixel center position at progress `t`
 */
export function lerpGridPos(from: GridPos, to: GridPos, t: number): PixelPos {
  const pFrom = gridToPixel(from);
  const pTo = gridToPixel(to);
  return {
    x: lerp(pFrom.x, pTo.x, t),
    y: lerp(pFrom.y, pTo.y, t),
  };
}

// ── Movement timing ───────────────────────────────────────────────

/** Default movement interval in ms (≈8 tiles/second at 125 ms per step). */
export const DEFAULT_MOVE_INTERVAL_MS = 125;

/**
 * Movement ticker — tracks elapsed time and signals when the entity should
 * advance to the next grid cell, while exposing a 0→1 interpolation
 * factor (`progress`) for smooth rendering between steps.
 *
 * Usage (inside a Phaser `update` callback):
 * ```ts
 * const stepped = ticker.advance(delta);
 * if (stepped) { /* move the snake's logical grid position *\/ }
 * const t = ticker.progress;  // use for visual interpolation
 * ```
 */
export class MoveTicker {
  /** Time accumulated toward the next step (ms). */
  private accumulated = 0;

  /** Current movement interval in ms. */
  private _interval: number;

  constructor(interval: number = DEFAULT_MOVE_INTERVAL_MS) {
    this._interval = interval;
  }

  /** The current interval between grid steps (ms). */
  get interval(): number {
    return this._interval;
  }

  /** Change the step interval (e.g. to speed up as score increases). */
  setInterval(ms: number): void {
    this._interval = Math.max(1, ms);
  }

  /**
   * Advance the ticker by `delta` milliseconds.
   *
   * @returns `true` if a grid step was completed during this advance
   *          (the caller should then move the entity to its next grid cell).
   *
   * When a step fires, leftover time beyond the interval is carried over so
   * the cadence stays accurate across frames of varying length.
   */
  advance(delta: number): boolean {
    this.accumulated += delta;
    if (this.accumulated >= this._interval) {
      // Carry over excess; cap at one interval to avoid multi-step skips
      this.accumulated = Math.min(this.accumulated - this._interval, this._interval);
      return true;
    }
    return false;
  }

  /**
   * Interpolation factor [0, 1] representing progress through the
   * current movement interval.  Use with `lerpGridPos` for smooth rendering.
   *
   * - `0` means we just started a new step
   * - `1` means we're about to complete the step
   */
  get progress(): number {
    return Math.min(this.accumulated / this._interval, 1);
  }

  /** Reset the ticker to zero (e.g. on game restart). */
  reset(): void {
    this.accumulated = 0;
  }
}
