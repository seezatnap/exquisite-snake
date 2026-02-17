import {
  PortalPair,
  type CellOccupancyChecker,
  findPortalSpawnPositions,
  generatePortalPairId,
  resetPortalPairIdCounter,
} from "../entities/Portal";
import type { GridPos } from "../utils/grid";

// ── Configuration ───────────────────────────────────────────────

/** Base interval between portal pair spawn attempts (ms). */
export const PORTAL_SPAWN_INTERVAL_MS = 30_000;

/**
 * Maximum random deviation applied to the spawn interval (ms).
 *
 * The actual interval for each cycle is:
 *   `PORTAL_SPAWN_INTERVAL_MS + random(-JITTER, +JITTER)`
 */
export const PORTAL_SPAWN_JITTER_MS = 5_000;

/** Maximum number of portal pairs that can exist simultaneously. */
export const PORTAL_MAX_ACTIVE_PAIRS = 1;

// ── PortalManager ──────────────────────────────────────────────

export interface PortalManagerOptions {
  /** Base spawn interval in ms. */
  spawnIntervalMs?: number;

  /** Random jitter applied to the spawn interval in ms. */
  spawnJitterMs?: number;

  /** Maximum concurrent active pairs. */
  maxActivePairs?: number;

  /** RNG function returning [0, 1). Defaults to Math.random. */
  rng?: () => number;
}

/**
 * Manages the spawn cadence and lifecycle of linked portal pairs.
 *
 * Responsibilities:
 * - Accumulate time and spawn new portal pairs at randomised ~30-second intervals.
 * - Tick each active pair so it transitions through spawning → active → collapsing → collapsed.
 * - Remove collapsed pairs from the active set.
 * - Expose the set of active pairs and an occupancy checker for integration with other systems.
 *
 * This system is pure logic — it does not own any Phaser game objects.
 * Rendering and scene integration are handled externally.
 */
export class PortalManager {
  private readonly spawnIntervalMs: number;
  private readonly spawnJitterMs: number;
  private readonly maxActivePairs: number;
  private rng: () => number;

  /** All portal pairs that have not yet been removed (spawning, active, or collapsing). */
  private activePairs: PortalPair[] = [];

  /** Time accumulated toward the next spawn attempt (ms). */
  private spawnTimerMs = 0;

  /** The randomised target for the current spawn cycle (ms). */
  private currentSpawnTargetMs: number;

  /** Whether the manager is actively running. */
  private running = false;

  /** Occupancy checkers provided by external systems (snake, food, lava, etc.). */
  private occupancyCheckers: CellOccupancyChecker[] = [];

  constructor(options: PortalManagerOptions = {}) {
    this.spawnIntervalMs = Math.max(
      0,
      options.spawnIntervalMs ?? PORTAL_SPAWN_INTERVAL_MS,
    );
    this.spawnJitterMs = Math.max(
      0,
      options.spawnJitterMs ?? PORTAL_SPAWN_JITTER_MS,
    );
    this.maxActivePairs = Math.max(
      1,
      options.maxActivePairs ?? PORTAL_MAX_ACTIVE_PAIRS,
    );
    this.rng = options.rng ?? Math.random;
    this.currentSpawnTargetMs = this.rollSpawnTarget();
  }

  // ── Lifecycle ───────────────────────────────────────────────

  /** Start the manager for a new run. Resets all state. */
  startRun(): void {
    this.reset();
    this.running = true;
  }

  /** Stop the manager without clearing state (e.g. on pause or game over). */
  stopRun(): void {
    this.running = false;
  }

  /** Reset all portal state. */
  reset(): void {
    this.running = false;
    this.activePairs = [];
    this.spawnTimerMs = 0;
    this.currentSpawnTargetMs = this.rollSpawnTarget();
    resetPortalPairIdCounter();
  }

  // ── Frame update ─────────────────────────────────────────────

