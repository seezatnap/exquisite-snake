import { GRID_COLS, GRID_ROWS } from "../config";
import {
  areGridPositionsEqual,
  isWithinGridBounds,
  toGridKey,
  type GridBounds,
  type GridPosition,
} from "../utils/grid";

export const DEFAULT_FOOD_SCORE_VALUE = 1;
export const DEFAULT_FOOD_GROWTH_SEGMENTS = 1;

const DEFAULT_BOUNDS: GridBounds = Object.freeze({
  cols: GRID_COLS,
  rows: GRID_ROWS,
});

const sanitizeNonNegativeInteger = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const normalizedValue = Math.floor(value);
  return normalizedValue >= 0 ? normalizedValue : fallback;
};

const normalizeBounds = (bounds: GridBounds): GridBounds => ({
  cols: Math.max(0, Math.floor(bounds.cols)),
  rows: Math.max(0, Math.floor(bounds.rows)),
});

const cloneGridPosition = (position: GridPosition): GridPosition => ({
  x: position.x,
  y: position.y,
});

const getRandomIndex = (maxExclusive: number, random: () => number): number => {
  if (maxExclusive <= 1) {
    return 0;
  }

  const randomValue = random();
  if (!Number.isFinite(randomValue)) {
    return 0;
  }

  const normalizedValue = Math.min(0.999999999, Math.max(0, randomValue));
  return Math.floor(normalizedValue * maxExclusive);
};

export type FoodSnakeTarget = Readonly<{
  head: GridPosition;
  getSegments(): ReadonlyArray<GridPosition>;
  grow(segments?: number): void;
}>;

export type FoodOptions = Readonly<{
  bounds?: GridBounds;
  scoreValue?: number;
  growthSegments?: number;
  onScore?: (points: number) => void;
  random?: () => number;
}>;

export class Food {
  private position: GridPosition | null = null;

  private readonly bounds: GridBounds;

  private readonly scoreValue: number;

  private readonly growthSegments: number;

  private readonly onScore?: (points: number) => void;

  private readonly random: () => number;

  constructor(options: FoodOptions = {}) {
    this.bounds = normalizeBounds(options.bounds ?? DEFAULT_BOUNDS);
    this.scoreValue = sanitizeNonNegativeInteger(
      options.scoreValue ?? DEFAULT_FOOD_SCORE_VALUE,
      DEFAULT_FOOD_SCORE_VALUE,
    );
    this.growthSegments = sanitizeNonNegativeInteger(
      options.growthSegments ?? DEFAULT_FOOD_GROWTH_SEGMENTS,
      DEFAULT_FOOD_GROWTH_SEGMENTS,
    );
    this.onScore = options.onScore;
    this.random = options.random ?? Math.random;
  }

  get currentPosition(): GridPosition | null {
    return this.position ? cloneGridPosition(this.position) : null;
  }

  spawn(occupiedPositions: ReadonlyArray<GridPosition> = []): GridPosition | null {
    const availablePositions = this.getAvailablePositions(occupiedPositions);

    if (availablePositions.length === 0) {
      this.position = null;
      return null;
    }

    const spawnIndex = getRandomIndex(availablePositions.length, this.random);
    const nextPosition = availablePositions[spawnIndex] ?? availablePositions[0];
    this.position = cloneGridPosition(nextPosition);
    return this.currentPosition;
  }

  spawnForSnake(snake: Pick<FoodSnakeTarget, "getSegments">): GridPosition | null {
    return this.spawn(snake.getSegments());
  }

  tryEat(snake: FoodSnakeTarget): boolean {
    if (!this.position || !areGridPositionsEqual(snake.head, this.position)) {
      return false;
    }

    snake.grow(this.growthSegments);
    this.onScore?.(this.scoreValue);
    this.spawnForSnake(snake);
    return true;
  }

  isAt(position: GridPosition): boolean {
    return this.position !== null && areGridPositionsEqual(this.position, position);
  }

  private getAvailablePositions(
    occupiedPositions: ReadonlyArray<GridPosition>,
  ): GridPosition[] {
    const occupiedKeys = new Set<string>();

    for (const occupiedPosition of occupiedPositions) {
      if (isWithinGridBounds(occupiedPosition, this.bounds)) {
        occupiedKeys.add(toGridKey(occupiedPosition));
      }
    }

    const availablePositions: GridPosition[] = [];

    for (let row = 0; row < this.bounds.rows; row += 1) {
      for (let col = 0; col < this.bounds.cols; col += 1) {
        const candidatePosition = { x: col, y: row };
        if (occupiedKeys.has(toGridKey(candidatePosition))) {
          continue;
        }

        availablePositions.push(candidatePosition);
      }
    }

    return availablePositions;
  }
}
