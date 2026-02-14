import { DEFAULT_MOVE_INTERVAL_MS, type GridPos } from "../utils/grid";

export const DEFAULT_ECHO_DELAY_MS = 5000;
export const DEFAULT_ECHO_FADE_MS = 1000;

type SnapshotEntry = readonly GridPos[] | null;
type SnapshotEntries = readonly SnapshotEntry[];

export type EchoGhostReplayState = "waiting" | "active" | "fading" | "exhausted";

export interface EchoGhostRewindState {
  readonly tickIntervalMs: number;
  readonly delayMs: number;
  readonly delayTicks: number;
  readonly fadeMs: number;
  readonly fadeTicks: number;
  readonly writeIndex: number;
  readonly writeCount: number;
  readonly replayState: EchoGhostReplayState;
  readonly replayTicks: number;
  readonly fadeTicksElapsed: number;
  readonly buffer: SnapshotEntries;
}

export type EchoGhostRewindStateHook = (snapshot: EchoGhostRewindState) => void;

type Snapshot = readonly GridPos[];

function clonePath(path: readonly GridPos[]): GridPos[] {
  return path.map((position) => ({ ...position }));
}

/**
 * EchoGhost buffers recent snake paths and replays them on a fixed delay.
 * The replay delay is computed from the current tick interval so "5s" means
 * `5000ms / tickIntervalMs` snapshots.
 */
export class EchoGhost {
  private readonly tickIntervalMs: number;
  private readonly delayMs: number;
  private readonly delayTicks: number;
  private readonly fadeMs: number;
  private readonly fadeTicks: number;
  private readonly buffer: Array<Snapshot | null>;
  private rewindStateHook: EchoGhostRewindStateHook | null = null;
  private writeIndex = 0;
  private writeCount = 0;
  private replayState: EchoGhostReplayState = "waiting";
  private replayTicks = 0;
  private fadeTicksElapsed = 0;

  constructor(
    tickIntervalMs: number = DEFAULT_MOVE_INTERVAL_MS,
    delayMs: number = DEFAULT_ECHO_DELAY_MS,
    fadeMs: number = DEFAULT_ECHO_FADE_MS,
  ) {
    this.tickIntervalMs = Math.max(1, tickIntervalMs);
    this.delayMs = Math.max(1, delayMs);
    this.fadeMs = Math.max(1, fadeMs);
    this.delayTicks = Math.max(1, Math.ceil(this.delayMs / this.tickIntervalMs));
    this.fadeTicks = Math.max(1, Math.ceil(this.fadeMs / this.tickIntervalMs));
    this.buffer = new Array(this.delayTicks).fill(null);
  }

  /** Record one tick-worth of snake positions (head + body) into the circular buffer. */
  writePositions(positions: readonly GridPos[]): void {
    this.buffer[this.writeIndex] = clonePath(positions);
    this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
    this.writeCount += 1;

    this.emitRewindState();
  }

  /** Read the delayed ghost trail if replay delay has elapsed; otherwise returns empty.
   * By default fading output is suppressed so callers can hide it unless explicitly requested.
   */
  readDelayedTrail(includeFadingOutput = false): GridPos[] {
    if (!this.isReplayReady() || this.replayState === "waiting") {
      return [];
    }
    if (!includeFadingOutput && this.replayState === "fading") {
      return [];
    }
    if (this.replayState === "exhausted") {
      return [];
    }

    const delayedIndex = this.computeReadIndex();
    const delayed = this.buffer[delayedIndex];

    return delayed ? clonePath(delayed) : [];
  }

  /**
   * Progress one replay-frame. Must be called once per movement tick after a
   * ghost snapshot is written to keep playback bounded.
   */
  advanceReplayProgress(): void {
    if (this.replayState === "exhausted" || !this.isReplayReady()) {
      return;
    }

    if (this.replayState === "waiting") {
      this.replayState = "active";
    }

    if (this.replayState === "active") {
      this.replayTicks += 1;
      if (this.replayTicks > this.delayTicks) {
        this.replayState = "fading";
        this.fadeTicksElapsed = 1;
        if (this.fadeTicksElapsed >= this.fadeTicks) {
          this.replayState = "exhausted";
        }
      }
      this.emitRewindState();
      return;
    }

    if (this.replayState === "fading") {
      this.fadeTicksElapsed += 1;
      if (this.fadeTicksElapsed >= this.fadeTicks) {
        this.replayState = "exhausted";
      }
    }

    this.emitRewindState();
  }

