import type { EchoGhostBufferSnapshot } from "../entities/EchoGhost";

// ── Rewindable interface ──────────────────────────────────────────

/**
 * Generic snapshot/restore contract for any game entity that Phase 6
 * rewind needs to capture and roll back.
 *
 * Implementors must produce a deep-copy snapshot and accept one back
 * to restore their internal state deterministically.
 */
export interface Rewindable<TSnapshot> {
  /** Capture a deep-copy of the current internal state. */
  snapshot(): TSnapshot;

  /** Restore internal state from a previously captured snapshot. */
  restore(snap: TSnapshot): void;
}

// ── Snapshot types ────────────────────────────────────────────────

/**
 * Snapshot payload for the GhostFoodBurstQueue.
 *
 * Captures the queue of pending bursts and the internal tick counter
 * so rewind can restore the exact burst schedule.
 */
export interface GhostFoodBurstQueueSnapshot {
  queue: Array<{ fireTick: number }>;
  currentTick: number;
}

/**
 * Combined snapshot of all echo-ghost-related state.
 *
 * Phase 6 rewind captures and restores this as a single unit so the
 * ghost buffer, burst queue, and any future echo-related subsystems
 * stay in sync.
 */
export interface EchoStateSnapshot {
  ghost: EchoGhostBufferSnapshot | null;
  burstQueue: GhostFoodBurstQueueSnapshot | null;
}
