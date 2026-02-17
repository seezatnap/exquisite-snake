import Phaser from "phaser";
import { GRID_COLS, GRID_ROWS, TEXTURE_KEYS, RENDER_DEPTH } from "../config";
import { type GridPos, gridToPixel, gridEquals } from "../utils/grid";
import type { Snake } from "./Snake";

/** Points awarded per food eaten. */
const POINTS_PER_FOOD = 1;

/** Growth segments added per food eaten. */
const GROWTH_PER_FOOD = 1;

export interface FoodCheckEatOptions {
  /**
   * Optional cells that food respawn must avoid in addition to snake segments.
   *
   * Used to enforce gameplay invariants such as "food never routes through
   * active portal endpoints."
   */
  blockedCells?: Iterable<GridPos>;
}

/**
 * Food entity — spawns on the arena grid in a cell not occupied by the snake,
 * detects when the snake head reaches it, triggers score increment and snake
 * growth, then respawns at a new safe position.
 */
export class Food {
  /** Current grid position of the food. */
  private position: GridPos;

  /** Phaser sprite for the food. */
  private sprite: Phaser.GameObjects.Sprite;

  /** Reference to the Phaser scene. */
  private scene: Phaser.Scene;

  /**
   * Optional RNG function (returns a value in [0, 1)).
   * Defaults to Math.random; injectable for deterministic tests.
   */
  private rng: () => number;

  constructor(
    scene: Phaser.Scene,
    snake: Snake,
    rng?: () => number,
  ) {
    this.scene = scene;
    this.rng = rng ?? Math.random;

    // Pick an initial safe position and create the sprite
    this.position = this.findSafePosition(snake);
    const px = gridToPixel(this.position);
    this.sprite = this.scene.add.sprite(px.x, px.y, TEXTURE_KEYS.FOOD);
    this.sprite.setDepth?.(RENDER_DEPTH.FOOD);
  }

  // ── Spawn logic ─────────────────────────────────────────────────

  /**
   * Find a random grid position that does not overlap any snake segment.
   *
   * Strategy: collect all free cells and pick one at random.
   * Optional `blockedCells` allow callers to exclude additional mechanics
   * tiles (for example active portal endpoints).
   *
   * If no candidate remains after applying blocked-cell filters, the method
   * falls back to classic snake-only placement.
   * If the grid is completely full (snake fills every cell), falls back to
   * (0, 0) — in practice this should never happen in normal gameplay.
   */
  findSafePosition(snake: Snake, blockedCells?: Iterable<GridPos>): GridPos {
    const blockedKeys = buildGridPosKeySet(blockedCells);
    const freeCells: GridPos[] = [];

    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        const pos: GridPos = { col, row };
        if (snake.isOnSnake(pos)) {
          continue;
        }
        if (blockedKeys.has(gridPosKey(pos))) {
          continue;
        }
        freeCells.push(pos);
      }
    }

    // If all candidates were blocked, keep gameplay alive by falling back
    // to snake-only safety filtering.
    if (freeCells.length === 0 && blockedKeys.size > 0) {
      for (let col = 0; col < GRID_COLS; col++) {
        for (let row = 0; row < GRID_ROWS; row++) {
          const pos: GridPos = { col, row };
          if (!snake.isOnSnake(pos)) {
            freeCells.push(pos);
          }
        }
      }
    }

    if (freeCells.length === 0) {
      // Grid is full — degenerate edge case
      return { col: 0, row: 0 };
    }

    const index = Math.floor(this.rng() * freeCells.length);
    return freeCells[index];
  }

  /**
   * Respawn the food at a new safe position and update the sprite.
   */
  respawn(snake: Snake, blockedCells?: Iterable<GridPos>): void {
    this.position = this.findSafePosition(snake, blockedCells);
    const px = gridToPixel(this.position);
    this.sprite.setPosition(px.x, px.y);
  }

  // ── Eat detection & integration ─────────────────────────────────

  /**
   * Check whether the snake head is on the food. If so, trigger growth
   * and score, then respawn.
   *
   * @param snake - The snake entity to check against.
   * @param onScore - Callback invoked with the number of points to add.
   * @param options - Optional respawn constraints (e.g. blocked portal cells).
   * @returns `true` if the food was eaten this call.
   */
  checkEat(
    snake: Snake,
    onScore: (points: number) => void,
    options: FoodCheckEatOptions = {},
  ): boolean {
    if (!gridEquals(snake.getHeadPosition(), this.position)) {
      return false;
    }

    // Trigger snake growth
    snake.grow(GROWTH_PER_FOOD);

    // Notify score callback
    onScore(POINTS_PER_FOOD);

    // Respawn at a new safe location
    this.respawn(snake, options.blockedCells);

    return true;
  }

  // ── State queries ───────────────────────────────────────────────

  /** Get the current grid position. */
  getPosition(): GridPos {
    return { ...this.position };
  }

  /** Get the Phaser sprite (e.g. for particle effects). */
  getSprite(): Phaser.GameObjects.Sprite {
    return this.sprite;
  }

  // ── Cleanup ─────────────────────────────────────────────────────

  /** Destroy the food sprite and clean up. */
  destroy(): void {
    this.sprite.destroy();
  }
}

function gridPosKey(pos: GridPos): string {
  return `${pos.col}:${pos.row}`;
}

function buildGridPosKeySet(cells?: Iterable<GridPos>): Set<string> {
  const keys = new Set<string>();
  if (!cells) {
    return keys;
  }
  for (const cell of cells) {
    keys.add(gridPosKey(cell));
  }
  return keys;
}
