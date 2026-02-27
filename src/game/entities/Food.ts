import Phaser from "phaser";
import { GRID_COLS, GRID_ROWS, TEXTURE_KEYS, RENDER_DEPTH } from "../config";
import { type GridPos, gridToPixel, gridEquals } from "../utils/grid";
import type { Snake } from "./Snake";

/** Points awarded per food eaten. */
const POINTS_PER_FOOD = 1;

/** Growth segments added per food eaten. */
const GROWTH_PER_FOOD = 1;

/**
 * Callback that returns `true` when the given grid cell is excluded
 * from food placement (e.g. portal cells, lava pools).
 */
export type FoodExclusionChecker = (pos: GridPos) => boolean;

/**
 * Food entity — spawns on the arena grid in a cell not occupied by the snake
 * or any excluded zone (portals, etc.), detects when the snake head reaches
 * it, triggers score increment and snake growth, then respawns at a new safe
 * position.
 *
 * **Portal exclusion invariant**: Food must never be spawned on, pulled
 * through, or routed through portal cells. The exclusion checkers enforce
 * this at spawn/respawn time, and food position is never mutated by portal
 * traversal logic.
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

  /**
   * External exclusion checkers that prevent food from spawning on
   * certain cells (e.g. portal cells). Each checker returns `true`
   * if the cell is excluded.
   */
  private exclusionCheckers: FoodExclusionChecker[] = [];

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

  // ── Exclusion management ──────────────────────────────────────────

  /**
   * Set external exclusion checkers that prevent food from spawning on
   * certain cells (e.g. active portal cells). Replaces any previously set
   * checkers.
   */
  setExclusionCheckers(checkers: FoodExclusionChecker[]): void {
    this.exclusionCheckers = [...checkers];
  }

  // ── Spawn logic ─────────────────────────────────────────────────

  /**
   * Find a random grid position that does not overlap any snake segment
   * or any excluded cell (portal cells, etc.).
   *
   * Strategy: collect all free cells and pick one at random.
   * If the grid is completely full (snake fills every cell), falls back to
   * (0, 0) — in practice this should never happen in normal gameplay.
   */
  findSafePosition(snake: Snake): GridPos {
    const freeCells: GridPos[] = [];

    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        const pos: GridPos = { col, row };
        if (snake.isOnSnake(pos)) {
          continue;
        }
        if (this.exclusionCheckers.some((check) => check(pos))) {
          continue;
        }
        freeCells.push(pos);
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
  respawn(snake: Snake): void {
    this.position = this.findSafePosition(snake);
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
   * @returns `true` if the food was eaten this call.
   */
  checkEat(
    snake: Snake,
    onScore: (points: number) => void,
  ): boolean {
    if (!gridEquals(snake.getHeadPosition(), this.position)) {
      return false;
    }

    // Trigger snake growth
    snake.grow(GROWTH_PER_FOOD);

    // Notify score callback
    onScore(POINTS_PER_FOOD);

    // Respawn at a new safe location
    this.respawn(snake);

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
