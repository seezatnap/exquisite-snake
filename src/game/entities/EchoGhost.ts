import { type GridPos, gridEquals, DEFAULT_MOVE_INTERVAL_MS } from "../utils/grid";

// ── Constants ────────────────────────────────────────────────────

/** Default replay delay in milliseconds. */
const DEFAULT_REPLAY_DELAY_MS = 5_000;

// ── Types ────────────────────────────────────────────────────────

/** Ghost lifecycle states. */
export type GhostLifecycleState = "inactive" | "active" | "fadingOut" | "expired";

/** A snapshot of the snake's segment positions at a single tick. */
export interface SnakeSnapshot {
  /** All segment positions at this tick (head first). */
  segments: readonly GridPos[];
}

/** A ghost trail entry with opacity metadata for rendering. */
export interface GhostTrailEntry {
  /** The snapshot of snake segments at this tick. */
  snapshot: SnakeSnapshot;
  /** Opacity value [0, 1] for rendering. Older entries fade toward 0. */
  opacity: number;
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
  readonly lifecycleState: GhostLifecycleState;
  readonly fadeOutTick: number;
  readonly fadeOutDuration: number;
}

/**
 * Events emitted to rewind hook listeners.
 *
 * Phase 6 can register a listener to be notified of rewind-relevant
 * state changes without reaching into EchoGhost internals.
 */
export type RewindEvent =
  | { type: "tick"; tickIndex: number }
  | { type: "lifecycleChange"; from: GhostLifecycleState; to: GhostLifecycleState }
  | { type: "restore"; snapshot: BufferSnapshot };

/** Callback type for rewind hook listeners. */
export type RewindHookListener = (event: RewindEvent) => void;

/**
 * Interface that Phase 6 (Temporal Rewind) will consume to manage
 * ghost rewind state. Provides snapshot/restore plus event hooks so
 * the rewind system can coordinate without coupling to EchoGhost internals.
 */
export interface RewindStateProvider extends RewindableBuffer {
  /** Register a listener for rewind-relevant events. Returns an unsubscribe function. */
  onRewindEvent(listener: RewindHookListener): () => void;
  /** Whether the ghost has any recorded state to rewind. */
  canRewind(): boolean;
  /** Current tick index (number of ticks recorded). */
  getTickIndex(): number;
  /** Current lifecycle state. */
  getLifecycleState(): GhostLifecycleState;
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
export class EchoGhost implements RewindStateProvider {
  private readonly buffer: CircularBuffer<SnakeSnapshot>;
  private readonly delayTicks: number;
  private readonly trailWindow: number;
  private ticksWritten = 0;

  /** Registered rewind hook listeners. */
  private rewindListeners: Set<RewindHookListener> = new Set();

  /** Lifecycle state tracks ghost visibility phases. */
  private lifecycleState: GhostLifecycleState = "inactive";

  /**
   * Pending ghost-food burst events.
   * Maps the tick index at which the burst should fire to the
   * ghost head position at that tick (resolved when the tick arrives).
   * Scheduled when the real snake eats food; fires exactly
   * `delayTicks` later at the ghost's corresponding position.
   */
  private pendingFoodBursts: Set<number> = new Set();

  /**
   * Grid positions where ghost-food bursts should be emitted this tick.
   * Populated by `recordTick()` and consumed by the caller via
   * `consumePendingBursts()`.
   */
  private readyBursts: GridPos[] = [];

  /**
   * Number of fade-out ticks elapsed since `stopRecording()` was called.
   * During fade-out, the ghost drains its remaining trail over
   * `trailWindow` ticks, reducing global opacity from 1 → 0.
   */
  private fadeOutTick = 0;

  /**
   * Total ticks allowed for the fade-out phase.
   * Equals `trailWindow` so the ghost fades over the same duration as
   * its visible trail length.
   */
  private fadeOutDuration = 0;

  /**
   * @param tickIntervalMs  How often the game ticks (ms). Defaults to
   *                        `DEFAULT_MOVE_INTERVAL_MS` (125 ms).
   * @param replayDelayMs   How long to wait before the ghost starts
   *                        replaying (ms). Defaults to 5 000 ms.
   * @param bufferCapacity  Override the buffer size. By default it is
   *                        computed as `2 × delayTicks` to hold enough
   *                        history for the replay window plus a margin
   *                        for the active trail.
   * @param trailWindowSize Override the rolling replay window size (max
   *                        number of trail snapshots visible at once).
   *                        Defaults to `delayTicks`.
   */
  constructor(
    tickIntervalMs: number = DEFAULT_MOVE_INTERVAL_MS,
    replayDelayMs: number = DEFAULT_REPLAY_DELAY_MS,
    bufferCapacity?: number,
    trailWindowSize?: number,
  ) {
    this.delayTicks = Math.ceil(replayDelayMs / tickIntervalMs);
    this.trailWindow = trailWindowSize ?? this.delayTicks;
    const capacity = bufferCapacity ?? this.delayTicks * 2;
    this.buffer = new CircularBuffer<SnakeSnapshot>(capacity);
  }

