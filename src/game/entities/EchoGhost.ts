import { type GridPos, gridEquals, DEFAULT_MOVE_INTERVAL_MS } from "../utils/grid";

// ── Constants ────────────────────────────────────────────────────

/** Default replay delay in milliseconds. */
const DEFAULT_REPLAY_DELAY_MS = 5_000;

// ── Types ────────────────────────────────────────────────────────

/** A snapshot of the snake's segment positions at a single tick. */
export interface SnakeSnapshot {
  /** All segment positions at this tick (head first). */
  segments: readonly GridPos[];
}

/** Read-only interface for rewinding the ghost buffer (Phase 6 hook). */
export interface RewindableBuffer {
  /** Take a snapshot of the buffer state for later restoration. */
  snapshot(): BufferSnapshot;
  /** Restore a previously taken snapshot. */
  restore(snapshot: BufferSnapshot): void;
}

/** Opaque snapshot of the circular buffer's internal state. */
export interface BufferSnapshot {
  readonly _brand: "BufferSnapshot";
  readonly data: SnakeSnapshot[];
  readonly head: number;
  readonly count: number;
  readonly readIndex: number;
}

// ── CircularBuffer ───────────────────────────────────────────────

/**
 * Fixed-size circular buffer for storing snake snapshots.
 *
 * Writes always succeed — when the buffer is full, the oldest entry
 * is silently overwritten. Reads advance a separate cursor that
 * trails the write head by a configurable delay (in number of ticks).
 */
export class CircularBuffer<T> {
  private readonly data: (T | undefined)[];
  private head = 0;   // next write index
  private _count = 0; // number of items written (capped at capacity)

  constructor(private readonly capacity: number) {
    this.data = new Array<T | undefined>(capacity);
  }

  /** Number of entries currently stored. */
  get count(): number {
    return this._count;
  }

  /** Maximum number of entries the buffer can hold. */
  get size(): number {
    return this.capacity;
  }

  /** Write a value to the buffer, overwriting the oldest entry if full. */
  write(value: T): void {
    this.data[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this._count < this.capacity) {
      this._count++;
    }
  }

  /**
   * Read the entry at `index` positions behind the most recent write.
   * Index 0 = the entry written `delayTicks` ticks ago (oldest readable).
   *
   * Returns `undefined` if the index is out of range.
   */
  read(delayTicks: number, index: number): T | undefined {
    if (index < 0 || index >= this._count - delayTicks) {
      return undefined;
    }
    // The oldest item in the buffer
    const oldestIndex =
      this._count < this.capacity ? 0 : this.head;
    const actualIndex = (oldestIndex + index) % this.capacity;
    return this.data[actualIndex];
  }

  /**
   * Number of entries available for reading with the given delay.
   * This is the count of entries that have "aged" past the delay window.
   */
  readableCount(delayTicks: number): number {
    return Math.max(0, this._count - delayTicks);
  }

  /** Reset the buffer, clearing all entries. */
  reset(): void {
    this.head = 0;
    this._count = 0;
    this.data.fill(undefined);
  }

  /** Create an opaque state snapshot for rewind support. */
  toSnapshot(): { data: T[]; head: number; count: number } {
    return {
      data: this.data.filter((v): v is T => v !== undefined),
      head: this.head,
      count: this._count,
    };
  }

  /** Restore from a previously taken snapshot. */
  fromSnapshot(snap: { data: T[]; head: number; count: number }): void {
    this.data.fill(undefined);
    for (let i = 0; i < snap.data.length; i++) {
      this.data[i] = snap.data[i];
    }
    this.head = snap.head;
    this._count = snap.count;
  }
}

// ── EchoGhost Entity ─────────────────────────────────────────────

/**
 * Records the snake's path each game tick and replays it as a
 * "ghost" trail after a configurable delay (default 5 seconds).
 *
 * The entity is purely logical — it stores positions and exposes
 * deterministic read/write APIs. Rendering and collision detection
 * are handled by other systems that consume the ghost trail.
 */
export class EchoGhost implements RewindableBuffer {
  private readonly buffer: CircularBuffer<SnakeSnapshot>;
  private readonly delayTicks: number;
  private ticksWritten = 0;

