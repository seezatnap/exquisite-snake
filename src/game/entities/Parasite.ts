import type { GridPos } from "../utils/grid";

/**
 * Supported parasite archetypes.
 * These map directly to the Phase 4 design/spec terminology.
 */
export enum ParasiteType {
  Magnet = "magnet",
  Shield = "shield",
  Splitter = "splitter",
}

/** Stable ordered list used by HUD slots and deterministic pick logic. */
export const PARASITE_TYPES: readonly ParasiteType[] = [
  ParasiteType.Magnet,
  ParasiteType.Shield,
  ParasiteType.Splitter,
] as const;

/** Hard cap on simultaneously attached parasite segments. */
export const PARASITE_MAX_SEGMENTS = 3;

/** Magnet parasite pull radius in Manhattan tiles. */
export const MAGNET_RADIUS_TILES = 2;

/** Additional snake speed multiplier per attached Magnet segment. */
export const MAGNET_SPEED_BONUS_PER_SEGMENT = 0.1;

/** Splitter obstacle spawn cadence while Splitter is attached. */
export const SPLITTER_OBSTACLE_INTERVAL_MS = 10_000;

/** Score multiplier while a Splitter parasite is attached. */
export const SPLITTER_SCORE_MULTIPLIER = 1.5;

/** Spec-driven parasite color accents (used for pickup/segment rendering). */
export const PARASITE_COLORS: Record<ParasiteType, number> = {
  [ParasiteType.Magnet]: 0xffd166, // gold
  [ParasiteType.Shield]: 0x00f0ff, // cyan
  [ParasiteType.Splitter]: 0x39d98a, // green
};

export interface ParasitePickup {
  id: string;
  type: ParasiteType;
  position: GridPos;
  spawnedAtMs: number;
}

export interface ParasiteSegment {
  id: string;
  type: ParasiteType;
  attachedAtMs: number;
}

export interface ParasiteObstacle {
  id: string;
  position: GridPos;
  spawnedAtMs: number;
}

export interface ParasiteTimers {
  pickupSpawnElapsedMs: number;
  splitterObstacleElapsedMs: number;
  glowPulseElapsedMs: number;
}

export interface ParasiteFlags {
  blockNextFoodPickup: boolean;
}

export interface ParasiteCounters {
  collected: number;
}

/**
 * Shared mutable parasite runtime state for one gameplay run.
 *
 * Notes:
 * - `activeSegments` ordering is oldest -> newest (enables FIFO shedding).
 * - `nextEntityId` is deterministic and increment-only per run.
 */
export interface ParasiteRuntimeState {
  pickup: ParasitePickup | null;
  activeSegments: ParasiteSegment[];
  splitterObstacles: ParasiteObstacle[];
  timers: ParasiteTimers;
  flags: ParasiteFlags;
  counters: ParasiteCounters;
  nextEntityId: number;
}

function cloneGridPos(pos: GridPos): GridPos {
  return { col: pos.col, row: pos.row };
}

export function createParasiteTimers(): ParasiteTimers {
  return {
    pickupSpawnElapsedMs: 0,
    splitterObstacleElapsedMs: 0,
    glowPulseElapsedMs: 0,
  };
}

export function createParasiteRuntimeState(): ParasiteRuntimeState {
  return {
    pickup: null,
    activeSegments: [],
    splitterObstacles: [],
    timers: createParasiteTimers(),
    flags: {
      blockNextFoodPickup: false,
    },
    counters: {
      collected: 0,
    },
    nextEntityId: 1,
  };
}

export function cloneParasiteRuntimeState(
  state: ParasiteRuntimeState,
): ParasiteRuntimeState {
  return {
    pickup: state.pickup
      ? {
        id: state.pickup.id,
        type: state.pickup.type,
        position: cloneGridPos(state.pickup.position),
        spawnedAtMs: state.pickup.spawnedAtMs,
      }
      : null,
    activeSegments: state.activeSegments.map((segment) => ({
      id: segment.id,
      type: segment.type,
      attachedAtMs: segment.attachedAtMs,
    })),
    splitterObstacles: state.splitterObstacles.map((obstacle) => ({
      id: obstacle.id,
      position: cloneGridPos(obstacle.position),
      spawnedAtMs: obstacle.spawnedAtMs,
    })),
    timers: { ...state.timers },
    flags: { ...state.flags },
    counters: { ...state.counters },
    nextEntityId: state.nextEntityId,
  };
}

export function countActiveParasitesByType(
  state: ParasiteRuntimeState,
  type: ParasiteType,
): number {
  return state.activeSegments.filter((segment) => segment.type === type).length;
}

