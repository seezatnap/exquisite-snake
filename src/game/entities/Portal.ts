import { GRID_COLS, GRID_ROWS } from "../config";
import { gridEquals, type GridPos } from "../utils/grid";

/** Lifecycle states for a linked portal pair. */
export type PortalLifecycleState =
  | "spawning"
  | "active"
  | "collapsing"
  | "collapsed";

export interface PortalLifecycleDurations {
  spawningMs: number;
  activeMs: number;
  collapsingMs: number;
}

/** Default lifecycle aligns with the Phase 5 requirement: despawn at 8s. */
export const DEFAULT_PORTAL_LIFECYCLE_DURATIONS: PortalLifecycleDurations = {
  spawningMs: 0,
  activeMs: 8_000,
  collapsingMs: 0,
};

export interface PortalOptions {
  /** Shared pair identifier used by both portal endpoints. */
  pairId: string;
  /** Grid positions for the two linked endpoints. */
  endpoints: readonly [GridPos, GridPos];
  /** Optional explicit endpoint IDs; defaults to `${pairId}:a` / `${pairId}:b`. */
  endpointIds?: readonly [string, string];
  /** Optional lifecycle overrides for timer tuning. */
  lifecycleDurations?: Partial<PortalLifecycleDurations>;
}

export interface PortalEndpoint {
  id: string;
  pairId: string;
  linkedEndpointId: string;
  position: GridPos;
}

export interface PortalLifecycleTransition {
  from: PortalLifecycleState;
  to: PortalLifecycleState;
  /** Total elapsed portal time when the transition occurred. */
  elapsedMs: number;
}

export interface EmptyCellPlacementOptions {
  gridCols?: number;
  gridRows?: number;
  occupiedCells?: Iterable<GridPos>;
  blockedCells?: Iterable<GridPos>;
}

export interface PortalPairPlacementOptions extends EmptyCellPlacementOptions {
  rng?: () => number;
  /** Minimum Manhattan distance between paired endpoints. */
  minManhattanDistance?: number;
}

const RANDOM_MAX_EXCLUSIVE = 0.9999999999999999;

export function createPortalEndpointId(pairId: string, side: "a" | "b"): string {
  return `${pairId}:${side}`;
}

export function createGridPositionKey(pos: GridPos): string {
  return `${pos.col}:${pos.row}`;
}

export function buildOccupiedCellSet(
  ...cellGroups: Array<Iterable<GridPos> | null | undefined>
): Set<string> {
  const occupied = new Set<string>();
  for (const group of cellGroups) {
    if (!group) continue;
    for (const cell of group) {
      occupied.add(createGridPositionKey(cell));
    }
  }
  return occupied;
}

export function listEmptyCells(options: EmptyCellPlacementOptions = {}): GridPos[] {
  const gridCols = sanitizeGridSize(options.gridCols, GRID_COLS);
  const gridRows = sanitizeGridSize(options.gridRows, GRID_ROWS);
  const blocked = buildOccupiedCellSet(options.occupiedCells, options.blockedCells);

  const emptyCells: GridPos[] = [];
  for (let col = 0; col < gridCols; col++) {
    for (let row = 0; row < gridRows; row++) {
      const pos: GridPos = { col, row };
      if (blocked.has(createGridPositionKey(pos))) {
        continue;
      }
      emptyCells.push(pos);
    }
  }

  return emptyCells;
}

export function pickRandomEmptyCell(
  options: EmptyCellPlacementOptions & { rng?: () => number } = {},
): GridPos | null {
  const emptyCells = listEmptyCells(options);
  if (emptyCells.length === 0) {
    return null;
  }

  const rng = options.rng ?? Math.random;
  const index = Math.floor(sampleRng(rng) * emptyCells.length);
  return emptyCells[index];
}

export function pickRandomEmptyPortalPairCells(
  options: PortalPairPlacementOptions = {},
): [GridPos, GridPos] | null {
  const emptyCells = listEmptyCells(options);
  if (emptyCells.length < 2) {
    return null;
  }

  const rng = options.rng ?? Math.random;
  const minDistance = sanitizeNonNegativeInt(options.minManhattanDistance, 0);
  const validPairs: Array<[GridPos, GridPos]> = [];
  for (let firstIndex = 0; firstIndex < emptyCells.length - 1; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < emptyCells.length;
      secondIndex += 1
    ) {
      const first = emptyCells[firstIndex];
      const second = emptyCells[secondIndex];
      if (minDistance > 0 && manhattanDistance(first, second) < minDistance) {
        continue;
      }
      validPairs.push([first, second]);
    }
  }

  if (validPairs.length === 0) {
    return null;
  }

  const pairIndex = Math.floor(sampleRng(rng) * validPairs.length);
  return validPairs[pairIndex];
}

export class Portal {
  private readonly pairId: string;
  private readonly endpointA: PortalEndpoint;
  private readonly endpointB: PortalEndpoint;
  private readonly lifecycleDurations: PortalLifecycleDurations;

