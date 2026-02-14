import type { BiomeTransition } from "./BiomeManager";
import { GRID_COLS, GRID_ROWS } from "../config";
import {
  PARASITE_ECHO_GHOST_POLICY,
  PARASITE_MAGNET_SPEED_BONUS_PER_SEGMENT,
  PARASITE_MAX_SEGMENTS,
  PARASITE_SPLITTER_INTERVAL_MS,
  getParasitePickupRenderIdentity,
  Parasite,
  ParasiteType,
  type ParasiteInventoryState,
  type ParasiteObstacleState,
  type ParasitePickupState,
  type ParasitePickupRenderIdentity,
  type ParasiteSegmentState,
} from "../entities/Parasite";
import type { GridPos } from "../utils/grid";

export interface ParasiteMovementContext {
  deltaMs: number;
  head: GridPos;
  segments: readonly GridPos[];
}

export interface ParasiteCollisionContext {
  head: GridPos;
  wallCollision: boolean;
  selfCollision: boolean;
}

export type ParasiteScoreSource = "food" | "bonus" | "biome" | "other";

export interface ParasiteScoringContext {
  basePoints: number;
  source: ParasiteScoreSource;
}

export interface ParasiteBiomeChangeContext {
  transition: BiomeTransition;
}

export interface ParasiteEchoGhostContext {
  active: boolean;
  head: GridPos | null;
}

/**
 * Phase-3 integration contract expected by parasite features.
 * Actual gameplay wiring lands in later tasks.
 */
export interface ParasitePhase3Hooks {
  movement: (context: ParasiteMovementContext) => void;
  collision: (context: ParasiteCollisionContext) => void;
  scoring: (context: ParasiteScoringContext) => number;
  biomeChange: (context: ParasiteBiomeChangeContext) => void;
  echoGhost: (context: ParasiteEchoGhostContext) => void;
}

type ParasiteHookName = keyof ParasitePhase3Hooks;

const REQUIRED_PHASE3_HOOKS: readonly ParasiteHookName[] = [
  "movement",
  "collision",
  "scoring",
  "biomeChange",
  "echoGhost",
] as const;

export interface ParasitePhase3IntegrationReport {
  movement: boolean;
  collision: boolean;
  scoring: boolean;
  biomeChange: boolean;
  echoGhost: boolean;
  ready: boolean;
  missing: ParasiteHookName[];
}

export interface ParasiteTimerState {
  elapsedRunMs: number;
  pickupSpawnElapsedMs: number;
  splitterObstacleElapsedMs: number;
}

export interface ParasiteSharedState {
  pickups: ParasitePickupState[];
  inventory: ParasiteInventoryState;
  splitterObstacles: ParasiteObstacleState[];
  parasitesCollected: number;
  blockedFoodCharges: number;
  timers: ParasiteTimerState;
}

export interface ParasiteTimerTickResult {
  deltaMs: number;
  hasActiveSplitter: boolean;
  splitterTicksDue: number;
}

/** Base cadence for parasite pickup spawn checks. */
export const PARASITE_PICKUP_SPAWN_INTERVAL_MS = 8_000;

/** Probability [0,1] that a pickup is spawned each elapsed spawn interval. */
export const PARASITE_PICKUP_SPAWN_CHANCE_PER_INTERVAL = 0.2;

const PARASITE_PICKUP_TYPES: readonly ParasiteType[] = [
  ParasiteType.Magnet,
  ParasiteType.Shield,
  ParasiteType.Splitter,
] as const;

export interface ParasitePickupSpawnContext {
  snakeSegments: readonly GridPos[];
  foodPosition: GridPos | null;
  obstaclePositions?: readonly GridPos[];
  rng?: () => number;
  nowMs?: number;
}

export interface ParasiteSpawnedPickup {
  pickup: ParasitePickupState;
  render: ParasitePickupRenderIdentity;
}

export function createInitialParasiteTimerState(): ParasiteTimerState {
  return {
    elapsedRunMs: 0,
    pickupSpawnElapsedMs: 0,
    splitterObstacleElapsedMs: 0,
  };
}

export function createInitialParasiteSharedState(): ParasiteSharedState {
  return {
    pickups: [],
    inventory: {
      maxSegments: PARASITE_MAX_SEGMENTS,
      segments: [],
    },
    splitterObstacles: [],
    parasitesCollected: 0,
    blockedFoodCharges: 0,
    timers: createInitialParasiteTimerState(),
  };
}

export function countParasiteSegmentsByType(
  segments: readonly ParasiteSegmentState[],
  type: ParasiteType,
): number {
  return segments.reduce((count, segment) => {
    if (segment.type === type) {
      return count + 1;
    }
    return count;
  }, 0);
}

export function calculateMagnetSpeedMultiplier(magnetSegments: number): number {
  const safeCount = Number.isFinite(magnetSegments)
    ? Math.max(0, Math.floor(magnetSegments))
    : 0;
  const cappedCount = Math.min(PARASITE_MAX_SEGMENTS, safeCount);
  return 1 + cappedCount * PARASITE_MAGNET_SPEED_BONUS_PER_SEGMENT;
}