  /** Get the current playback lifecycle state. */
  getReplayState(): EchoGhostReplayState {
    return this.replayState;
  }

  /** Whether the ghost should still be rendered as a trail this tick. */
  isReplayActive(): boolean {
    return this.replayState === "active";
  }

  /** Whether the replay has begun and is currently fading out. */
  isReplayFading(): boolean {
    return this.replayState === "fading";
  }

  /** Whether the replay trail and any growth are fully exhausted. */
  isReplayExhausted(): boolean {
    return this.replayState === "exhausted";
  }

  /** Alpha value to apply while fading out the ghost. Returns 1 during active replay. */
  getReplayOpacity(): number {
    if (this.replayState === "active") {
      return 1;
    }
    if (this.replayState === "fading") {
      return Math.max(0, 1 - this.fadeTicksElapsed / this.fadeTicks);
    }
    return 0;
  }

  /** Whether enough ticks have been recorded to start replay output. */
  isReplayReady(): boolean {
    return this.writeCount >= this.delayTicks;
  }

  /** Return the delay used to replay the ghost in ticks. */
  getDelayTicks(): number {
    return this.delayTicks;
  }

  /** Return the delay used to replay the ghost in milliseconds. */
  getDelayMs(): number {
    return this.delayMs;
  }

  /** Return the currently configured tick interval used for delay derivation. */
  getTickIntervalMs(): number {
    return this.tickIntervalMs;
  }

  /** Return fixed capacity of the circular buffer. */
  getBufferCapacity(): number {
    return this.buffer.length;
  }

  /** Return how many ticks have been recorded since the last reset. */
  getRecordedTickCount(): number {
    return this.writeCount;
  }

  /** Clear buffer state for a fresh replay session. */
  reset(): void {
    this.writeIndex = 0;
    this.writeCount = 0;
    this.buffer.fill(null);
    this.replayState = "waiting";
    this.replayTicks = 0;
    this.fadeTicksElapsed = 0;

    this.emitRewindState();
  }

  /** Register an optional hook that receives rewind snapshots after each ghost tick-state mutation. */
  setRewindStateHook(hook: EchoGhostRewindStateHook | null): void {
    this.rewindStateHook = hook;
  }

  /** Capture rewind-ready ghost state including the circular buffer snapshot. */
  captureRewindState(): EchoGhostRewindState {
    return {
      tickIntervalMs: this.tickIntervalMs,
      delayMs: this.delayMs,
      delayTicks: this.delayTicks,
      fadeMs: this.fadeMs,
      fadeTicks: this.fadeTicks,
      writeIndex: this.writeIndex,
      writeCount: this.writeCount,
      replayState: this.replayState,
      replayTicks: this.replayTicks,
      fadeTicksElapsed: this.fadeTicksElapsed,
      buffer: this.buffer.map((snapshot) =>
        snapshot ? snapshot.map((cell) => ({ ...cell })) : null,
      ),
    };
  }

  /** Restore rewind state into the ghost buffer and replay lifecycle without advancing gameplay. */
  restoreRewindState(snapshot: EchoGhostRewindState): void {
    this.writeIndex = ((snapshot.writeIndex % this.buffer.length) + this.buffer.length) % this.buffer.length;
    this.writeCount = snapshot.writeCount;
    this.replayState = snapshot.replayState;
    this.replayTicks = snapshot.replayTicks;
    this.fadeTicksElapsed = snapshot.fadeTicksElapsed;

    for (let index = 0; index < this.buffer.length; index++) {
      const snapshotEntry = snapshot.buffer[index] ?? null;
      this.buffer[index] = snapshotEntry ? clonePath(snapshotEntry) : null;
    }

    this.emitRewindState();
  }

  private computeReadIndex(): number {
    const rawIndex = this.writeIndex - this.delayTicks;
    return ((rawIndex % this.buffer.length) + this.buffer.length) % this.buffer.length;
  }

  private emitRewindState(): void {
    if (!this.rewindStateHook) {
      return;
    }

    this.rewindStateHook(this.captureRewindState());
  }
}
