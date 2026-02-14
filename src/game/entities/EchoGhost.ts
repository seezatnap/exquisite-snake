import { type GridPos, gridEquals, DEFAULT_MOVE_INTERVAL_MS } from "../utils/grid";

// ── Types ─────────────────────────────────────────────────────────

/** A snapshot of the snake's full segment list at one tick. */
export interface PathSnapshot {
  segments: GridPos[];
}

/** Read-only view into the ghost's state for external queries. */
export interface EchoGhostState {
  /** Whether the ghost is currently replaying and visible. */
  readonly active: boolean;
  /** Current ghost segments (empty when inactive). */
  readonly segments: readonly GridPos[];
  /** Opacity multiplier [0, 1] — fades toward 0 as the buffer runs out. */
  readonly opacity: number;
}

/**
 * Snapshot/restore payload for rewind support (Phase 6 hook).
 * Captures the full internal state of the echo ghost so it can be
 * rewound and replayed deterministically.
 */
export interface EchoGhostBufferSnapshot {
  buffer: PathSnapshot[];
  head: number;
  count: number;
  writeIndex: number;
  readIndex: number;
  active: boolean;
  opacity: number;
  currentSegments: GridPos[];
  ticksSinceStart: number;
}

// ── Constants ─────────────────────────────────────────────────────

/** Default echo replay delay in milliseconds. */
export const ECHO_DELAY_MS = 5_000;

/**
 * Maximum number of snapshots stored in the circular buffer.
 *
 * Calculated as `ECHO_DELAY_MS / DEFAULT_MOVE_INTERVAL_MS` plus a small
 * margin to account for any timing jitter. The ghost only needs to store
 * enough history to bridge the 5-second delay, so once playback starts
 * it consumes entries and the buffer never grows beyond this limit.
 */
export const DEFAULT_BUFFER_CAPACITY =
  Math.ceil(ECHO_DELAY_MS / DEFAULT_MOVE_INTERVAL_MS) + 10; // 50

/** Number of ticks worth of fade-out at the end of playback. */
const FADE_OUT_TICKS = 8;

// ── EchoGhost ─────────────────────────────────────────────────────

/**
 * Records the snake's path each game tick into a bounded circular buffer
 * and replays the path as a delayed ghost trail.
 *
 * Lifecycle:
 * 1. Each time the snake steps, call `record(segments)` to push a snapshot.
 * 2. After `delayTicks` recordings the ghost activates and begins replaying
 *    the buffered history in FIFO order, one snapshot per tick.
 * 3. When the playback cursor catches the write cursor (buffer exhausted)
 *    the ghost fades out and stops automatically — it never grows
 *    indefinitely.
 *
 * The class is deliberately rendering-agnostic: it stores logical grid
 * positions only. Rendering (dashed outline, opacity, particles, biome
 * tinting) is handled externally by reading `getState()`.
 */
export class EchoGhost {
  // ── Circular buffer ───────────────────────────────────────────

  /** Fixed-size ring buffer of path snapshots. */
  private buffer: (PathSnapshot | null)[];

  /** Physical capacity of the ring buffer. */
  private capacity: number;

  /** Write pointer — next position to write into (wraps). */
  private writeIndex = 0;

  /** Read pointer — next position to read for playback (wraps). */
  private readIndex = 0;

  /** Number of live (unread) entries in the buffer. */
  private count = 0;

  // ── Playback state ────────────────────────────────────────────

  /** Delay expressed as a number of snake ticks. */
  private delayTicks: number;

  /** Total ticks recorded since last reset (used to trigger activation). */
  private ticksSinceStart = 0;

  /** Whether the ghost is actively replaying. */
  private _active = false;

  /** Current ghost segments being displayed. */
  private currentSegments: GridPos[] = [];

  /** Current opacity [0, 1]. */
  private _opacity = 0;

  // ── Constructor ───────────────────────────────────────────────

  /**
   * @param delayMs    Replay delay in milliseconds (default 5 000).
   * @param tickMs     Duration of a single snake tick in milliseconds
   *                   (default 125 — must match `MoveTicker` interval).
   * @param bufferCap  Maximum capacity of the circular buffer. Defaults
   *                   to `DEFAULT_BUFFER_CAPACITY`.
   */
  constructor(
    delayMs: number = ECHO_DELAY_MS,
    tickMs: number = DEFAULT_MOVE_INTERVAL_MS,
    bufferCap: number = DEFAULT_BUFFER_CAPACITY,
  ) {
    this.capacity = Math.max(1, bufferCap);
    this.buffer = new Array<PathSnapshot | null>(this.capacity).fill(null);
    this.delayTicks = Math.max(1, Math.round(delayMs / tickMs));
  }

  // ── Recording ─────────────────────────────────────────────────

  /**
   * Record the snake's current segments.
   *
   * Call this exactly once per snake grid-step (i.e. when
   * `snake.update(delta)` returns `true`).
   */
  record(segments: readonly GridPos[]): void {
    const snapshot: PathSnapshot = {
      segments: segments.map((s) => ({ col: s.col, row: s.row })),
    };

