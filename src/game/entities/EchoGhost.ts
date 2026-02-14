import type { GridPos } from "../utils/grid";
import { DEFAULT_MOVE_INTERVAL_MS } from "../utils/grid";

// ── Constants ────────────────────────────────────────────────────

/** How many milliseconds the ghost trails behind the live snake. */
export const ECHO_DELAY_MS = 5000;

/**
 * Derive the replay delay in ticks from the tick interval.
 * At the default 125 ms interval this yields 40 ticks.
 */
export function delayTicks(tickIntervalMs: number): number {
  return Math.ceil(ECHO_DELAY_MS / tickIntervalMs);
}

// ── Types ────────────────────────────────────────────────────────

/** A snapshot of the snake's segments at a single tick. */
export interface GhostFrame {
  /** Full copy of the snake segments at this tick (head-first). */
  segments: readonly GridPos[];
  /** The tick number when this frame was recorded. */
  tick: number;
}

/**
 * Interface for future Phase 6 rewind integration.
 * Allows snapshotting and restoring the ghost buffer state.
 */
export interface RewindableBuffer {
  /** Create a snapshot of the current buffer state that can be restored later. */
  snapshot(): BufferSnapshot;
  /** Restore a previously taken snapshot, rewinding the buffer. */
  restore(snapshot: BufferSnapshot): void;
}

/** Opaque snapshot of the circular buffer's internal state. */
export interface BufferSnapshot {
  readonly frames: readonly GhostFrame[];
  readonly writeIndex: number;
  readonly count: number;
  readonly currentTick: number;
}

// ── EchoGhost ────────────────────────────────────────────────────

/**
 * Records the snake's path each game tick into a fixed-size circular
 * buffer and replays it as a ghost trail after a configurable delay.
 *
 * The entity is purely data-driven — it owns no rendering state.
 * Rendering, collision, and particle effects are handled by other
 * systems that consume the deterministic read API.
 */
export class EchoGhost implements RewindableBuffer {
  /** The circular buffer of recorded frames. */
  private readonly buffer: (GhostFrame | null)[];

  /** Write position in the circular buffer (next slot to overwrite). */
  private writeIndex = 0;

  /** Number of frames currently stored (saturates at capacity). */
  private count = 0;

  /** Monotonically increasing tick counter (bumped on every `record`). */
  private currentTick = 0;

  /** Number of ticks the ghost trails behind the live snake. */
  public readonly delayInTicks: number;

  /** Total capacity of the circular buffer. */
  public readonly capacity: number;

  /**
   * @param tickIntervalMs  Movement interval in milliseconds
   *                        (default: `DEFAULT_MOVE_INTERVAL_MS`).
   *                        Used to derive the replay delay in ticks.
   * @param bufferSeconds   How many seconds of history the buffer can
   *                        hold. Must be > delay. Defaults to twice
   *                        the echo delay so the ghost can replay a
   *                        full window before fading out.
   */
  constructor(
    tickIntervalMs: number = DEFAULT_MOVE_INTERVAL_MS,
    bufferSeconds?: number,
  ) {
    this.delayInTicks = delayTicks(tickIntervalMs);

    // Buffer holds enough frames for the requested history window.
    // Default to double the delay so there's a full replay window.
    const bufferMs = bufferSeconds !== undefined
      ? bufferSeconds * 1000
      : ECHO_DELAY_MS * 2;
    this.capacity = Math.max(
      this.delayInTicks + 1,
      Math.ceil(bufferMs / tickIntervalMs),
    );

    this.buffer = new Array<GhostFrame | null>(this.capacity).fill(null);
  }

  // ── Write API ──────────────────────────────────────────────────

  /**
   * Record the snake's current segments into the circular buffer.
   * Call exactly once per game tick, **before** reading the ghost trail.
   *
   * @param segments  The snake's full segment list (head-first).
   *                  A shallow copy of each `GridPos` is stored so
   *                  mutations to the original array don't corrupt
   *                  the buffer.
   */
  record(segments: readonly GridPos[]): void {
    const frame: GhostFrame = {
      segments: segments.map((s) => ({ col: s.col, row: s.row })),
      tick: this.currentTick,
    };