export function validatePhase3IntegrationPoints(
  hooks: Partial<ParasitePhase3Hooks>,
): ParasitePhase3IntegrationReport {
  const movement = typeof hooks.movement === "function";
  const collision = typeof hooks.collision === "function";
  const scoring = typeof hooks.scoring === "function";
  const biomeChange = typeof hooks.biomeChange === "function";
  const echoGhost = typeof hooks.echoGhost === "function";

  const report: ParasitePhase3IntegrationReport = {
    movement,
    collision,
    scoring,
    biomeChange,
    echoGhost,
    ready: false,
    missing: [],
  };

  for (const hookName of REQUIRED_PHASE3_HOOKS) {
    if (typeof hooks[hookName] !== "function") {
      report.missing.push(hookName);
    }
  }

  report.ready = report.missing.length === 0;
  return report;
}

function cloneGridPos(position: GridPos): GridPos {
  return {
    col: position.col,
    row: position.row,
  };
}

function clonePickupState(pickup: ParasitePickupState): ParasitePickupState {
  return {
    id: pickup.id,
    type: pickup.type,
    position: cloneGridPos(pickup.position),
    spawnedAtMs: pickup.spawnedAtMs,
  };
}

function cloneSegmentState(segment: ParasiteSegmentState): ParasiteSegmentState {
  return {
    id: segment.id,
    type: segment.type,
    attachedAtMs: segment.attachedAtMs,
    sourcePickupId: segment.sourcePickupId,
  };
}

function cloneObstacleState(obstacle: ParasiteObstacleState): ParasiteObstacleState {
  return {
    id: obstacle.id,
    position: cloneGridPos(obstacle.position),
    spawnedAtMs: obstacle.spawnedAtMs,
    sourceSegmentId: obstacle.sourceSegmentId,
  };
}

export function cloneParasiteSharedState(state: ParasiteSharedState): ParasiteSharedState {
  return {
    pickups: state.pickups.map(clonePickupState),
    inventory: {
      maxSegments: state.inventory.maxSegments,
      segments: state.inventory.segments.map(cloneSegmentState),
    },
    splitterObstacles: state.splitterObstacles.map(cloneObstacleState),
    parasitesCollected: state.parasitesCollected,
    blockedFoodCharges: state.blockedFoodCharges,
    timers: {
      elapsedRunMs: state.timers.elapsedRunMs,
      pickupSpawnElapsedMs: state.timers.pickupSpawnElapsedMs,
      splitterObstacleElapsedMs: state.timers.splitterObstacleElapsedMs,
    },
  };
}

function normalizeDeltaMs(deltaMs: number): number {
  if (!Number.isFinite(deltaMs)) {
    return 0;
  }
  return Math.max(0, Math.floor(deltaMs));
}

function normalizeTimestampMs(timestampMs: number): number {
  if (!Number.isFinite(timestampMs)) {
    return 0;
  }
  return Math.max(0, Math.floor(timestampMs));
}

function normalizeRandomSample(rng: () => number): number {
  const sample = rng();
  if (!Number.isFinite(sample)) {
    return 0;
  }
  if (sample <= 0) {
    return 0;
  }
  if (sample >= 1) {
    return 0.999_999_999_999;
  }
  return sample;
}

function sampleIndex(length: number, rng: () => number): number {
  if (length <= 1) {
    return 0;
  }
  const clampedLength = Math.max(1, Math.floor(length));
  return Math.min(
    clampedLength - 1,
    Math.floor(normalizeRandomSample(rng) * clampedLength),
  );
}

function gridPosKey(position: GridPos): string {
  return `${position.col}:${position.row}`;
}

/**
 * Phase-4 manager for parasite runtime state and pickup spawning.
 */
export class ParasiteManager {
  private state: ParasiteSharedState;
  private phase3Hooks: Partial<ParasitePhase3Hooks> = {};

  constructor(initialState: ParasiteSharedState = createInitialParasiteSharedState()) {
    this.state = cloneParasiteSharedState(initialState);
  }

  resetRun(): void {
    this.state = createInitialParasiteSharedState();
  }

  setPhase3Hooks(hooks: Partial<ParasitePhase3Hooks>): ParasitePhase3IntegrationReport {
    this.phase3Hooks = {
      ...this.phase3Hooks,
      ...hooks,
    };
    return validatePhase3IntegrationPoints(this.phase3Hooks);
  }

  getPhase3IntegrationReport(): ParasitePhase3IntegrationReport {
    return validatePhase3IntegrationPoints(this.phase3Hooks);
  }

  isEchoGhostExcludedFromParasites(): boolean {
    return (
      PARASITE_ECHO_GHOST_POLICY.ignoresPickups &&
      PARASITE_ECHO_GHOST_POLICY.ignoresObstacles &&
      PARASITE_ECHO_GHOST_POLICY.ignoresParasiteEffects
    );
  }