  // ── Configuration queries ───────────────────────────────────────

  /** Number of ticks the ghost trails behind the live snake. */
  getDelayTicks(): number {
    return this.delayTicks;
  }

  /** Maximum number of trail snapshots visible at once. */
  getTrailWindow(): number {
    return this.trailWindow;
  }

  /** Total number of ticks recorded so far. */
  getTotalTicksWritten(): number {
    return this.ticksWritten;
  }

  /** Maximum entries the buffer can hold. */
  getBufferCapacity(): number {
    return this.buffer.size;
  }

  /** Current lifecycle state of the ghost. */
  getLifecycleState(): GhostLifecycleState {
    return this.lifecycleState;
  }

  // ── Write API ───────────────────────────────────────────────────

  /**
   * Record the snake's current position. Call once per game tick.
   *
   * Segments are defensively copied so the caller can freely mutate
   * its array afterward.
   *
   * No-ops if the ghost is in `fadingOut` or `expired` state.
   */
  recordTick(segments: readonly GridPos[]): void {
    if (this.lifecycleState === "fadingOut" || this.lifecycleState === "expired") {
      return;
    }

    const snapshot: SnakeSnapshot = {
      segments: segments.map((s) => ({ col: s.col, row: s.row })),
    };
    this.buffer.write(snapshot);
    this.ticksWritten++;

    // Transition inactive → active once enough ticks have been recorded
    if (this.lifecycleState === "inactive" && this.ticksWritten >= this.delayTicks) {
      const from = "inactive" as GhostLifecycleState;
      this.lifecycleState = "active";
      this.emitRewindEvent({ type: "lifecycleChange", from, to: "active" });
    }

    // Check for pending ghost-food bursts that should fire this tick
    this.readyBursts = [];
    if (this.pendingFoodBursts.has(this.ticksWritten)) {
      this.pendingFoodBursts.delete(this.ticksWritten);
      const ghostHead = this.getGhostHead();
      if (ghostHead && ghostHead.segments.length > 0) {
        this.readyBursts.push({ ...ghostHead.segments[0] });
      }
    }

    this.emitRewindEvent({ type: "tick", tickIndex: this.ticksWritten });
  }

  // ── Ghost-food burst API ────────────────────────────────────────

  /**
   * Schedule a cosmetic ghost-food particle burst to fire exactly
   * `delayTicks` from now, at the ghost's position at that future tick.
   *
   * Call this when the real snake eats food. The burst has no impact
   * on score or game state — it is purely visual.
   */
  scheduleFoodBurst(): void {
    const fireTick = this.ticksWritten + this.delayTicks;
    this.pendingFoodBursts.add(fireTick);
  }

  /**
   * Consume and return all ghost-food burst positions that became
   * ready during the most recent `recordTick()` call.
   *
   * Returns an empty array if no bursts are ready. The caller should
   * emit cosmetic particle effects at the returned grid positions.
   */
  consumePendingBursts(): readonly GridPos[] {
    const bursts = this.readyBursts;
    this.readyBursts = [];
    return bursts;
  }

  /**
   * Number of pending food bursts not yet fired (useful for testing).
   */
  getPendingBurstCount(): number {
    return this.pendingFoodBursts.size;
  }

  // ── Read API ────────────────────────────────────────────────────

  /**
   * Whether the ghost has accumulated enough ticks to begin replaying.
   * Returns false once the ghost has fully expired.
   */
  isActive(): boolean {
    return this.lifecycleState === "active" || this.lifecycleState === "fadingOut";
  }

  /**
   * Whether the ghost is currently fading out after recording stopped.
   */
  isFadingOut(): boolean {
    return this.lifecycleState === "fadingOut";
  }

  /**
   * Whether the ghost has fully faded out and is no longer visible.
   */
  isExpired(): boolean {
    return this.lifecycleState === "expired";
  }

  /**
   * Retrieve the ghost trail — the sequence of snapshots that are at
   * least `delayTicks` old, capped to the rolling replay window.
   *
   * Returns an empty array if the ghost hasn't started yet or has
   * expired.
   *
   * The returned array is ordered oldest-first. Each entry contains
   * the full set of snake segments at that historical tick.
   */
  getGhostTrail(): readonly SnakeSnapshot[] {
    if (this.lifecycleState === "expired") return [];

    const readable = this.buffer.readableCount(this.delayTicks);
    if (readable <= 0) return [];

    // Cap the trail to the rolling replay window
    const windowSize = Math.min(readable, this.trailWindow);
    const startIndex = readable - windowSize;

    const trail: SnakeSnapshot[] = [];
    for (let i = startIndex; i < readable; i++) {
      const snap = this.buffer.read(this.delayTicks, i);
      if (snap) trail.push(snap);
    }
    return trail;
  }

