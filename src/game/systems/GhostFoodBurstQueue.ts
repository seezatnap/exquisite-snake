import { type GridPos, gridToPixel, DEFAULT_MOVE_INTERVAL_MS } from "../utils/grid";
import { ECHO_DELAY_MS } from "../entities/EchoGhost";
import type { EchoGhost } from "../entities/EchoGhost";

// ── Constants ─────────────────────────────────────────────────────

/** Number of ticks to delay the ghost-food burst (matches EchoGhost delay). */
export const GHOST_FOOD_BURST_DELAY_TICKS = Math.round(
  ECHO_DELAY_MS / DEFAULT_MOVE_INTERVAL_MS,
);

// ── Types ─────────────────────────────────────────────────────────

/** A pending ghost-food burst waiting to fire. */
interface PendingBurst {
  /** The tick count at which this burst should fire. */
  fireTick: number;
}

/** Result of processing the queue: pixel positions where bursts should emit. */
export interface GhostFoodBurstResult {
  x: number;
  y: number;
}

// ── GhostFoodBurstQueue ──────────────────────────────────────────

/**
 * Queues cosmetic particle bursts that fire at the echo ghost's position
 * exactly 5 seconds after the real snake eats food.
 *
 * When the snake eats food, call `enqueue()` to record the current tick.
 * Each tick, call `processTick()` to check for any due bursts and return
 * the pixel positions where particle effects should be emitted.
 *
 * If the ghost is inactive or has no segments when a burst is due, the
 * burst is silently dropped (the history sample is unavailable).
 */
export class GhostFoodBurstQueue {
  private queue: PendingBurst[] = [];
  private currentTick = 0;
  private delayTicks: number;

  constructor(delayTicks: number = GHOST_FOOD_BURST_DELAY_TICKS) {
    this.delayTicks = Math.max(1, delayTicks);
  }

  /**
   * Queue a ghost-food burst to fire `delayTicks` ticks from now.
   * Call this when the real snake eats food.
   */
  enqueue(): void {
    this.queue.push({ fireTick: this.currentTick + this.delayTicks });
  }

  /**
   * Advance the tick counter and check for any due bursts.
   *
   * @param ghost  The current EchoGhost instance (may be null if destroyed).
   * @returns An array of pixel positions where burst particles should emit.
   *          Empty if no bursts are due or the ghost has no valid position.
   */
  processTick(ghost: EchoGhost | null): GhostFoodBurstResult[] {
    this.currentTick++;
    const results: GhostFoodBurstResult[] = [];

    // Process all bursts whose fire tick has arrived
    let i = 0;
    while (i < this.queue.length) {
      if (this.queue[i].fireTick <= this.currentTick) {
        this.queue.splice(i, 1);

        // Resolve the ghost's current head position for the burst
        const pos = this.resolveGhostPosition(ghost);
        if (pos) {
          const pixel = gridToPixel(pos);
          results.push({ x: pixel.x, y: pixel.y });
        }
        // If pos is null, the burst is silently dropped (unavailable sample)
      } else {
        i++;
      }
    }

    return results;
  }

  /**
   * Resolve the ghost's current head position for a burst.
   * Returns null if the ghost is inactive or has no segments.
   */
  private resolveGhostPosition(ghost: EchoGhost | null): GridPos | null {
    if (!ghost) return null;

    const state = ghost.getState();
    if (!state.active || state.segments.length === 0) return null;

    return { col: state.segments[0].col, row: state.segments[0].row };
  }

  /** Number of pending bursts in the queue. */
  getPendingCount(): number {
    return this.queue.length;
  }

  /** Current internal tick counter. */
  getCurrentTick(): number {
    return this.currentTick;
  }

  /** The delay in ticks for bursts. */
  getDelayTicks(): number {
    return this.delayTicks;
  }

  /** Reset all state (e.g. on game restart). */
  reset(): void {
    this.queue = [];
    this.currentTick = 0;
  }
}
