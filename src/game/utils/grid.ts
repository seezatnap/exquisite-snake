import { GRID_COLS, GRID_ROWS, TILE_SIZE } from "../config";

export const DEFAULT_GRID_STEP_DURATION_MS = 120;

export type GridPosition = Readonly<{
  x: number;
  y: number;
}>;

export type GridBounds = Readonly<{
  cols: number;
  rows: number;
}>;

export type WorldAnchor = "center" | "top-left";

export type Direction = "up" | "right" | "down" | "left";

export const CARDINAL_DIRECTIONS = [
  "up",
  "right",
  "down",
  "left",
] as const satisfies ReadonlyArray<Direction>;

const DIRECTION_VECTORS: Readonly<Record<Direction, GridPosition>> = Object.freeze(
  {
    up: Object.freeze({ x: 0, y: -1 }),
    right: Object.freeze({ x: 1, y: 0 }),
    down: Object.freeze({ x: 0, y: 1 }),
    left: Object.freeze({ x: -1, y: 0 }),
  },
);

const OPPOSITE_DIRECTIONS: Readonly<Record<Direction, Direction>> =
  Object.freeze({
    up: "down",
    right: "left",
    down: "up",
    left: "right",
  });

const DEFAULT_GRID_BOUNDS: GridBounds = Object.freeze({
  cols: GRID_COLS,
  rows: GRID_ROWS,
});

const sanitizeFiniteNonNegative = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
};

const sanitizePositive = (value: number, fallback: number): number => {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return value;
};

const normalizeBounds = (bounds: GridBounds): GridBounds => ({
  cols: Math.max(0, Math.floor(bounds.cols)),
  rows: Math.max(0, Math.floor(bounds.rows)),
});

const resolveTileSize = (tileSize: number): number =>
  sanitizePositive(tileSize, TILE_SIZE);

export const clampInterpolationAlpha = (alpha: number): number => {
  if (!Number.isFinite(alpha)) {
    return 0;
  }

  return Math.min(1, Math.max(0, alpha));
};

export const directionToVector = (direction: Direction): GridPosition =>
  DIRECTION_VECTORS[direction];

export const getOppositeDirection = (direction: Direction): Direction =>
  OPPOSITE_DIRECTIONS[direction];

export const isOppositeDirection = (
  currentDirection: Direction,
  nextDirection: Direction,
): boolean => getOppositeDirection(currentDirection) === nextDirection;

export const areGridPositionsEqual = (
  first: GridPosition,
  second: GridPosition,
): boolean => first.x === second.x && first.y === second.y;

export const toGridKey = (position: GridPosition): string =>
  `${position.x},${position.y}`;

export const translateGridPosition = (
  position: GridPosition,
  vector: GridPosition,
  distance = 1,
): GridPosition => {
  const stepDistance = Number.isFinite(distance) ? distance : 0;

  return {
    x: position.x + vector.x * stepDistance,
    y: position.y + vector.y * stepDistance,
  };
};

export const advanceGridPosition = (
  position: GridPosition,
  direction: Direction,
  distance = 1,
): GridPosition =>
  translateGridPosition(position, directionToVector(direction), distance);

export const isWithinGridBounds = (
  position: GridPosition,
  bounds: GridBounds = DEFAULT_GRID_BOUNDS,
): boolean => {
  const normalizedBounds = normalizeBounds(bounds);

  return (
    position.x >= 0 &&
    position.y >= 0 &&
    position.x < normalizedBounds.cols &&
    position.y < normalizedBounds.rows
  );
};

export const gridToWorldPosition = (
  position: GridPosition,
  tileSize = TILE_SIZE,
  anchor: WorldAnchor = "center",
): GridPosition => {
  const resolvedTileSize = resolveTileSize(tileSize);
  const worldPosition = {
    x: position.x * resolvedTileSize,
    y: position.y * resolvedTileSize,
  };

  if (anchor === "top-left") {
    return worldPosition;
  }

  return {
    x: worldPosition.x + resolvedTileSize / 2,
    y: worldPosition.y + resolvedTileSize / 2,
  };
};

export const worldToGridPosition = (
  worldPosition: GridPosition,
  tileSize = TILE_SIZE,
): GridPosition => {
  const resolvedTileSize = resolveTileSize(tileSize);

  return {
    x: Math.floor(worldPosition.x / resolvedTileSize),
    y: Math.floor(worldPosition.y / resolvedTileSize),
  };
};

export const interpolateGridPosition = (
  from: GridPosition,
  to: GridPosition,
  alpha: number,
): GridPosition => {
  const t = clampInterpolationAlpha(alpha);

  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
  };
};

export const interpolateWorldPosition = (
  from: GridPosition,
  to: GridPosition,
  alpha: number,
  tileSize = TILE_SIZE,
  anchor: WorldAnchor = "center",
): GridPosition =>
  gridToWorldPosition(interpolateGridPosition(from, to, alpha), tileSize, anchor);

export const getStepInterpolationAlpha = (
  elapsedInStepMs: number,
  stepDurationMs = DEFAULT_GRID_STEP_DURATION_MS,
): number => {
  const resolvedStepDuration = sanitizePositive(
    stepDurationMs,
    DEFAULT_GRID_STEP_DURATION_MS,
  );

  return clampInterpolationAlpha(
    sanitizeFiniteNonNegative(elapsedInStepMs) / resolvedStepDuration,
  );
};

export const getStepInterpolationFromTimestamps = (
  nowMs: number,
  stepStartedAtMs: number,
  stepDurationMs = DEFAULT_GRID_STEP_DURATION_MS,
): number => getStepInterpolationAlpha(nowMs - stepStartedAtMs, stepDurationMs);

export class GridStepClock {
  private stepDurationMs: number;

  private elapsedInCurrentStepMs = 0;

  constructor(stepDurationMs = DEFAULT_GRID_STEP_DURATION_MS) {
    this.stepDurationMs = sanitizePositive(
      stepDurationMs,
      DEFAULT_GRID_STEP_DURATION_MS,
    );
  }

  get durationMs(): number {
    return this.stepDurationMs;
  }

  get elapsedMs(): number {
    return this.elapsedInCurrentStepMs;
  }

  get interpolationAlpha(): number {
    return getStepInterpolationAlpha(this.elapsedInCurrentStepMs, this.stepDurationMs);
  }

  tick(deltaMs: number): number {
    this.elapsedInCurrentStepMs += sanitizeFiniteNonNegative(deltaMs);
    const completedSteps = Math.floor(
      this.elapsedInCurrentStepMs / this.stepDurationMs,
    );

    if (completedSteps > 0) {
      this.elapsedInCurrentStepMs -= completedSteps * this.stepDurationMs;
    }

    return completedSteps;
  }

  reset(alpha = 0): void {
    this.elapsedInCurrentStepMs =
      clampInterpolationAlpha(alpha) * this.stepDurationMs;
  }

  setStepDuration(stepDurationMs: number): void {
    const nextStepDurationMs = sanitizePositive(stepDurationMs, this.stepDurationMs);

    if (nextStepDurationMs === this.stepDurationMs) {
      return;
    }

    const interpolationAlpha = this.interpolationAlpha;
    this.stepDurationMs = nextStepDurationMs;
    this.elapsedInCurrentStepMs = interpolationAlpha * this.stepDurationMs;
  }
}

export const createGridStepClock = (
  stepDurationMs = DEFAULT_GRID_STEP_DURATION_MS,
): GridStepClock => new GridStepClock(stepDurationMs);