  private state: PortalLifecycleState = "spawning";
  private elapsedMs = 0;
  private elapsedInStateMs = 0;

  constructor(options: PortalOptions) {
    this.pairId = normalizePairId(options.pairId);
    const endpointIds = options.endpointIds ?? [
      createPortalEndpointId(this.pairId, "a"),
      createPortalEndpointId(this.pairId, "b"),
    ];
    if (endpointIds[0] === endpointIds[1]) {
      throw new Error("Portal endpoint IDs must be unique.");
    }

    const endpointA = cloneGridPos(options.endpoints[0]);
    const endpointB = cloneGridPos(options.endpoints[1]);
    if (gridEquals(endpointA, endpointB)) {
      throw new Error("Portal endpoints must occupy distinct grid cells.");
    }

    this.endpointA = {
      id: endpointIds[0],
      pairId: this.pairId,
      linkedEndpointId: endpointIds[1],
      position: endpointA,
    };
    this.endpointB = {
      id: endpointIds[1],
      pairId: this.pairId,
      linkedEndpointId: endpointIds[0],
      position: endpointB,
    };

    this.lifecycleDurations = {
      spawningMs: sanitizeNonNegativeInt(
        options.lifecycleDurations?.spawningMs,
        DEFAULT_PORTAL_LIFECYCLE_DURATIONS.spawningMs,
      ),
      activeMs: sanitizeNonNegativeInt(
        options.lifecycleDurations?.activeMs,
        DEFAULT_PORTAL_LIFECYCLE_DURATIONS.activeMs,
      ),
      collapsingMs: sanitizeNonNegativeInt(
        options.lifecycleDurations?.collapsingMs,
        DEFAULT_PORTAL_LIFECYCLE_DURATIONS.collapsingMs,
      ),
    };

    this.resolveImmediateTransitions();
  }

  getPairId(): string {
    return this.pairId;
  }

  getState(): PortalLifecycleState {
    return this.state;
  }

  /** Whether this portal pair should currently accept traversal. */
  isTraversable(): boolean {
    return this.state === "active";
  }

  isCollapsed(): boolean {
    return this.state === "collapsed";
  }

  getElapsedMs(): number {
    return this.elapsedMs;
  }

  getElapsedInStateMs(): number {
    return this.elapsedInStateMs;
  }

  getLifecycleDurations(): PortalLifecycleDurations {
    return { ...this.lifecycleDurations };
  }

  /** Time until timed transition into `collapsing`. */
  getMsUntilCollapse(): number {
    switch (this.state) {
      case "spawning":
        return (
          this.getRemainingMsInState(this.lifecycleDurations.spawningMs) +
          this.lifecycleDurations.activeMs
        );
      case "active":
        return this.getRemainingMsInState(this.lifecycleDurations.activeMs);
      case "collapsing":
      case "collapsed":
        return 0;
    }
  }

  /** Time until the pair reaches fully collapsed/despawned state. */
  getMsUntilDespawn(): number {
    switch (this.state) {
      case "spawning":
        return (
          this.getRemainingMsInState(this.lifecycleDurations.spawningMs) +
          this.lifecycleDurations.activeMs +
          this.lifecycleDurations.collapsingMs
        );
      case "active":
        return (
          this.getRemainingMsInState(this.lifecycleDurations.activeMs) +
          this.lifecycleDurations.collapsingMs
        );
      case "collapsing":
        return this.getRemainingMsInState(this.lifecycleDurations.collapsingMs);
      case "collapsed":
        return 0;
    }
  }

  getEndpoints(): readonly [PortalEndpoint, PortalEndpoint] {
    return [cloneEndpoint(this.endpointA), cloneEndpoint(this.endpointB)];
  }

  getEndpointById(endpointId: string): PortalEndpoint | null {
    if (endpointId === this.endpointA.id) {
      return cloneEndpoint(this.endpointA);
    }
    if (endpointId === this.endpointB.id) {
      return cloneEndpoint(this.endpointB);
    }
    return null;
  }

  getLinkedEndpoint(endpointId: string): PortalEndpoint | null {
    if (endpointId === this.endpointA.id) {
      return cloneEndpoint(this.endpointB);
    }
    if (endpointId === this.endpointB.id) {
      return cloneEndpoint(this.endpointA);
    }
    return null;
  }

  getEndpointAt(position: GridPos): PortalEndpoint | null {
    if (gridEquals(this.endpointA.position, position)) {
      return cloneEndpoint(this.endpointA);
    }
    if (gridEquals(this.endpointB.position, position)) {
      return cloneEndpoint(this.endpointB);
    }
    return null;
  }

  getLinkedEndpointAt(position: GridPos): PortalEndpoint | null {
    const endpoint = this.getEndpointAt(position);
    if (!endpoint) {
      return null;
    }
    return this.getLinkedEndpoint(endpoint.id);
  }

