import { DEFAULT_MOVE_INTERVAL_MS, type GridPos } from "../utils/grid";

export const DEFAULT_ECHO_DELAY_MS = 5000;

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
  private readonly buffer: Array<Snapshot | null>;
  private writeIndex = 0;
  private writeCount = 0;

  constructor(
    tickIntervalMs: number = DEFAULT_MOVE_INTERVAL_MS,
    delayMs: number = DEFAULT_ECHO_DELAY_MS,
  ) {
    this.tickIntervalMs = Math.max(1, tickIntervalMs);
    this.delayMs = Math.max(1, delayMs);
    this.delayTicks = Math.max(1, Math.ceil(this.delayMs / this.tickIntervalMs));
    this.buffer = new Array(this.delayTicks).fill(null);
  }

  /** Record one tick-worth of snake positions (head + body) into the circular buffer. */
  writePositions(positions: readonly GridPos[]): void {
    this.buffer[this.writeIndex] = clonePath(positions);
    this.writeIndex = (this.writeIndex + 1) % this.buffer.length;
    this.writeCount += 1;
  }

  /** Read the delayed ghost trail if replay delay has elapsed; otherwise returns empty. */
  readDelayedTrail(): GridPos[] {
    if (!this.isReplayReady()) {
      return [];
    }

    const delayedIndex = this.computeReadIndex();
    const delayed = this.buffer[delayedIndex];

    return delayed ? clonePath(delayed) : [];
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
  }

  private computeReadIndex(): number {
    const rawIndex = this.writeIndex - this.delayTicks;
    return ((rawIndex % this.buffer.length) + this.buffer.length) % this.buffer.length;
  }
}