  /**
   * Retrieve the ghost trail with per-entry opacity metadata for
   * rendering. Oldest entries in the trail fade toward 0; newest
   * entries are near 1. During fade-out, a global multiplier
   * progressively reduces all opacities to 0.
   *
   * Returns an empty array if the ghost is inactive or expired.
   */
  getGhostTrailWithOpacity(): readonly GhostTrailEntry[] {
    if (this.lifecycleState === "expired") return [];

    const trail = this.getGhostTrail();
    if (trail.length === 0) return [];

    // Positional fade: oldest = low opacity, newest = full opacity
    const len = trail.length;

    // During fade-out, apply a global multiplier that decreases to 0
    const globalAlpha = this.lifecycleState === "fadingOut"
      ? Math.max(0, 1 - this.fadeOutTick / this.fadeOutDuration)
      : 1;

    return trail.map((snapshot, index) => {
      // Positional opacity: linearly interpolate from ~0.2 (oldest) to 1.0 (newest)
      const positionalOpacity = len === 1
        ? 1
        : 0.2 + 0.8 * (index / (len - 1));
      return {
        snapshot,
        opacity: positionalOpacity * globalAlpha,
      };
    });
  }

  /**
   * Get the single snapshot that represents the ghost's "current"
   * position — the most recent entry that is at least `delayTicks` old.
   *
   * Returns `undefined` if the ghost hasn't started replaying yet
   * or has expired.
   */
  getGhostHead(): SnakeSnapshot | undefined {
    if (this.lifecycleState === "expired") return undefined;

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
   * Number of snapshots available for ghost rendering / collision,
   * capped to the rolling replay window.
   */
  getGhostLength(): number {
    if (this.lifecycleState === "expired") return 0;

    const readable = this.buffer.readableCount(this.delayTicks);
    return Math.min(readable, this.trailWindow);
  }

  /**
   * Current fade-out opacity multiplier [0, 1].
   * Returns 1 when not fading out, 0 when fully expired.
   */
  getFadeOpacity(): number {
    if (this.lifecycleState === "fadingOut") {
      return Math.max(0, 1 - this.fadeOutTick / this.fadeOutDuration);
    }
    if (this.lifecycleState === "expired") {
      return 0;
    }
    return 1;
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  /**
   * Signal that recording has stopped (e.g., the snake died).
   * The ghost transitions to `fadingOut` and will drain its remaining
   * visible trail over `trailWindow` ticks.
   *
   * No-op if the ghost is already fading out, expired, or inactive.
   */
  stopRecording(): void {
    if (this.lifecycleState !== "active") return;

    const from = this.lifecycleState;
    this.lifecycleState = "fadingOut";
    this.fadeOutTick = 0;
    this.fadeOutDuration = this.trailWindow;
    this.emitRewindEvent({ type: "lifecycleChange", from, to: "fadingOut" });
  }

  /**
   * Advance the fade-out by one tick. Call once per game tick while
   * the ghost is fading out.
   *
   * Returns `true` if the ghost is still visible (fading), `false`
   * once it has fully expired.
   */
  advanceFadeOut(): boolean {
    if (this.lifecycleState !== "fadingOut") return false;

    this.fadeOutTick++;
    if (this.fadeOutTick >= this.fadeOutDuration) {
      this.lifecycleState = "expired";
      this.emitRewindEvent({ type: "lifecycleChange", from: "fadingOut", to: "expired" });
      return false;
    }
    return true;
  }

  /** Reset all recorded history and lifecycle state (e.g. on game restart). */
  reset(): void {
    this.buffer.reset();
    this.ticksWritten = 0;
    this.lifecycleState = "inactive";
    this.fadeOutTick = 0;
    this.fadeOutDuration = 0;
    this.pendingFoodBursts.clear();
    this.readyBursts = [];
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
      lifecycleState: this.lifecycleState,
      fadeOutTick: this.fadeOutTick,
      fadeOutDuration: this.fadeOutDuration,
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
    this.lifecycleState = snap.lifecycleState;
    this.fadeOutTick = snap.fadeOutTick;
    this.fadeOutDuration = snap.fadeOutDuration;
    this.emitRewindEvent({ type: "restore", snapshot: snap });
  }

  // ── Rewind hook listener API (Phase 6) ────────────────────────

  /**
   * Register a listener for rewind-relevant events.
   * Returns an unsubscribe function.
   */
  onRewindEvent(listener: RewindHookListener): () => void {
    this.rewindListeners.add(listener);
    return () => {
      this.rewindListeners.delete(listener);
    };
  }

  /** Whether the ghost has any recorded state that can be rewound. */
  canRewind(): boolean {
    return this.ticksWritten > 0;
  }

  /** Current tick index (number of ticks recorded so far). */
  getTickIndex(): number {
    return this.ticksWritten;
  }

  /** Emit a rewind event to all registered listeners. */
  private emitRewindEvent(event: RewindEvent): void {
    for (const listener of this.rewindListeners) {
      listener(event);
    }
  }
}
