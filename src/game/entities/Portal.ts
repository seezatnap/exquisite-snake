import { GRID_COLS, GRID_ROWS } from "../config";
import { type GridPos, gridEquals } from "../utils/grid";

// ── Lifecycle states ────────────────────────────────────────────

/**
 * Portal lifecycle state machine:
 *
 *   spawning → active → collapsing → collapsed
 *
 * - `spawning`:   Portal pair has appeared; spawn animation playing.
 * - `active`:     Portal pair is fully operational and can be traversed.
 * - `collapsing`: Portal pair is playing its despawn animation.
 * - `collapsed`:  Portal pair has been removed from the board.
 */
export type PortalLifecycleState =
  | "spawning"
  | "active"
  | "collapsing"
  | "collapsed";

// ── Configuration ───────────────────────────────────────────────

/** Default time before a portal pair collapses (ms). */
export const PORTAL_LIFESPAN_MS = 8_000;

/** Duration of the spawn-in animation (ms). */
export const PORTAL_SPAWN_DURATION_MS = 500;

/** Duration of the collapse-out animation (ms). */
export const PORTAL_COLLAPSE_DURATION_MS = 500;

// ── Portal end ──────────────────────────────────────────────────

/** One end of a linked portal pair. */
export interface PortalEnd {
  /** Grid position of this portal end. */
  readonly position: GridPos;
}

// ── Portal pair options ─────────────────────────────────────────

export interface PortalPairOptions {
  /** Unique identifier for this linked pair. */
  id: string;

  /** Grid position of the entry portal. */
  positionA: GridPos;

  /** Grid position of the exit portal. */
  positionB: GridPos;

  /** Total time the pair stays on the board before collapsing (ms). */
  lifespanMs?: number;

  /** Duration of the spawn-in animation (ms). */
  spawnDurationMs?: number;

  /** Duration of the collapse-out animation (ms). */
  collapseDurationMs?: number;
}

// ── Cell occupancy checker ──────────────────────────────────────

/**
 * Callback that returns `true` when the given grid cell is occupied
 * by an entity that prevents portal placement (snake, food, lava, etc.).
 */
export type CellOccupancyChecker = (pos: GridPos) => boolean;

// ── PortalPair entity ───────────────────────────────────────────

/**
 * A linked pair of portals that exist on the arena grid.
 *
 * Each pair has two ends (A and B). When the snake head enters one end,
 * it exits from the other. The pair goes through a lifecycle:
 * spawning → active → collapsing → collapsed.
 *
 * This entity is pure data + timers — it does NOT own Phaser sprites.
 * Rendering and scene integration are handled externally by PortalManager
 * and the main scene.
 */
export class PortalPair {
  /** Unique ID for this linked pair. */
  readonly id: string;

  /** The two ends of the portal pair. */
  readonly endA: PortalEnd;
  readonly endB: PortalEnd;

  /** Total time the pair remains on the board before collapsing (ms). */
  readonly lifespanMs: number;

  /** Duration of the spawn animation (ms). */
  readonly spawnDurationMs: number;

  /** Duration of the collapse animation (ms). */
  readonly collapseDurationMs: number;

  /** Current lifecycle state. */
  private state: PortalLifecycleState = "spawning";

  /** Time elapsed in the current lifecycle state (ms). */
  private stateElapsedMs = 0;

  /** Total time alive since initial spawn (ms). */
  private totalElapsedMs = 0;

  constructor(options: PortalPairOptions) {
    this.id = options.id;
    this.endA = { position: { ...options.positionA } };
    this.endB = { position: { ...options.positionB } };
    this.lifespanMs = Math.max(0, options.lifespanMs ?? PORTAL_LIFESPAN_MS);
    this.spawnDurationMs = Math.max(
      0,
      options.spawnDurationMs ?? PORTAL_SPAWN_DURATION_MS,
    );
    this.collapseDurationMs = Math.max(
      0,
      options.collapseDurationMs ?? PORTAL_COLLAPSE_DURATION_MS,
    );
  }

  // ── Lifecycle ───────────────────────────────────────────────

  /**
   * Advance the portal pair by `delta` ms.
   *
   * Automatically transitions through lifecycle states:
   * - spawning → active   (after spawnDurationMs)
   * - active → collapsing  (after lifespanMs total)
   * - collapsing → collapsed (after collapseDurationMs)
   *
   * Returns the current state after advancing.
   */
  update(delta: number): PortalLifecycleState {
    const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    if (safeDelta === 0 || this.state === "collapsed") {
      return this.state;
    }

    this.totalElapsedMs += safeDelta;
    this.stateElapsedMs += safeDelta;

    switch (this.state) {
      case "spawning":
        if (this.stateElapsedMs >= this.spawnDurationMs) {
          this.transitionTo("active");
        }
        break;

      case "active":
        if (this.totalElapsedMs >= this.lifespanMs) {
          this.transitionTo("collapsing");
        }
        break;

      case "collapsing":
        if (this.stateElapsedMs >= this.collapseDurationMs) {
          this.transitionTo("collapsed");
        }
        break;
    }

    return this.state;
  }

  /** Force the portal pair into the collapsing state immediately. */
  beginCollapse(): void {
    if (this.state === "collapsing" || this.state === "collapsed") {
      return;
    }
    this.transitionTo("collapsing");
  }