  /**
   * Advance the manager by `delta` ms.
   *
   * 1. Tick all active pairs, remove any that have collapsed.
   * 2. Accumulate spawn timer and attempt to spawn a new pair when due.
   *
   * Returns the list of pairs that were removed (collapsed) during this tick,
   * so external systems can clean up associated visuals.
   */
  update(delta: number): PortalPair[] {
    if (!this.running || !Number.isFinite(delta) || delta <= 0) {
      return [];
    }

    // 1. Tick existing pairs
    for (const pair of this.activePairs) {
      pair.update(delta);
    }

    // 2. Collect collapsed pairs for caller notification
    const collapsed = this.activePairs.filter((p) => p.isCollapsed());

    // 3. Remove collapsed pairs from the active set
    if (collapsed.length > 0) {
      this.activePairs = this.activePairs.filter((p) => !p.isCollapsed());
    }

    // 4. Advance spawn timer and spawn when due
    this.spawnTimerMs += delta;
    while (this.spawnTimerMs >= this.currentSpawnTargetMs) {
      this.spawnTimerMs -= this.currentSpawnTargetMs;
      this.trySpawnPair();
      this.currentSpawnTargetMs = this.rollSpawnTarget();
    }

    return collapsed;
  }

  // ── Spawning ─────────────────────────────────────────────────

  private trySpawnPair(): void {
    if (this.activePairs.length >= this.maxActivePairs) {
      return;
    }

    // Build a combined occupancy list: external checkers + existing portals
    const portalChecker: CellOccupancyChecker = (pos) =>
      this.isPortalCell(pos);

    const allCheckers = [...this.occupancyCheckers, portalChecker];

    const positions = findPortalSpawnPositions(allCheckers, this.rng);
    if (!positions) {
      return;
    }

    const [posA, posB] = positions;
    const pair = new PortalPair({
      id: generatePortalPairId(),
      positionA: posA,
      positionB: posB,
    });

    this.activePairs.push(pair);
  }

  /**
   * Roll a randomised spawn interval for the next cycle.
   *
   * Result is `baseInterval + random(-jitter, +jitter)`, clamped to >= 1.
   */
  private rollSpawnTarget(): number {
    if (this.spawnJitterMs <= 0) {
      return Math.max(1, this.spawnIntervalMs);
    }
    const jitter =
      (this.rng() * 2 - 1) * this.spawnJitterMs;
    return Math.max(1, this.spawnIntervalMs + jitter);
  }

  // ── Occupancy ────────────────────────────────────────────────

  /**
   * Set the list of external occupancy checkers used to determine
   * valid spawn cells. These should be provided by the scene or
   * game loop and cover snake, food, lava pools, etc.
   */
  setOccupancyCheckers(checkers: CellOccupancyChecker[]): void {
    this.occupancyCheckers = [...checkers];
  }

  /**
   * CellOccupancyChecker that returns true if the position is occupied
   * by any non-collapsed portal pair. Useful for external systems that
   * need to exclude portal cells from their own placement logic.
   */
  isPortalCell(pos: GridPos): boolean {
    return this.activePairs.some((pair) => pair.isOnPortal(pos));
  }

  // ── Queries ──────────────────────────────────────────────────

  /** All currently managed portal pairs (not yet removed). */
  getActivePairs(): readonly PortalPair[] {
    return this.activePairs;
  }

  /** Whether the manager is running. */
  isRunning(): boolean {
    return this.running;
  }

  /** Current spawn timer value (ms). */
  getSpawnTimerMs(): number {
    return this.spawnTimerMs;
  }

  /** The randomised target for the current spawn cycle (ms). */
  getCurrentSpawnTargetMs(): number {
    return this.currentSpawnTargetMs;
  }

  /** Set the RNG function (for deterministic testing / replay). */
  setRng(rng: () => number): void {
    this.rng = rng;
  }

  /** Get the current RNG function. */
  getRng(): () => number {
    return this.rng;
  }

  /**
   * Find the active (non-collapsed) portal pair that has an end at the
   * given position. Returns null if no match.
   */
  getPairAtPosition(pos: GridPos): PortalPair | null {
    return this.activePairs.find((pair) => pair.isOnPortal(pos)) ?? null;
  }

  /**
   * Force all active pairs to begin collapsing immediately.
   * Useful on game over or biome transitions.
   */
  collapseAll(): void {
    for (const pair of this.activePairs) {
      pair.beginCollapse();
    }
  }
}
