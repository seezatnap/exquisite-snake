/**
 * Rewind Manager — Phase 6 integration hook.
 *
 * Provides a central registry for rewindable game entities.  Phase 6 will
 * use this single entry point to snapshot and restore the state of all
 * registered entities atomically, without reaching into individual
 * entity internals.
 *
 * **Current scope (Phase 3):** wired to `EchoGhost` only; no rewind
 * behavior is triggered.  The manager exposes a pure-data API so Phase 6
 * can attach temporal rewind mechanics on top.
 */

import type { RewindableBuffer, BufferSnapshot } from "../entities/EchoGhost";

// ── Types ────────────────────────────────────────────────────────

/** A named rewindable entity registered with the manager. */
export interface RewindableEntry {
  /** Unique identifier for this entity (e.g. "echoGhost"). */
  readonly id: string;
  /** The rewindable entity instance. */
  readonly target: RewindableBuffer;
}

/** An atomic snapshot of all registered rewindable entities. */
export interface GameSnapshot {
  /** Timestamp (game tick or wall-clock) when this snapshot was taken. */
  readonly timestamp: number;
  /** Per-entity snapshots keyed by the entity's registered id. */
  readonly entries: ReadonlyMap<string, BufferSnapshot>;
}

// ── RewindManager ────────────────────────────────────────────────

/**
 * Central coordinator for rewind-capable entities.
 *
 * Usage (Phase 3 — setup only, no rewind trigger):
 * ```ts
 * const manager = new RewindManager();
 * manager.register("echoGhost", echoGhost);
 *
 * // Phase 6 will call:
 * const snap = manager.snapshot(currentTick);
 * // … later …
 * manager.restore(snap);
 * ```
 */
export class RewindManager {
  private entries: Map<string, RewindableBuffer> = new Map();

  /**
   * Register a rewindable entity.
   *
   * @param id      Unique identifier (duplicate ids overwrite the previous entry).
   * @param target  The entity implementing `RewindableBuffer`.
   */
  register(id: string, target: RewindableBuffer): void {
    this.entries.set(id, target);
  }

  /**
   * Unregister an entity by id.
   * No-op if the id is not registered.
   */
  unregister(id: string): void {
    this.entries.delete(id);
  }

  /**
   * Remove all registered entities (e.g. on game restart).
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Whether an entity with the given id is registered.
   */
  has(id: string): boolean {
    return this.entries.has(id);
  }

  /**
   * Return the list of currently registered entity ids.
   */
  getRegisteredIds(): readonly string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Return the number of registered entities.
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Take an atomic snapshot of every registered entity's state.
   *
   * @param timestamp  A monotonic reference (game tick) to associate with
   *                   the snapshot.  Phase 6 uses this to decide how far
   *                   back to rewind.
   */
  snapshot(timestamp: number): GameSnapshot {
    const entries = new Map<string, BufferSnapshot>();
    for (const [id, target] of this.entries) {
      entries.set(id, target.snapshot());
    }
    return { timestamp, entries };
  }

  /**
   * Restore every registered entity from a previously taken snapshot.
   *
   * Only entities present in **both** the snapshot and the current
   * registry are restored — entities added after the snapshot was taken
   * are left untouched, and snapshot entries for entities that have been
   * unregistered are silently skipped.
   */
  restore(snap: GameSnapshot): void {
    for (const [id, bufferSnap] of snap.entries) {
      const target = this.entries.get(id);
      if (target) {
        target.restore(bufferSnap);
      }
    }
  }
}
