import { GRID_COLS, GRID_ROWS } from "../config";
import {
  DEFAULT_PORTAL_LIFECYCLE_DURATIONS,
  Portal,
  pickRandomEmptyPortalPairCells,
  type PortalEndpoint,
  type PortalLifecycleDurations,
  type PortalLifecycleTransition,
} from "../entities/Portal";
import type { GridPos } from "../utils/grid";

export interface PortalSpawnIntervalRangeMs {
  minMs: number;
  maxMs: number;
}

export interface PortalManagerOptions {
  rng?: () => number;
  gridCols?: number;
  gridRows?: number;
  spawnIntervalRangeMs?: Partial<PortalSpawnIntervalRangeMs>;
  minPairManhattanDistance?: number;
  pairIdPrefix?: string;
  lifecycleDurations?: Partial<PortalLifecycleDurations>;
}

export interface PortalSpawnContext {
  occupiedCells?: Iterable<GridPos>;
  blockedCells?: Iterable<GridPos>;
}

export interface PortalSpawnEvent {
  pairId: string;
  endpoints: readonly [GridPos, GridPos];
}

export interface PortalLifecycleTransitionEvent {
  pairId: string;
  transition: PortalLifecycleTransition;
}

export interface PortalManagerUpdateResult {
  spawnedPairs: PortalSpawnEvent[];
  lifecycleTransitions: PortalLifecycleTransitionEvent[];
  despawnedPairIds: string[];
}

export const DEFAULT_PORTAL_SPAWN_INTERVAL_RANGE_MS: PortalSpawnIntervalRangeMs = {
  minMs: 25_000,
  maxMs: 35_000,
};

export const DEFAULT_PORTAL_PAIR_ID_PREFIX = "portal-pair";

const RANDOM_MAX_EXCLUSIVE = 0.9999999999999999;

export class PortalManager {
  private readonly gridCols: number;
  private readonly gridRows: number;
  private readonly minPairManhattanDistance: number;
  private readonly lifecycleDurations: PortalLifecycleDurations;
  private readonly pairIdPrefix: string;

  private readonly spawnIntervalRangeMs: PortalSpawnIntervalRangeMs;

  private rng: () => number;
  private running = false;
  private activePortal: Portal | null = null;
  private msUntilNextSpawn = 0;
  private pairSequence = 0;

  constructor(options: PortalManagerOptions = {}) {
    this.gridCols = sanitizeGridSize(options.gridCols, GRID_COLS);
    this.gridRows = sanitizeGridSize(options.gridRows, GRID_ROWS);
    this.minPairManhattanDistance = sanitizeNonNegativeInt(
      options.minPairManhattanDistance,
      0,
    );
    this.spawnIntervalRangeMs = normalizeSpawnIntervalRangeMs(
      options.spawnIntervalRangeMs,
    );
    this.pairIdPrefix = normalizePairIdPrefix(options.pairIdPrefix);
    this.lifecycleDurations = {
      spawningMs: sanitizeNonNegativeInt(
        options.lifecycleDurations?.spawningMs,
        DEFAULT_PORTAL_LIFECYCLE_DURATIONS.spawningMs,
      ),
      activeMs: sanitizeNonNegativeInt(
        options.lifecycleDurations?.activeMs,
        DEFAULT_PORTAL_LIFECYCLE_DURATIONS.activeMs,
      ),
      collapsingMs: sanitizeNonNegativeInt(
        options.lifecycleDurations?.collapsingMs,
        DEFAULT_PORTAL_LIFECYCLE_DURATIONS.collapsingMs,
      ),
    };
    this.rng = normalizeRng(options.rng);
    this.resetRun();
  }

  startRun(): void {
    this.resetRun();
    this.running = true;
  }

  stopRun(): void {
    this.running = false;
  }

  resetRun(): void {
    this.running = false;
    this.activePortal = null;
    this.pairSequence = 0;
    this.msUntilNextSpawn = this.rollNextSpawnIntervalMs();
  }

  update(
    deltaMs: number,
    spawnContext: PortalSpawnContext = {},
  ): PortalManagerUpdateResult {
    const result = createEmptyUpdateResult();
    const safeDeltaMs = sanitizeDelta(deltaMs);
    if (!this.running || safeDeltaMs <= 0) {
      return result;
    }

    let remainingMs = safeDeltaMs;
    while (remainingMs > 0) {
      const timeToSpawnMs = this.msUntilNextSpawn;
      const timeToDespawnMs = this.activePortal
        ? this.activePortal.getMsUntilDespawn()
        : Number.POSITIVE_INFINITY;

      const timeToNextEventMs = Math.min(
        remainingMs,
        timeToSpawnMs,
        timeToDespawnMs,
      );
      const advancedMs = Math.max(0, timeToNextEventMs);
      if (advancedMs > 0) {
        this.advanceTimers(advancedMs, result.lifecycleTransitions);
        remainingMs -= advancedMs;
      }

      const hadEvent = this.processDueEvents(spawnContext, result);
      if (advancedMs <= 0 && !hadEvent) {
        break;
      }
    }

    return result;
  }

  isRunning(): boolean {
    return this.running;
  }

  getMsUntilNextSpawn(): number {
    return this.msUntilNextSpawn;
  }

