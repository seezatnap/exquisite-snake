import type { EchoGhost } from "../entities/EchoGhost";
import { gridToPixel } from "../utils/grid";

// ── Types ────────────────────────────────────────────────────────

/**
 * A pending ghost-food burst event.
 * Records the tick at which food was eaten so the burst can fire
 * when the ghost replays that same tick (exactly 5 seconds later).
 */
export interface PendingBurst {
  /** The tick at which the real snake ate food. */
  readonly eatTick: number;
}

/**
 * Result of processing a burst — the pixel position where
 * the cosmetic particle effect should be emitted.
 */
export interface BurstResult {
  /** World X coordinate (pixel center of ghost head at the delayed tick). */
  readonly x: number;
  /** World Y coordinate (pixel center of ghost head at the delayed tick). */
  readonly y: number;
}

// ── GhostFoodScheduler ──────────────────────────────────────────

/**
 * Tracks food-eat events and fires cosmetic particle bursts at the
 * ghost's corresponding position exactly `delayInTicks` ticks later.
 *
 * This system is purely data-driven — it computes *when* and *where*
 * bursts should happen but does not own any rendering. The caller
 * (MainScene) is responsible for calling `emitFoodParticles` with
 * the returned coordinates.
 */
export class GhostFoodScheduler {
  /** Queue of pending bursts, ordered by eatTick (oldest first). */
  private pending: PendingBurst[] = [];

  /**
   * Schedule a burst to fire when the ghost replays `currentTick`.
   *
   * Call this immediately when the real snake eats food.
   * The burst will fire `delayInTicks` ticks later, when the ghost
   * reaches this tick in its replay.
   *
   * @param eatTick  The ghost's currentTick at the moment food was eaten.
   */
  schedule(eatTick: number): void {
    this.pending.push({ eatTick });
  }

  /**
   * Check whether any pending bursts should fire on this tick.
   *
   * Call this once per game tick, after recording the snake into
   * the ghost buffer. Returns an array of `BurstResult` positions
   * (usually 0 or 1 per tick, but may return more if multiple
   * food events map to the same ghost replay tick).
   *
   * Fired bursts are removed from the queue.
   *
   * @param ghost  The echo ghost entity (used to read the delayed
   *               frame and determine the ghost's head position).
   */
  processTick(ghost: EchoGhost): BurstResult[] {
    if (this.pending.length === 0) return [];

    const frame = ghost.getGhostFrame();
    if (frame === null) return [];

    const replayTick = frame.tick;
    const results: BurstResult[] = [];

    // Drain all pending bursts whose eatTick matches the current replay tick.
    // pending is ordered by eatTick, so we can stop early once we pass replayTick.
    while (this.pending.length > 0) {
      const head = this.pending[0];
      if (head.eatTick < replayTick) {
        // Missed burst (should not happen in practice) — discard
        this.pending.shift();
      } else if (head.eatTick === replayTick) {
        this.pending.shift();
        // Use the ghost's head position at this delayed frame
        const ghostHead = frame.segments[0];
        if (ghostHead) {
          const px = gridToPixel(ghostHead);
          results.push({ x: px.x, y: px.y });
        }
      } else {
        // head.eatTick > replayTick — not yet time
        break;
      }
    }

    return results;
  }

  /** Number of pending (not yet fired) bursts. */
  getPendingCount(): number {
    return this.pending.length;
  }

  /** Clear all pending bursts (e.g. on game reset). */
  reset(): void {
    this.pending = [];
  }
}
