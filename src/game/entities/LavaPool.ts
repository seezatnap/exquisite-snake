import Phaser from "phaser";
import { TEXTURE_KEYS, DEPTH } from "../config";
import { type GridPos, gridToPixel, gridEquals } from "../utils/grid";
import type { Snake } from "./Snake";
import {
  LAVA_MAX_POOLS,
  LAVA_SPAWN_INTERVAL_MS,
  type BiomeRng,
  collectFreeCells,
  pickRandomCell,
} from "../systems/BiomeMechanics";

// Re-export shared constants so existing consumers don't break.
export {
  LAVA_BURN_SEGMENTS,
  LAVA_SURVIVAL_THRESHOLD,
  LAVA_MAX_POOLS,
  LAVA_SPAWN_INTERVAL_MS,
} from "../systems/BiomeMechanics";

// ── Lava pool visual configuration ──────────────────────────────

/** Period of the lava pool pulsing glow animation in ms. */
export const LAVA_PULSE_PERIOD_MS = 1_200;

/** Minimum alpha during the pulse cycle. */
export const LAVA_PULSE_ALPHA_MIN = 0.6;

/** Maximum alpha during the pulse cycle. */
export const LAVA_PULSE_ALPHA_MAX = 1.0;

/** Minimum scale during the pulse cycle. */
export const LAVA_PULSE_SCALE_MIN = 0.85;

/** Maximum scale during the pulse cycle. */
export const LAVA_PULSE_SCALE_MAX = 1.05;

// ── Single pool representation ──────────────────────────────────

interface Pool {
  pos: GridPos;
  sprite: Phaser.GameObjects.Sprite;
  /** Age of this pool in ms (used for pulsing animation phase). */
  age: number;
}

// ── LavaPoolManager ─────────────────────────────────────────────

/**
 * Manages lava pool hazards for the Molten Core biome.
 *
 * - Pools spawn randomly on empty cells at a tunable interval.
 * - The number of active pools is capped.
 * - When the snake head enters a pool cell, 3 tail segments are burned
 *   off (or the snake is killed if it's too short).
 * - All pools are removed when the biome changes away from Molten Core.
 */
export class LavaPoolManager {
  private pools: Pool[] = [];
  private spawnTimer = 0;
  private scene: Phaser.Scene;
  private rng: BiomeRng;
  private maxPools: number;
  private spawnInterval: number;

  constructor(
    scene: Phaser.Scene,
    rng?: BiomeRng,
    maxPools: number = LAVA_MAX_POOLS,
    spawnInterval: number = LAVA_SPAWN_INTERVAL_MS,
  ) {
    this.scene = scene;
    this.rng = rng ?? Math.random;
    this.maxPools = maxPools;
    this.spawnInterval = spawnInterval;
  }

  // ── Update / spawn logic ──────────────────────────────────────

  /**
   * Advance the spawn timer by `deltaMs`. Spawns a new pool when the timer
   * elapses, provided the pool cap hasn't been reached. Also advances
   * the pulsing glow animation on all active pools.
   *
   * @param deltaMs - Frame delta in milliseconds
   * @param snake   - Snake entity (used to avoid spawning on occupied cells)
   * @param food    - Current food position (used to avoid spawning on food)
   */
  update(deltaMs: number, snake: Snake, foodPos: GridPos): void {
    this.spawnTimer += deltaMs;

    if (this.spawnTimer >= this.spawnInterval) {
      this.spawnTimer -= this.spawnInterval;
      if (this.pools.length < this.maxPools) {
        this.spawnPool(snake, foodPos);
      }
    }

    // Animate pool pulsing glow
    for (const pool of this.pools) {
      pool.age += deltaMs;
      const t =
        (Math.sin((pool.age / LAVA_PULSE_PERIOD_MS) * Math.PI * 2) + 1) / 2;
      const alpha =
        LAVA_PULSE_ALPHA_MIN + t * (LAVA_PULSE_ALPHA_MAX - LAVA_PULSE_ALPHA_MIN);
      const scale =
        LAVA_PULSE_SCALE_MIN + t * (LAVA_PULSE_SCALE_MAX - LAVA_PULSE_SCALE_MIN);
      pool.sprite.setAlpha(alpha);
      pool.sprite.setScale(scale);
    }
  }

  /**
   * Spawn a single lava pool on a random empty cell.
   * A cell is "empty" if it's not occupied by the snake, food, or another pool.
   *
   * Uses the shared `collectFreeCells` and `pickRandomCell` utilities from
   * BiomeMechanics for deterministic, testable placement.
   */
  private spawnPool(snake: Snake, foodPos: GridPos): void {
    const freeCells = collectFreeCells([
      (p) => snake.isOnSnake(p),
      (p) => gridEquals(p, foodPos),
      (p) => this.isLavaAt(p),
    ]);

    const cell = pickRandomCell(freeCells, this.rng);
    if (!cell) return; // Grid full — skip

    const px = gridToPixel(cell);
    const sprite = this.scene.add.sprite(px.x, px.y, TEXTURE_KEYS.LAVA_POOL);
    sprite.setDepth(DEPTH.MECHANIC_VISUALS);

    this.pools.push({ pos: cell, sprite, age: 0 });
  }

  // ── Collision detection ───────────────────────────────────────

  /**
   * Check whether the snake head is on any lava pool.
   *
   * @returns The pool position if hit, or `null` if no collision.
   */
  checkCollision(snake: Snake): GridPos | null {
    const head = snake.getHeadPosition();
    for (const pool of this.pools) {
      if (gridEquals(head, pool.pos)) {
        return { ...pool.pos };
      }
    }
    return null;
  }

  /**
   * Check if a specific grid position has a lava pool.
   */
  isLavaAt(pos: GridPos): boolean {
    return this.pools.some((p) => gridEquals(p.pos, pos));
  }

  // ── Pool removal ──────────────────────────────────────────────

  /**
   * Remove a specific pool at the given position (e.g. after being hit).
   */
  removeAt(pos: GridPos): void {
    const index = this.pools.findIndex((p) => gridEquals(p.pos, pos));
    if (index !== -1) {
      this.pools[index].sprite.destroy();
      this.pools.splice(index, 1);
    }
  }

  /**
   * Remove all pools and reset the spawn timer.
   * Call this when the biome changes away from Molten Core.
   */
  clearAll(): void {
    for (const pool of this.pools) {
      pool.sprite.destroy();
    }
    this.pools = [];
    this.spawnTimer = 0;
  }

  // ── State queries ─────────────────────────────────────────────

  /** Get the number of active pools. */
  getPoolCount(): number {
    return this.pools.length;
  }

  /** Get a copy of all pool positions. */
  getPoolPositions(): GridPos[] {
    return this.pools.map((p) => ({ ...p.pos }));
  }

  /** Get the max pool cap. */
  getMaxPools(): number {
    return this.maxPools;
  }

  /** Get the spawn interval in ms. */
  getSpawnInterval(): number {
    return this.spawnInterval;
  }

  // ── Cleanup ───────────────────────────────────────────────────

  /** Destroy all pool sprites and reset state. */
  destroy(): void {
    this.clearAll();
  }
}