  getState(): ParasiteSharedState {
    return cloneParasiteSharedState(this.state);
  }

  replaceState(nextState: ParasiteSharedState): void {
    this.state = cloneParasiteSharedState(nextState);
  }

  getMagnetSpeedMultiplier(): number {
    const magnetSegments = countParasiteSegmentsByType(
      this.state.inventory.segments,
      ParasiteType.Magnet,
    );
    return calculateMagnetSpeedMultiplier(magnetSegments);
  }

  getPickupSpawnCandidates(context: ParasitePickupSpawnContext): GridPos[] {
    const occupied = this.collectOccupiedCellKeys(context);
    const candidates: GridPos[] = [];

    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        const position: GridPos = { col, row };
        if (occupied.has(gridPosKey(position))) {
          continue;
        }
        candidates.push(position);
      }
    }

    return candidates;
  }

  spawnPickupIfDue(
    context: ParasitePickupSpawnContext,
  ): ParasiteSpawnedPickup | null {
    if (this.state.timers.pickupSpawnElapsedMs < PARASITE_PICKUP_SPAWN_INTERVAL_MS) {
      return null;
    }

    const rng = context.rng ?? Math.random;
    const spawnedAtMs = normalizeTimestampMs(
      context.nowMs ?? this.state.timers.elapsedRunMs,
    );
    let spawned: ParasiteSpawnedPickup | null = null;

    while (this.state.timers.pickupSpawnElapsedMs >= PARASITE_PICKUP_SPAWN_INTERVAL_MS) {
      this.state.timers.pickupSpawnElapsedMs -= PARASITE_PICKUP_SPAWN_INTERVAL_MS;

      if (spawned !== null) {
        continue;
      }

      if (normalizeRandomSample(rng) >= PARASITE_PICKUP_SPAWN_CHANCE_PER_INTERVAL) {
        continue;
      }

      const candidates = this.getPickupSpawnCandidates(context);
      if (candidates.length === 0) {
        continue;
      }

      const spawnPos = candidates[sampleIndex(candidates.length, rng)];
      const spawnType = this.samplePickupType(rng);
      const parasite = new Parasite(spawnType, spawnPos, spawnedAtMs);
      const pickup = parasite.toPickupState();

      this.state.pickups.push(pickup);
      spawned = {
        pickup: clonePickupState(pickup),
        render: getParasitePickupRenderIdentity(spawnType),
      };
    }

    return spawned;
  }

  advanceTimers(deltaMs: number): ParasiteTimerTickResult {
    const safeDelta = normalizeDeltaMs(deltaMs);
    if (safeDelta <= 0) {
      return {
        deltaMs: 0,
        hasActiveSplitter: this.hasActiveSegmentType(ParasiteType.Splitter),
        splitterTicksDue: 0,
      };
    }

    this.state.timers.elapsedRunMs += safeDelta;
    this.state.timers.pickupSpawnElapsedMs += safeDelta;

    const hasActiveSplitter = this.hasActiveSegmentType(ParasiteType.Splitter);
    if (!hasActiveSplitter) {
      this.state.timers.splitterObstacleElapsedMs = 0;
      return {
        deltaMs: safeDelta,
        hasActiveSplitter: false,
        splitterTicksDue: 0,
      };
    }

    this.state.timers.splitterObstacleElapsedMs += safeDelta;
    let splitterTicksDue = 0;
    while (this.state.timers.splitterObstacleElapsedMs >= PARASITE_SPLITTER_INTERVAL_MS) {
      this.state.timers.splitterObstacleElapsedMs -= PARASITE_SPLITTER_INTERVAL_MS;
      splitterTicksDue += 1;
    }

    return {
      deltaMs: safeDelta,
      hasActiveSplitter: true,
      splitterTicksDue,
    };
  }

  private hasActiveSegmentType(type: ParasiteType): boolean {
    return this.state.inventory.segments.some((segment) => segment.type === type);
  }

  private collectOccupiedCellKeys(context: ParasitePickupSpawnContext): Set<string> {
    const occupied = new Set<string>();

    for (const segmentPos of context.snakeSegments) {
      occupied.add(gridPosKey(segmentPos));
    }

    if (context.foodPosition) {
      occupied.add(gridPosKey(context.foodPosition));
    }

    for (const obstaclePos of context.obstaclePositions ?? []) {
      occupied.add(gridPosKey(obstaclePos));
    }

    for (const obstacle of this.state.splitterObstacles) {
      occupied.add(gridPosKey(obstacle.position));
    }

    for (const pickup of this.state.pickups) {
      occupied.add(gridPosKey(pickup.position));
    }

    return occupied;
  }

  private samplePickupType(rng: () => number): ParasiteType {
    const typeIndex = sampleIndex(PARASITE_PICKUP_TYPES.length, rng);
    return PARASITE_PICKUP_TYPES[typeIndex];
  }
}
