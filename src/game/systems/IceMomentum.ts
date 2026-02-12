import type { Direction } from "../utils/grid";

// ── Constants ────────────────────────────────────────────────────

/** Number of extra tiles the snake slides in the old direction before turning. */
export const ICE_SLIDE_TILES = 2;

// ── IceMomentum ─────────────────────────────────────────────────

/**
 * Tracks Ice Cavern momentum state for a single snake.
 *
 * When the player inputs a turn while Ice Cavern is active, the snake
 * continues moving in the old direction for `ICE_SLIDE_TILES` extra
 * grid steps before committing to the new direction.
 *
 * The system works by intercepting each step and deciding whether to
 * use the buffered direction or continue the slide.
 */
export class IceMomentum {
  /** Whether ice momentum is currently enabled (Ice Cavern biome is active). */
  private enabled = false;

  /** Remaining slide tiles before the queued turn is applied. */
  private remaining = 0;

  /** The new direction the player requested (held until slide completes). */
  private pendingDirection: Direction | null = null;

  /** Enable or disable ice momentum (called on biome transitions). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      // When leaving Ice Cavern, cancel any active slide immediately
      this.remaining = 0;
      this.pendingDirection = null;
    }
  }

  /** Whether ice momentum is currently active. */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Whether a slide is currently in progress. */
  isSliding(): boolean {
    return this.remaining > 0;
  }

  /** Number of slide tiles remaining. */
  getRemaining(): number {
    return this.remaining;
  }

  /** The pending direction waiting to be applied after the slide. */
  getPendingDirection(): Direction | null {
    return this.pendingDirection;
  }

  /**
   * Called when the snake has a buffered direction change to apply.
   * If ice is enabled, starts a slide (delays the direction change).
   *
   * @param newDir - The direction the player wants to turn to
   * @returns `true` if the direction was captured and the snake should
   *          NOT change direction yet (slide in progress), `false` if
   *          ice is disabled and the direction should be applied normally.
   */
  beginSlide(newDir: Direction): boolean {
    if (!this.enabled) return false;

    // The step that calls beginSlide already moves in the old direction,
    // counting as the first extra tile. So we only need ICE_SLIDE_TILES - 1
    // more slides from advanceSlide().
    // If already sliding, replace the pending direction with the newest input.
    this.remaining = ICE_SLIDE_TILES - 1;
    this.pendingDirection = newDir;
    return true;
  }

  /**
   * Called each grid step while a slide is active.
   * Decrements the remaining counter.
   *
   * @returns The direction the snake should turn to if the slide just
   *          completed, or `null` if the slide is still in progress.
   */
  advanceSlide(): Direction | null {
    if (this.remaining <= 0) return null;

    this.remaining--;

    if (this.remaining === 0) {
      const dir = this.pendingDirection;
      this.pendingDirection = null;
      return dir;
    }

    return null;
  }

  /** Reset all momentum state (e.g. on game restart). */
  reset(): void {
    this.remaining = 0;
    this.pendingDirection = null;
    // Note: `enabled` is not reset here — it's controlled by the biome
  }
}
