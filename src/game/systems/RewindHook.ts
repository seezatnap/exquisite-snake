import { EchoGhost } from "../entities/EchoGhost";
import { GhostFoodBurstQueue } from "./GhostFoodBurstQueue";
import type {
  Rewindable,
  EchoStateSnapshot,
} from "./rewindTypes";

// Re-export types so consumers can import from a single module
export type {
  Rewindable,
  GhostFoodBurstQueueSnapshot,
  EchoStateSnapshot,
} from "./rewindTypes";

// ── EchoRewindHook ────────────────────────────────────────────────

/**
 * Aggregates snapshot/restore across all echo-ghost-related entities
 * into a single integration point for Phase 6 rewind.
 *
 * Usage:
 * ```ts
 * const hook = new EchoRewindHook(echoGhost, burstQueue);
 *
 * // Capture state
 * const snap = hook.snapshot();
 *
 * // ... game ticks pass ...
 *
 * // Restore to earlier point
 * hook.restore(snap);
 * ```
 *
 * Either entity may be `null` (e.g. before a run starts). The hook
 * gracefully handles nulls by storing `null` in the corresponding
 * snapshot field and skipping restore for missing entities.
 */
export class EchoRewindHook implements Rewindable<EchoStateSnapshot> {
  constructor(
    private ghost: EchoGhost | null,
    private burstQueue: GhostFoodBurstQueue | null,
  ) {}

  /** Update the entity references (e.g. after startRun creates new instances). */
  setEntities(
    ghost: EchoGhost | null,
    burstQueue: GhostFoodBurstQueue | null,
  ): void {
    this.ghost = ghost;
    this.burstQueue = burstQueue;
  }

  snapshot(): EchoStateSnapshot {
    return {
      ghost: this.ghost?.snapshot() ?? null,
      burstQueue: this.burstQueue?.snapshot() ?? null,
    };
  }

  restore(snap: EchoStateSnapshot): void {
    if (snap.ghost && this.ghost) {
      this.ghost.restore(snap.ghost);
    }
    if (snap.burstQueue && this.burstQueue) {
      this.burstQueue.restore(snap.burstQueue);
    }
  }
}