  /**
   * Exit cell for a head entering `entryCell`, or null if not traversable /
   * not currently on an endpoint.
   */
  getExitPositionForEntryCell(entryCell: GridPos): GridPos | null {
    if (!this.isTraversable()) {
      return null;
    }
    const linked = this.getLinkedEndpointAt(entryCell);
    return linked ? cloneGridPos(linked.position) : null;
  }

  /**
   * Advance portal lifecycle timers. Returns any state transitions that fired.
   */
  advance(deltaMs: number): PortalLifecycleTransition[] {
    const safeDelta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
    if (safeDelta <= 0) {
      return [];
    }

    const transitions: PortalLifecycleTransition[] = [];
    let remaining = safeDelta;

    while (remaining > 0) {
      if (this.state === "collapsed") {
        break;
      }

      const stateDuration = this.getDurationForState(this.state);
      if (stateDuration <= 0) {
        this.transitionTo(this.getNextState(this.state), transitions);
        this.resolveImmediateTransitions(transitions);
        continue;
      }

      const remainingInState = Math.max(0, stateDuration - this.elapsedInStateMs);
      if (remainingInState <= 0) {
        this.transitionTo(this.getNextState(this.state), transitions);
        this.resolveImmediateTransitions(transitions);
        continue;
      }

      const consumedMs = Math.min(remaining, remainingInState);
      this.elapsedMs += consumedMs;
      this.elapsedInStateMs += consumedMs;
      remaining -= consumedMs;

      if (this.elapsedInStateMs >= stateDuration) {
        this.transitionTo(this.getNextState(this.state), transitions);
        this.resolveImmediateTransitions(transitions);
      }
    }

    return transitions;
  }

  /** Force the pair into collapsing now (used for emergency collapse paths). */
  beginCollapse(): PortalLifecycleTransition[] {
    if (this.state === "collapsing" || this.state === "collapsed") {
      return [];
    }

    const transitions: PortalLifecycleTransition[] = [];
    this.transitionTo("collapsing", transitions);
    this.resolveImmediateTransitions(transitions);
    return transitions;
  }

  /** Force immediate despawn regardless of current state/timers. */
  collapseImmediately(): PortalLifecycleTransition[] {
    if (this.state === "collapsed") {
      return [];
    }

    const transitions: PortalLifecycleTransition[] = [];
    if (this.state !== "collapsing") {
      this.transitionTo("collapsing", transitions);
    }
    this.transitionTo("collapsed", transitions);
    return transitions;
  }

  private getDurationForState(state: PortalLifecycleState): number {
    switch (state) {
      case "spawning":
        return this.lifecycleDurations.spawningMs;
      case "active":
        return this.lifecycleDurations.activeMs;
      case "collapsing":
        return this.lifecycleDurations.collapsingMs;
      case "collapsed":
        return 0;
    }
  }

  private getNextState(state: PortalLifecycleState): PortalLifecycleState {
    switch (state) {
      case "spawning":
        return "active";
      case "active":
        return "collapsing";
      case "collapsing":
      case "collapsed":
        return "collapsed";
    }
  }

  private resolveImmediateTransitions(
    transitions: PortalLifecycleTransition[] = [],
  ): void {
    let guard = 0;
    while (
      this.state !== "collapsed" &&
      this.getDurationForState(this.state) === 0 &&
      guard < 4
    ) {
      this.transitionTo(this.getNextState(this.state), transitions);
      guard += 1;
    }
  }

  private transitionTo(
    nextState: PortalLifecycleState,
    transitions: PortalLifecycleTransition[],
  ): void {
    if (nextState === this.state) {
      return;
    }
    const from = this.state;
    this.state = nextState;
    this.elapsedInStateMs = 0;
    transitions.push({ from, to: nextState, elapsedMs: this.elapsedMs });
  }

  private getRemainingMsInState(stateDurationMs: number): number {
    return Math.max(0, stateDurationMs - this.elapsedInStateMs);
  }
}

function cloneGridPos(pos: GridPos): GridPos {
  return { col: pos.col, row: pos.row };
}

function cloneEndpoint(endpoint: PortalEndpoint): PortalEndpoint {
  return {
    id: endpoint.id,
    pairId: endpoint.pairId,
    linkedEndpointId: endpoint.linkedEndpointId,
    position: cloneGridPos(endpoint.position),
  };
}

function sanitizeGridSize(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(value!));
}

function sanitizeNonNegativeInt(
  value: number | undefined,
  fallback: number,
): number {
  if (!Number.isFinite(value)) {
    return Math.max(0, Math.floor(fallback));
  }
  return Math.max(0, Math.floor(value!));
}

function sampleRng(rng: () => number): number {
  const raw = rng();
  if (!Number.isFinite(raw)) {
    return 0;
  }
  if (raw <= 0) {
    return 0;
  }
  if (raw >= 1) {
    return RANDOM_MAX_EXCLUSIVE;
  }
  return raw;
}

function manhattanDistance(a: GridPos, b: GridPos): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

function normalizePairId(pairId: string): string {
  const normalized = pairId.trim();
  if (normalized.length === 0) {
    throw new Error("Portal pairId must be a non-empty string.");
  }
  return normalized;
}
