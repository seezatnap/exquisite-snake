import type { GridPos } from "../utils/grid";
import { DEFAULT_MOVE_INTERVAL_MS } from "../utils/grid";

// ── Constants ────────────────────────────────────────────────────

/** How many milliseconds the ghost trails behind the live snake. */
export const ECHO_DELAY_MS = 5000;

/** Default fade-out duration in milliseconds. */
export const FADE_DURATION_MS = 1000;

/**
 * Derive the replay delay in ticks from the tick interval.
 * At the default 125 ms interval this yields 40 ticks.
 */
export function delayTicks(tickIntervalMs: number): number {
  return Math.ceil(ECHO_DELAY_MS / tickIntervalMs);
}

// ── Types ────────────────────────────────────────────────────────

/**
 * Lifecycle state of the echo ghost.
 *
 * - `"warming"` — delay period has not yet elapsed; ghost is invisible.
 * - `"active"`  — ghost is replaying buffered history at full opacity.
 * - `"fading"`  — recording has stopped; ghost drains remaining frames
 *                 while fading out.
 * - `"inactive"` — all buffered frames exhausted after fade; ghost is gone.
 */
export type GhostLifecycleState = "warming" | "active" | "fading" | "inactive";

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
  readonly recordingStoppedAtTick: number;
  readonly lastRecordedTick: number;
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

  /** Number of ticks over which the ghost fades out after recording stops. */
  public readonly fadeDurationTicks: number;

  /** The tick at which recording was stopped (or -1 if still recording). */
  private recordingStoppedAtTick = -1;

  /** The last recorded tick (highest tick with a valid frame). */
  private lastRecordedTick = -1;

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

    this.fadeDurationTicks = Math.max(1, Math.ceil(FADE_DURATION_MS / tickIntervalMs));

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
    this.lastRecordedTick = this.currentTick;
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

  // ── Lifecycle management ───────────────────────────────────────

  /**
   * Signal that recording has stopped (e.g. snake died or game paused).
   * The ghost will continue replaying buffered frames and then fade out
   * over `fadeDurationTicks` ticks.
   *
   * After calling this, use `advancePlayhead()` each tick to continue
   * draining the buffer instead of `record()`.
   *
   * No-op if recording was already stopped.
   */
  stopRecording(): void {
    if (this.recordingStoppedAtTick >= 0) return;
    this.recordingStoppedAtTick = this.currentTick;
  }

  /**
   * Whether recording has been stopped via `stopRecording()`.
   */
  isRecordingStopped(): boolean {
    return this.recordingStoppedAtTick >= 0;
  }

  /**
   * Advance the playhead by one tick without recording a new frame.
   * Use this after `stopRecording()` to drain remaining buffered frames.
   *
   * Does nothing if recording has not been stopped yet.
   */
  advancePlayhead(): void {
    if (this.recordingStoppedAtTick < 0) return;
    this.currentTick++;
  }

  /**
   * Return the current lifecycle state of the ghost.
   *
   * - `"warming"`: delay period not yet elapsed, ghost invisible.
   * - `"active"`:  replaying buffered history at full opacity.
   * - `"fading"`:  recording stopped, draining final frames with decreasing opacity.
   * - `"inactive"`: all buffered frames exhausted, ghost fully gone.
   */
  getLifecycleState(): GhostLifecycleState {
    // Before the delay elapses, the ghost is warming up
    if (this.currentTick < this.delayInTicks) {
      return "warming";
    }

    const trail = this.getGhostTrail();

    // If recording is still happening, check if ghost has a trail
    if (this.recordingStoppedAtTick < 0) {
      return trail !== null ? "active" : "warming";
    }

    // Recording has stopped — check if we've exhausted all frames
    if (trail === null) {
      return "inactive";
    }

    // We still have a trail — are we in the fade window?
    // The ghost replays up to lastRecordedTick. The replay target is
    // currentTick - delayInTicks. When the target approaches lastRecordedTick,
    // we start fading.
    const replayTarget = this.currentTick - this.delayInTicks;
    const remainingFrames = this.lastRecordedTick - replayTarget;

    if (remainingFrames < this.fadeDurationTicks) {
      return "fading";
    }

    return "active";
  }

  /**
   * Return the ghost's current opacity (0.0–1.0).
   *
   * - `"warming"` / `"inactive"`: 0.0
   * - `"active"`: 1.0
   * - `"fading"`: linearly interpolated from 1.0 → 0.0 over `fadeDurationTicks`
   */
  getOpacity(): number {
    const state = this.getLifecycleState();

    if (state === "warming" || state === "inactive") {
      return 0;
    }

    if (state === "active") {
      return 1;
    }

    // Fading: linear interpolation from 1 → 0
    const replayTarget = this.currentTick - this.delayInTicks;
    const remainingFrames = this.lastRecordedTick - replayTarget;

    // remainingFrames ranges from fadeDurationTicks-1 down to 0
    // opacity = remainingFrames / (fadeDurationTicks - 1), but at least 0
    if (this.fadeDurationTicks <= 1) {
      return remainingFrames > 0 ? 1 : 0;
    }

    return Math.max(0, Math.min(1, remainingFrames / (this.fadeDurationTicks - 1)));
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
      recordingStoppedAtTick: this.recordingStoppedAtTick,
      lastRecordedTick: this.lastRecordedTick,
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
    this.recordingStoppedAtTick = snap.recordingStoppedAtTick;
    this.lastRecordedTick = snap.lastRecordedTick;
  }

  // ── Reset ──────────────────────────────────────────────────────

  /** Clear the buffer and reset the tick counter and lifecycle state. */
  reset(): void {
    this.buffer.fill(null);
    this.writeIndex = 0;
    this.count = 0;
    this.currentTick = 0;
    this.recordingStoppedAtTick = -1;
    this.lastRecordedTick = -1;
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