    // Write into the ring buffer
    this.buffer[this.writeIndex] = snapshot;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;

    if (this.count < this.capacity) {
      this.count++;
    } else {
      // Overwrite oldest — advance read pointer so it stays valid
      this.readIndex = (this.readIndex + 1) % this.capacity;
    }

    this.ticksSinceStart++;

    // Activate playback once we've accumulated enough delay
    if (!this._active && this.ticksSinceStart >= this.delayTicks) {
      this._active = true;
      this._opacity = 1;
    }

    // If active, advance the playback head by consuming one entry
    if (this._active) {
      this.advancePlayback();
    }
  }

  // ── Playback ──────────────────────────────────────────────────

  /**
   * Consume the next snapshot from the buffer for ghost display.
   *
   * When the buffer is nearly exhausted the opacity ramps down over
   * `FADE_OUT_TICKS` before the ghost deactivates entirely.
   */
  private advancePlayback(): void {
    if (this.count === 0) {
      // Buffer fully consumed — deactivate
      this._active = false;
      this._opacity = 0;
      this.currentSegments = [];
      return;
    }

    const entry = this.buffer[this.readIndex];
    if (entry) {
      this.currentSegments = entry.segments;
    }

    this.buffer[this.readIndex] = null;
    this.readIndex = (this.readIndex + 1) % this.capacity;
    this.count--;

    // Fade out as buffer approaches empty.
    // Use (count + 1) so the last consumed entry still renders at non-zero
    // opacity; deactivation happens on the *next* call when count is 0.
    const remaining = this.count + 1;
    if (remaining <= FADE_OUT_TICKS) {
      this._opacity = remaining / FADE_OUT_TICKS;
    } else {
      this._opacity = 1;
    }
  }

  // ── Public API ────────────────────────────────────────────────

  /** Whether the ghost trail is currently visible and replaying. */
  get active(): boolean {
    return this._active;
  }

  /** Current opacity multiplier [0, 1]. */
  get opacity(): number {
    return this._opacity;
  }

  /** Current ghost segments (empty when inactive). */
  getSegments(): readonly GridPos[] {
    return this.currentSegments;
  }

  /** Full read-only state for rendering / collision queries. */
  getState(): EchoGhostState {
    return {
      active: this._active,
      segments: this.currentSegments,
      opacity: this._opacity,
    };
  }

  /**
   * Check if a grid position overlaps any ghost segment.
   * Returns `false` when the ghost is inactive.
   */
  isOnGhost(pos: GridPos): boolean {
    if (!this._active) return false;
    for (const seg of this.currentSegments) {
      if (gridEquals(pos, seg)) return true;
    }
    return false;
  }

  /** Number of unread snapshots remaining in the buffer. */
  getBufferedCount(): number {
    return this.count;
  }

  /** Physical capacity of the circular buffer. */
  getCapacity(): number {
    return this.capacity;
  }

  /** Number of ticks until the ghost activates (0 once active). */
  getTicksUntilActive(): number {
    if (this._active) return 0;
    return Math.max(0, this.delayTicks - this.ticksSinceStart);
  }

  // ── Rewind support (Phase 6 hook) ─────────────────────────────

  /** Capture the complete internal state for deterministic replay/rewind. */
  snapshot(): EchoGhostBufferSnapshot {
    return {
      buffer: this.buffer.map((entry) =>
        entry
          ? { segments: entry.segments.map((s) => ({ ...s })) }
          : { segments: [] },
      ),
      head: this.writeIndex,
      count: this.count,
      writeIndex: this.writeIndex,
      readIndex: this.readIndex,
      active: this._active,
      opacity: this._opacity,
      currentSegments: this.currentSegments.map((s) => ({ ...s })),
      ticksSinceStart: this.ticksSinceStart,
    };
  }

  /** Restore internal state from a previously captured snapshot. */
  restore(snap: EchoGhostBufferSnapshot): void {
    this.capacity = snap.buffer.length;
    this.buffer = snap.buffer.map((entry) =>
      entry.segments.length > 0
        ? { segments: entry.segments.map((s) => ({ ...s })) }
        : null,
    );
    this.writeIndex = snap.writeIndex;
    this.readIndex = snap.readIndex;
    this.count = snap.count;
    this._active = snap.active;
    this._opacity = snap.opacity;
    this.currentSegments = snap.currentSegments.map((s) => ({ ...s }));
    this.ticksSinceStart = snap.ticksSinceStart;
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  /** Reset all state (e.g. on game restart). */
  reset(): void {
    this.buffer = new Array<PathSnapshot | null>(this.capacity).fill(null);
    this.writeIndex = 0;
    this.readIndex = 0;
    this.count = 0;
    this.ticksSinceStart = 0;
    this._active = false;
    this._opacity = 0;
    this.currentSegments = [];
  }
}