  private transitionTo(nextState: PortalLifecycleState): void {
    this.state = nextState;
    this.stateElapsedMs = 0;
  }

  // ── State queries ─────────────────────────────────────────────

  /** Current lifecycle state. */
  getState(): PortalLifecycleState {
    return this.state;
  }

  /** Time elapsed in the current lifecycle state (ms). */
  getStateElapsedMs(): number {
    return this.stateElapsedMs;
  }

  /** Total time since initial spawn (ms). */
  getTotalElapsedMs(): number {
    return this.totalElapsedMs;
  }

  /** Remaining time before auto-collapse begins (ms). 0 if already collapsing/collapsed. */
  getRemainingMs(): number {
    if (this.state === "collapsing" || this.state === "collapsed") {
      return 0;
    }
    return Math.max(0, this.lifespanMs - this.totalElapsedMs);
  }

  /**
   * Animation progress within the current state, in [0, 1].
   *
   * Useful for spawn/collapse animations:
   * - During `spawning`: 0 → 1 over `spawnDurationMs`
   * - During `active`: always 1
   * - During `collapsing`: 0 → 1 over `collapseDurationMs`
   * - During `collapsed`: 1
   */
  getStateProgress(): number {
    switch (this.state) {
      case "spawning":
        return this.spawnDurationMs > 0
          ? Math.min(1, this.stateElapsedMs / this.spawnDurationMs)
          : 1;
      case "active":
        return 1;
      case "collapsing":
        return this.collapseDurationMs > 0
          ? Math.min(1, this.stateElapsedMs / this.collapseDurationMs)
          : 1;
      case "collapsed":
        return 1;
    }
  }

  /** Whether the portal is currently traversable (spawning or active). */
  isTraversable(): boolean {
    return this.state === "spawning" || this.state === "active";
  }

  /** Whether the portal has fully collapsed and can be removed. */
  isCollapsed(): boolean {
    return this.state === "collapsed";
  }

  // ── Position queries ──────────────────────────────────────────

  /** Check if a grid position matches either end of this pair. */
  isOnPortal(pos: GridPos): boolean {
    return (
      gridEquals(pos, this.endA.position) ||
      gridEquals(pos, this.endB.position)
    );
  }

  /**
   * Given a position that matches one end, return the linked exit position.
   * Returns `null` if the position doesn't match either end.
   */
  getLinkedExit(entryPos: GridPos): GridPos | null {
    if (gridEquals(entryPos, this.endA.position)) {
      return { ...this.endB.position };
    }
    if (gridEquals(entryPos, this.endB.position)) {
      return { ...this.endA.position };
    }
    return null;
  }

  /** Get both positions as an array. */
  getPositions(): [GridPos, GridPos] {
    return [{ ...this.endA.position }, { ...this.endB.position }];
  }
}

// ── Empty-cell placement helpers ────────────────────────────────

/**
 * Collect all grid cells that are not occupied according to the given checkers.
 *
 * Each checker returns `true` if the cell is occupied. A cell is free only
 * when every checker returns `false`.
 */
export function findEmptyCells(
  occupancyCheckers: CellOccupancyChecker[],
): GridPos[] {
  const freeCells: GridPos[] = [];

  for (let col = 0; col < GRID_COLS; col++) {
    for (let row = 0; row < GRID_ROWS; row++) {
      const pos: GridPos = { col, row };
      const occupied = occupancyCheckers.some((check) => check(pos));
      if (!occupied) {
        freeCells.push(pos);
      }
    }
  }

  return freeCells;
}

/**
 * Pick two distinct random positions from a list of candidate cells.
 *
 * Returns `null` if fewer than 2 candidates are available.
 *
 * @param candidates - Pool of free cells to choose from.
 * @param rng        - RNG function returning [0, 1). Defaults to Math.random.
 */
export function pickTwoDistinctCells(
  candidates: GridPos[],
  rng: () => number = Math.random,
): [GridPos, GridPos] | null {
  if (candidates.length < 2) {
    return null;
  }

  const indexA = Math.floor(rng() * candidates.length);
  let indexB = Math.floor(rng() * (candidates.length - 1));
  if (indexB >= indexA) {
    indexB += 1;
  }

  return [{ ...candidates[indexA] }, { ...candidates[indexB] }];
}

/**
 * Find a valid pair of empty cells for portal placement.
 *
 * Combines `findEmptyCells` and `pickTwoDistinctCells` into a single
 * convenience call. Returns `null` if the board is too full.
 *
 * @param occupancyCheckers - Functions that determine cell occupancy.
 * @param rng              - RNG function returning [0, 1).
 */
export function findPortalSpawnPositions(
  occupancyCheckers: CellOccupancyChecker[],
  rng: () => number = Math.random,
): [GridPos, GridPos] | null {
  const candidates = findEmptyCells(occupancyCheckers);
  return pickTwoDistinctCells(candidates, rng);
}

// ── Unique ID generator ─────────────────────────────────────────

let nextPortalId = 0;

/** Generate a unique portal pair ID. */
export function generatePortalPairId(): string {
  return `portal-${++nextPortalId}`;
}

/** Reset the ID counter (for testing). */
export function resetPortalPairIdCounter(): void {
  nextPortalId = 0;
}