  /**
   * @param tickIntervalMs  How often the game ticks (ms). Defaults to
   *                        `DEFAULT_MOVE_INTERVAL_MS` (125 ms).
   * @param replayDelayMs   How long to wait before the ghost starts
   *                        replaying (ms). Defaults to 5 000 ms.
   * @param bufferCapacity  Override the buffer size. By default it is
   *                        computed as `2 × delayTicks` to hold enough
   *                        history for the replay window plus a margin
   *                        for the active trail.
   */
  constructor(
    tickIntervalMs: number = DEFAULT_MOVE_INTERVAL_MS,
    replayDelayMs: number = DEFAULT_REPLAY_DELAY_MS,
    bufferCapacity?: number,
  ) {
    this.delayTicks = Math.ceil(replayDelayMs / tickIntervalMs);
    const capacity = bufferCapacity ?? this.delayTicks * 2;
    this.buffer = new CircularBuffer<SnakeSnapshot>(capacity);
  }

  // ── Configuration queries ───────────────────────────────────────

  /** Number of ticks the ghost trails behind the live snake. */
  getDelayTicks(): number {
    return this.delayTicks;
  }

  /** Total number of ticks recorded so far. */
  getTotalTicksWritten(): number {
    return this.ticksWritten;
  }

  /** Maximum entries the buffer can hold. */
  getBufferCapacity(): number {
    return this.buffer.size;
  }

  // ── Write API ───────────────────────────────────────────────────

  /**
   * Record the snake's current position. Call once per game tick.
   *
   * Segments are defensively copied so the caller can freely mutate
   * its array afterward.
   */
  recordTick(segments: readonly GridPos[]): void {
    const snapshot: SnakeSnapshot = {
      segments: segments.map((s) => ({ col: s.col, row: s.row })),
    };
    this.buffer.write(snapshot);
    this.ticksWritten++;
  }

  // ── Read API ────────────────────────────────────────────────────

  /**
   * Whether the ghost has accumulated enough ticks to begin replaying.
   */
  isActive(): boolean {
    return this.ticksWritten >= this.delayTicks;
  }

  /**
   * Retrieve the ghost trail — the sequence of snapshots that are at
   * least `delayTicks` old.
   *
   * Returns an empty array if the ghost hasn't started yet (fewer than
   * `delayTicks` ticks have been recorded).
   *
   * The returned array is ordered oldest-first. Each entry contains
   * the full set of snake segments at that historical tick.
   */
  getGhostTrail(): readonly SnakeSnapshot[] {
    const readable = this.buffer.readableCount(this.delayTicks);
    if (readable <= 0) return [];

    const trail: SnakeSnapshot[] = [];
    for (let i = 0; i < readable; i++) {
      const snap = this.buffer.read(this.delayTicks, i);
      if (snap) trail.push(snap);
    }
    return trail;
  }

  /**
   * Get the single snapshot that represents the ghost's "current"
   * position — the most recent entry that is at least `delayTicks` old.
   *
   * Returns `undefined` if the ghost hasn't started replaying yet.
   */
  getGhostHead(): SnakeSnapshot | undefined {
    const readable = this.buffer.readableCount(this.delayTicks);
    if (readable <= 0) return undefined;
    return this.buffer.read(this.delayTicks, readable - 1);
  }

  /**
   * Check whether any segment of the ghost's current position
   * overlaps the given grid position.
   */
  isOnGhost(pos: GridPos): boolean {
    const head = this.getGhostHead();
    if (!head) return false;
    return head.segments.some((seg) => gridEquals(seg, pos));
  }

  /**
   * Number of snapshots available for ghost rendering / collision.
   */
  getGhostLength(): number {
    return this.buffer.readableCount(this.delayTicks);
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  /** Reset all recorded history (e.g. on game restart). */
  reset(): void {
    this.buffer.reset();
    this.ticksWritten = 0;
  }

  // ── Rewind support (Phase 6 hook) ──────────────────────────────

  /** Take an opaque snapshot of the entire buffer state. */
  snapshot(): BufferSnapshot {
    const bufSnap = this.buffer.toSnapshot();
    return {
      _brand: "BufferSnapshot" as const,
      data: bufSnap.data,
      head: bufSnap.head,
      count: bufSnap.count,
      readIndex: this.ticksWritten,
    };
  }

  /** Restore a previously taken snapshot (for rewind). */
  restore(snap: BufferSnapshot): void {
    this.buffer.fromSnapshot({
      data: snap.data,
      head: snap.head,
      count: snap.count,
    });
    this.ticksWritten = snap.readIndex;
  }
}