    this.buffer[this.writeIndex] = frame;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
    this.currentTick++;
  }

  // ── Read API ───────────────────────────────────────────────────

  /**
   * Return the ghost trail — the segments from `delayInTicks` ticks ago.
   *
   * Returns `null` when:
   * - Not enough ticks have been recorded yet (delay not reached).
   * - The delayed frame has been overwritten (buffer too small — shouldn't
   *   happen with the default sizing).
   */
  getGhostTrail(): readonly GridPos[] | null {
    const targetTick = this.currentTick - this.delayInTicks;
    if (targetTick < 0) {
      return null; // Delay not yet reached
    }

    const frame = this.frameAtTick(targetTick);
    if (frame === null) {
      return null; // Frame was overwritten or not found
    }

    return frame.segments;
  }

  /**
   * Return the full `GhostFrame` from `delayInTicks` ticks ago,
   * including the tick number. Useful for systems that need timing
   * information (e.g. particle bursts).
   */
  getGhostFrame(): GhostFrame | null {
    const targetTick = this.currentTick - this.delayInTicks;
    if (targetTick < 0) {
      return null;
    }
    return this.frameAtTick(targetTick);
  }

  /**
   * Whether the ghost is currently active (enough ticks have elapsed
   * for the delay, and a valid frame exists).
   */
  isActive(): boolean {
    return this.getGhostTrail() !== null;
  }

  /**
   * The current tick counter (number of times `record` has been called).
   */
  getCurrentTick(): number {
    return this.currentTick;
  }

  /**
   * Number of frames currently stored in the buffer.
   */
  getCount(): number {
    return this.count;
  }

  /**
   * Retrieve the frame at a specific tick number, or null if it's
   * no longer in the buffer.
   */
  getFrameAtTick(tick: number): GhostFrame | null {
    return this.frameAtTick(tick);
  }

  // ── Rewind API (Phase 6 hook) ──────────────────────────────────

  /**
   * Create a snapshot of the entire buffer state.
   * The snapshot is a deep copy and can be safely stored.
   */
  snapshot(): BufferSnapshot {
    const frames: GhostFrame[] = [];
    for (let i = 0; i < this.capacity; i++) {
      const f = this.buffer[i];
      if (f !== null) {
        frames.push({
          segments: f.segments.map((s) => ({ col: s.col, row: s.row })),
          tick: f.tick,
        });
      }
    }

    return {
      frames,
      writeIndex: this.writeIndex,
      count: this.count,
      currentTick: this.currentTick,
    };
  }

  /**
   * Restore a previously taken snapshot, effectively rewinding the
   * ghost buffer to that point in time.
   */
  restore(snap: BufferSnapshot): void {
    // Clear the buffer
    this.buffer.fill(null);

    // Restore frames into their correct buffer slots
    for (const f of snap.frames) {
      const slot = f.tick % this.capacity;
      this.buffer[slot] = {
        segments: f.segments.map((s) => ({ col: s.col, row: s.row })),
        tick: f.tick,
      };
    }

    this.writeIndex = snap.writeIndex;
    this.count = snap.count;
    this.currentTick = snap.currentTick;
  }

  // ── Reset ──────────────────────────────────────────────────────

  /** Clear the buffer and reset the tick counter. */
  reset(): void {
    this.buffer.fill(null);
    this.writeIndex = 0;
    this.count = 0;
    this.currentTick = 0;
  }

  // ── Internal ───────────────────────────────────────────────────

  /**
   * Look up a frame by tick number. The frame lives at
   * `tick % capacity` in the circular buffer — if the slot still
   * holds the expected tick we return it, otherwise it has been
   * overwritten and we return null.
   */
  private frameAtTick(tick: number): GhostFrame | null {
    if (tick < 0 || tick >= this.currentTick) {
      return null;
    }

    const slot = tick % this.capacity;
    const frame = this.buffer[slot];
    if (frame === null || frame.tick !== tick) {
      return null; // Overwritten
    }
    return frame;
  }
}
