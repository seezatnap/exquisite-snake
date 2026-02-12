import { GRID_COLS, GRID_ROWS } from "../config";
import type { GridPos } from "../utils/grid";
import type { Snake } from "./Snake";

// ── Tunable constants ───────────────────────────────────────────

/**
 * Default cadence: apply one gravity nudge every N snake steps.
 * A higher value means weaker pull; a lower value means stronger pull.
 */
export const GRAVITY_PULL_CADENCE = 4;

/** The center of the arena in grid coordinates (gravity target). */
export const GRAVITY_CENTER: Readonly<GridPos> = {
  col: Math.floor(GRID_COLS / 2),
  row: Math.floor(GRID_ROWS / 2),
};

// ── GravityWellManager ──────────────────────────────────────────

/**
 * Manages the Void Rift gravity well mechanic.
 *
 * Every `cadence` snake steps, the snake's head is nudged one tile
 * closer to the arena center. The nudge chooses the axis with the
 * largest distance to the center (deterministic tie-breaking: column
 * first). If the snake head is already at the center, no nudge occurs.
 *
 * The nudge is purely positional — it modifies the snake's head grid
 * position in-place after normal movement, before collision checks.
 * This keeps movement predictable and fair: the player can always
 * see the pull coming on a fixed cadence.
 */
export class GravityWellManager {
  private stepCounter = 0;
  private cadence: number;
  private center: GridPos;

  constructor(
    cadence: number = GRAVITY_PULL_CADENCE,
    center?: GridPos,
  ) {
    this.cadence = cadence;
    this.center = center ?? { ...GRAVITY_CENTER };
  }

  // ── Core update ────────────────────────────────────────────────

  /**
   * Notify the manager that the snake has taken one grid step.
   * Returns `true` if a gravity nudge was applied this step.
   *
   * Call this after normal snake movement but before collision checks
   * so that wall/self-collision accounts for the nudged position.
   */
  onSnakeStep(snake: Snake): boolean {
    this.stepCounter++;

    if (this.stepCounter < this.cadence) {
      return false;
    }

    // Reset counter (carry-over not needed — exact cadence)
    this.stepCounter = 0;

    return this.applyNudge(snake);
  }

  // ── Nudge logic ────────────────────────────────────────────────

  /**
   * Compute and apply a 1-tile nudge toward the center.
   *
   * Nudge axis selection:
   *  - Pick the axis with the largest absolute distance to center.
   *  - On a tie, prefer the column axis (deterministic).
   *  - If already at center on both axes, no nudge is applied.
   *
   * @returns `true` if a nudge was applied, `false` if already at center.
   */
  private applyNudge(snake: Snake): boolean {
    const head = snake.getHeadPosition();
    const nudge = GravityWellManager.computeNudge(head, this.center);

    if (nudge.col === 0 && nudge.row === 0) {
      return false; // Already at center
    }

    snake.applyPositionNudge(nudge);
    return true;
  }

  // ── Pure computation (static for testability) ──────────────────

  /**
   * Compute the 1-tile nudge vector toward `center` from `head`.
   *
   * Returns a GridPos delta: exactly one of { col, row } will be ±1,
   * the other 0.  Returns { 0, 0 } when head === center.
   */
  static computeNudge(head: GridPos, center: GridPos): GridPos {
    const dc = center.col - head.col;
    const dr = center.row - head.row;

    if (dc === 0 && dr === 0) {
      return { col: 0, row: 0 };
    }

    // Pick the axis with the largest absolute distance (col wins ties)
    if (Math.abs(dc) >= Math.abs(dr)) {
      return { col: dc > 0 ? 1 : -1, row: 0 };
    } else {
      return { col: 0, row: dr > 0 ? 1 : -1 };
    }
  }

  // ── State queries ──────────────────────────────────────────────

  /** Current step counter (steps since last nudge). */
  getStepCount(): number {
    return this.stepCounter;
  }

  /** The configured cadence (steps between nudges). */
  getCadence(): number {
    return this.cadence;
  }

  /** The gravity center position. */
  getCenter(): GridPos {
    return { ...this.center };
  }

  /** How many steps remain until the next nudge. */
  getStepsUntilNextPull(): number {
    return this.cadence - this.stepCounter;
  }

  // ── Reset ──────────────────────────────────────────────────────

  /** Reset the step counter. Call when the biome changes away from Void Rift. */
  reset(): void {
    this.stepCounter = 0;
  }

  /** Destroy / cleanup (no sprites to manage, but matches LavaPoolManager API). */
  destroy(): void {
    this.reset();
  }
}