  getSpawnIntervalRangeMs(): PortalSpawnIntervalRangeMs {
    return { ...this.spawnIntervalRangeMs };
  }

  getActivePortal(): Portal | null {
    return this.activePortal;
  }

  getActivePortalEndpoints(): readonly [PortalEndpoint, PortalEndpoint] | null {
    return this.activePortal ? this.activePortal.getEndpoints() : null;
  }

  getExitPositionForEntryCell(entryCell: GridPos): GridPos | null {
    return this.activePortal?.getExitPositionForEntryCell(entryCell) ?? null;
  }

  private advanceTimers(
    deltaMs: number,
    transitions: PortalLifecycleTransitionEvent[],
  ): void {
    this.msUntilNextSpawn = Math.max(0, this.msUntilNextSpawn - deltaMs);
    if (!this.activePortal) {
      return;
    }

    const pairId = this.activePortal.getPairId();
    const portalTransitions = this.activePortal.advance(deltaMs);
    for (const transition of portalTransitions) {
      transitions.push({ pairId, transition });
    }
  }

  private processDueEvents(
    spawnContext: PortalSpawnContext,
    result: PortalManagerUpdateResult,
  ): boolean {
    let handledEvent = false;

    if (this.activePortal?.isCollapsed()) {
      result.despawnedPairIds.push(this.activePortal.getPairId());
      this.activePortal = null;
      handledEvent = true;
    }

    if (this.msUntilNextSpawn <= 0) {
      handledEvent = true;
      if (!this.activePortal) {
        const spawnedPortal = this.trySpawnPortal(spawnContext);
        if (spawnedPortal) {
          const [a, b] = spawnedPortal.getEndpoints();
          result.spawnedPairs.push({
            pairId: spawnedPortal.getPairId(),
            endpoints: [
              cloneGridPos(a.position),
              cloneGridPos(b.position),
            ] as const,
          });
        }
      }
      this.msUntilNextSpawn = this.rollNextSpawnIntervalMs();
    }

    return handledEvent;
  }

  private trySpawnPortal(spawnContext: PortalSpawnContext): Portal | null {
    const endpoints = pickRandomEmptyPortalPairCells({
      gridCols: this.gridCols,
      gridRows: this.gridRows,
      occupiedCells: spawnContext.occupiedCells,
      blockedCells: spawnContext.blockedCells,
      minManhattanDistance: this.minPairManhattanDistance,
      rng: this.rng,
    });
    if (!endpoints) {
      return null;
    }

    const portal = new Portal({
      pairId: `${this.pairIdPrefix}-${this.pairSequence + 1}`,
      endpoints,
      lifecycleDurations: this.lifecycleDurations,
    });
    this.pairSequence += 1;
    this.activePortal = portal;
    return portal;
  }

  private rollNextSpawnIntervalMs(): number {
    const { minMs, maxMs } = this.spawnIntervalRangeMs;
    if (minMs === maxMs) {
      return minMs;
    }
    const spanMs = maxMs - minMs;
    const randomOffset = Math.floor(sampleRng(this.rng) * (spanMs + 1));
    return minMs + randomOffset;
  }
}

function createEmptyUpdateResult(): PortalManagerUpdateResult {
  return {
    spawnedPairs: [],
    lifecycleTransitions: [],
    despawnedPairIds: [],
  };
}

function normalizeSpawnIntervalRangeMs(
  range: Partial<PortalSpawnIntervalRangeMs> | undefined,
): PortalSpawnIntervalRangeMs {
  const minMs = sanitizePositiveInt(
    range?.minMs,
    DEFAULT_PORTAL_SPAWN_INTERVAL_RANGE_MS.minMs,
  );
  const maxCandidateMs = sanitizePositiveInt(
    range?.maxMs,
    DEFAULT_PORTAL_SPAWN_INTERVAL_RANGE_MS.maxMs,
  );
  return { minMs, maxMs: Math.max(minMs, maxCandidateMs) };
}

function sanitizeGridSize(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(value!));
}

function sanitizeDelta(deltaMs: number): number {
  if (!Number.isFinite(deltaMs)) {
    return 0;
  }
  return Math.max(0, deltaMs);
}

function sanitizePositiveInt(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) {
    return Math.max(1, Math.floor(fallback));
  }
  return Math.max(1, Math.floor(value!));
}

function sanitizeNonNegativeInt(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) {
    return Math.max(0, Math.floor(fallback));
  }
  return Math.max(0, Math.floor(value!));
}

function normalizePairIdPrefix(prefix: string | undefined): string {
  const candidate = (prefix ?? DEFAULT_PORTAL_PAIR_ID_PREFIX).trim();
  return candidate.length > 0 ? candidate : DEFAULT_PORTAL_PAIR_ID_PREFIX;
}

function normalizeRng(rng: (() => number) | undefined): () => number {
  return typeof rng === "function" ? rng : Math.random;
}

function sampleRng(rng: () => number): number {
  const raw = rng();
  if (!Number.isFinite(raw) || raw <= 0) {
    return 0;
  }
  if (raw >= 1) {
    return RANDOM_MAX_EXCLUSIVE;
  }
  return raw;
}

function cloneGridPos(pos: GridPos): GridPos {
  return { col: pos.col, row: pos.row };
}
