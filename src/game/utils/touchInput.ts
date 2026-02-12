import type { Direction } from "./grid";

// ── Touch-input configuration ─────────────────────────────────────

/** Minimum swipe distance in pixels to register as a direction change. */
export const SWIPE_THRESHOLD_PX = 30;

/** Minimum ms between accepted swipe inputs (debounce). */
export const SWIPE_DEBOUNCE_MS = 80;

// ── Touch-input controller ────────────────────────────────────────

/**
 * Detects swipe gestures on a target element and converts them to
 * cardinal `Direction` values. The consumer provides a callback
 * (typically `snake.bufferDirection`) so touch input feeds into the
 * same buffered direction-input system as keyboard controls.
 *
 * Supports both single-swipe (touchstart → touchend) and continuous
 * drag (touchstart → touchmove with sufficient delta). The latter
 * allows the player to hold a finger and steer by dragging.
 */
export class TouchInput {
  /** Element we're listening on. */
  private target: HTMLElement | null = null;

  /** Direction callback (e.g. `snake.bufferDirection`). */
  private onDirection: ((dir: Direction) => void) | null = null;

  /** Touch start coordinates. */
  private startX = 0;
  private startY = 0;

  /** Timestamp of the last accepted swipe (for debounce). */
  private lastSwipeTime = 0;

  /** Minimum swipe distance (px). */
  private threshold: number;

  /** Minimum gap between accepted swipes (ms). */
  private debounceMs: number;

  /** Whether the current touch has already triggered a direction via move. */
  private moveTriggered = false;

  // Bound event handlers (for clean removal)
  private boundTouchStart: (e: TouchEvent) => void;
  private boundTouchMove: (e: TouchEvent) => void;
  private boundTouchEnd: (e: TouchEvent) => void;

  constructor(
    threshold: number = SWIPE_THRESHOLD_PX,
    debounceMs: number = SWIPE_DEBOUNCE_MS,
  ) {
    this.threshold = threshold;
    this.debounceMs = debounceMs;

    // Pre-bind handlers
    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundTouchMove = this.handleTouchMove.bind(this);
    this.boundTouchEnd = this.handleTouchEnd.bind(this);
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Attach touch listeners to `target` and route swipe directions
   * to `onDirection`.
   */
  attach(target: HTMLElement, onDirection: (dir: Direction) => void): void {
    this.detach(); // remove any previous listeners

    this.target = target;
    this.onDirection = onDirection;

    target.addEventListener("touchstart", this.boundTouchStart, {
      passive: false,
    });
    target.addEventListener("touchmove", this.boundTouchMove, {
      passive: false,
    });
    target.addEventListener("touchend", this.boundTouchEnd, {
      passive: false,
    });
  }

  /** Remove all touch listeners. */
  detach(): void {
    if (this.target) {
      this.target.removeEventListener("touchstart", this.boundTouchStart);
      this.target.removeEventListener("touchmove", this.boundTouchMove);
      this.target.removeEventListener("touchend", this.boundTouchEnd);
      this.target = null;
    }
    this.onDirection = null;
  }

  // ── Internal handlers ───────────────────────────────────────────

  private handleTouchStart(e: TouchEvent): void {
    // Prevent default to avoid scroll/zoom on the game canvas
    e.preventDefault();

    const touch = e.touches[0];
    if (!touch) return;

    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.moveTriggered = false;
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();

    const touch = e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - this.startX;
    const dy = touch.clientY - this.startY;

    const dir = this.resolveDirection(dx, dy);
    if (dir) {
      this.emitDirection(dir);
      // Reset start point so the player can chain directions during a drag
      this.startX = touch.clientX;
      this.startY = touch.clientY;
      this.moveTriggered = true;
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    e.preventDefault();

    // If a direction was already triggered via move, skip the end event
    if (this.moveTriggered) return;

    const touch = e.changedTouches[0];
    if (!touch) return;

    const dx = touch.clientX - this.startX;
    const dy = touch.clientY - this.startY;

    const dir = this.resolveDirection(dx, dy);
    if (dir) {
      this.emitDirection(dir);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────

  /**
   * Determine the cardinal direction from a delta vector.
   * Returns `null` if the distance is below the threshold.
   */
  resolveDirection(dx: number, dy: number): Direction | null {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // Must exceed threshold on the dominant axis
    if (Math.max(absDx, absDy) < this.threshold) return null;

    if (absDx >= absDy) {
      return dx > 0 ? "right" : "left";
    } else {
      return dy > 0 ? "down" : "up";
    }
  }

  /**
   * Emit a direction if the debounce window has passed.
   */
  private emitDirection(dir: Direction): void {
    const now = performance.now();
    if (now - this.lastSwipeTime < this.debounceMs) return;

    this.lastSwipeTime = now;
    this.onDirection?.(dir);
  }

  // ── Test helpers ────────────────────────────────────────────────

  /** @internal Expose for testing: get threshold. */
  getThreshold(): number {
    return this.threshold;
  }

  /** @internal Expose for testing: get debounce. */
  getDebounceMs(): number {
    return this.debounceMs;
  }
}
