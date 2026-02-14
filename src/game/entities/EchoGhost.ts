import type { GridPos } from "../utils/grid";

export interface EchoGhostOptions {
  delayMs: number;
  fadeOutMs: number;
  maxSamples: number;
}

interface EchoGhostSample {
  timestampMs: number;
  segments: GridPos[];
}

const DEFAULT_DELAY_MS = 5_000;
const DEFAULT_FADE_OUT_MS = 300;
const DEFAULT_MAX_SAMPLES = 512;

function cloneSegments(segments: readonly GridPos[]): GridPos[] {
  return segments.map((segment) => ({
    col: segment.col,
    row: segment.row,
  }));
}

/**
 * Records snake path snapshots and replays them as a delayed ghost stream.
 *
 * The history buffer is bounded and uses circular overwrite semantics so
 * memory stays constant even in long runs.
 */
export class EchoGhost {
  private readonly delayMs: number;
  private readonly fadeOutMs: number;
  private readonly maxSamples: number;

  private readonly samples: Array<EchoGhostSample | null>;
  private startIndex = 0;
  private sampleCount = 0;

  private elapsedMs = 0;
  private recording = true;
  private opacity = 0;
  private playbackSegments: GridPos[] = [];

  constructor(options: Partial<EchoGhostOptions> = {}) {
    this.delayMs = Math.max(0, Math.floor(options.delayMs ?? DEFAULT_DELAY_MS));
    this.fadeOutMs = Math.max(0, Math.floor(options.fadeOutMs ?? DEFAULT_FADE_OUT_MS));
    this.maxSamples = Math.max(1, Math.floor(options.maxSamples ?? DEFAULT_MAX_SAMPLES));
    this.samples = Array.from({ length: this.maxSamples }, () => null);
  }

  /** Advance internal timing and update playback/fade state. */
  advance(deltaMs: number): void {
    const safeDelta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
    if (safeDelta <= 0) return;

    this.elapsedMs += safeDelta;
    this.updatePlayback(safeDelta);
  }

  /** Capture one snake path snapshot at the current internal time. */
  recordPath(segments: readonly GridPos[]): void {
    if (!this.recording || segments.length === 0) {
      return;
    }

    this.pushSample({
      timestampMs: this.elapsedMs,
      segments: cloneSegments(segments),
    });

    this.updatePlayback(0);
  }

  /** Stop accepting new path samples (existing history still replays). */
  stopRecording(): void {
    this.recording = false;
    this.updatePlayback(0);
  }

  /** Resume accepting new path samples. */
  startRecording(): void {
    this.recording = true;
  }

  /** Clear all buffered history and reset playback state. */
  reset(): void {
    this.samples.fill(null);
    this.startIndex = 0;
    this.sampleCount = 0;
    this.elapsedMs = 0;
    this.recording = true;
    this.opacity = 0;
    this.playbackSegments = [];
  }

  /** Current delayed ghost path to render/collide against. */
  getPlaybackSegments(): readonly GridPos[] {
    return cloneSegments(this.playbackSegments);
  }

  /** Current ghost opacity in [0, 1]. */
  getOpacity(): number {
    return this.opacity;
  }

  /** Whether the ghost should currently be treated as visible/active. */
  isActive(): boolean {
    return this.opacity > 0 && this.playbackSegments.length > 0;
  }

  /** Whether new history samples are currently being recorded. */
  isRecording(): boolean {
    return this.recording;
  }

  /** Number of buffered history samples currently retained. */
  getBufferedSampleCount(): number {
    return this.sampleCount;
  }

  private updatePlayback(deltaMs: number): void {
    const delayedTimestamp = this.elapsedMs - this.delayMs;
    const delayedSample =
      delayedTimestamp >= 0
        ? this.findLatestSampleAtOrBefore(delayedTimestamp)
        : null;

    if (delayedSample) {
      this.playbackSegments = cloneSegments(delayedSample.segments);
      this.opacity = 1;
      if (!this.recording) {
        this.consumePlayedSamples(delayedTimestamp);
      }
      return;
    }

    if (!this.recording && this.sampleCount > 0) {
      this.consumePlayedSamples(delayedTimestamp);
      if (this.sampleCount > 0) {
        return;
      }
    }

    if (!this.recording && this.playbackSegments.length > 0 && this.opacity > 0) {
      this.applyFade(deltaMs);
      return;
    }

    this.playbackSegments = [];
    this.opacity = 0;
  }

  private applyFade(deltaMs: number): void {
    if (this.fadeOutMs <= 0) {
      this.playbackSegments = [];
      this.opacity = 0;
      return;
    }

    const nextOpacity = this.opacity - deltaMs / this.fadeOutMs;
    this.opacity = Math.max(0, nextOpacity);

    if (this.opacity <= 0) {
      this.playbackSegments = [];
    }
  }

  private consumePlayedSamples(delayedTimestamp: number): void {
    // Keep the latest sample <= delayedTimestamp, discard older consumed entries.
    while (this.sampleCount > 1) {
      const second = this.peek(1);
      if (!second || second.timestampMs > delayedTimestamp) {
        break;
      }
      this.shiftOldest();
    }

    // Once the delayed cursor has passed the final sample, buffer is exhausted.
    if (this.sampleCount === 1) {
      const last = this.peek(0);
      if (last && last.timestampMs < delayedTimestamp) {
        this.shiftOldest();
      }
    }
  }

  private findLatestSampleAtOrBefore(timestampMs: number): EchoGhostSample | null {
    for (let offset = this.sampleCount - 1; offset >= 0; offset--) {
      const sample = this.peek(offset);
      if (sample && sample.timestampMs <= timestampMs) {
        return sample;
      }
    }
    return null;
  }

  private pushSample(sample: EchoGhostSample): void {
    const writeIndex = (this.startIndex + this.sampleCount) % this.maxSamples;

    if (this.sampleCount < this.maxSamples) {
      this.samples[writeIndex] = sample;
      this.sampleCount++;
      return;
    }

    // Overwrite oldest sample when full.
    this.samples[writeIndex] = sample;
    this.startIndex = (this.startIndex + 1) % this.maxSamples;
  }

  private shiftOldest(): void {
    if (this.sampleCount <= 0) return;
    this.samples[this.startIndex] = null;
    this.startIndex = (this.startIndex + 1) % this.maxSamples;
    this.sampleCount--;
  }

  private peek(offset: number): EchoGhostSample | null {
    if (offset < 0 || offset >= this.sampleCount) return null;
    const index = (this.startIndex + offset) % this.maxSamples;
    return this.samples[index];
  }
}
