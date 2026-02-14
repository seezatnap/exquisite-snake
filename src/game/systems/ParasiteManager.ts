import type { Biome } from "./BiomeManager";
import type { GridPos } from "../utils/grid";
import {
  MAGNET_RADIUS_TILES,
  MAGNET_SPEED_BONUS_PER_SEGMENT,
  PARASITE_MAX_SEGMENTS,
  SPLITTER_OBSTACLE_INTERVAL_MS,
  createParasiteRuntimeState,
  cloneParasiteRuntimeState,
  countActiveParasitesByType,
  ParasiteType,
  type ParasiteRuntimeState,
} from "../entities/Parasite";

export type ParasiteActor = "snake" | "echo-ghost";
export type ParasiteCollisionKind =
  | "wall"
  | "self"
  | "echo-ghost"
  | "void-center"
  | "molten-lava"
  | "splitter-obstacle";
export type ParasiteScoreSource = "food" | "system" | "bonus";

export interface ParasiteMovementContext {
  actor: ParasiteActor;
  deltaMs: number;
  currentMoveIntervalMs: number;
  snakeSegments: readonly GridPos[];
  foodPosition: GridPos | null;
}

export interface ParasiteMovementResult {
  nextMoveIntervalMs: number;
  magnetSegments: number;
  magnetRadiusTiles: number;
  magnetSpeedBonusPerSegment: number;
}

export interface ParasiteCollisionContext {
  actor: ParasiteActor;
  kind: ParasiteCollisionKind;
  headPosition: GridPos;
}

export interface ParasiteCollisionResult {
  cancelGameOver: boolean;
  absorbedByShield: boolean;
  consumedShieldSegmentId: string | null;
}

export interface ParasiteFoodContactContext {
  actor: ParasiteActor;
  snakeHead: GridPos;
  foodPosition: GridPos;
}

export interface ParasiteFoodContactResult {
  allowConsume: boolean;
  blockedByShieldPenalty: boolean;
}

export interface ParasiteScoreContext {
  actor: ParasiteActor;
  source: ParasiteScoreSource;
  basePoints: number;
}

export interface ParasiteScoreResult {
  awardedPoints: number;
  multiplier: number;
}

export interface ParasiteBiomeTransitionContext {
  from: Biome;
  to: Biome;
}

/**
 * Parasite system orchestrator.
 *
 * Task #1 intentionally provides integration seams and shared state shape
 * without implementing Phase 4 ability behavior yet.
 */
export class ParasiteManager {
  private state: ParasiteRuntimeState = createParasiteRuntimeState();

  resetRun(): void {
    this.state = createParasiteRuntimeState();
  }

  /** Snapshot accessor for HUD/GameOver/QA integration and tests. */
  getState(): ParasiteRuntimeState {
    return cloneParasiteRuntimeState(this.state);
  }

  /** Snapshot mutator reserved for rewind/QA tooling. */
  restoreState(snapshot: ParasiteRuntimeState): void {
    this.state = cloneParasiteRuntimeState(snapshot);
  }

  advanceTimers(deltaMs: number): void {
    const safeDelta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
    if (safeDelta <= 0) {
      return;
    }
    this.state.timers.pickupSpawnElapsedMs += safeDelta;
    this.state.timers.splitterObstacleElapsedMs += safeDelta;
    this.state.timers.glowPulseElapsedMs += safeDelta;
  }

  /**
   * Movement hook seam:
   * - speed modifications for Magnet
   * - food pull checks for Magnet
   */
  onMovementTick(context: ParasiteMovementContext): ParasiteMovementResult {
    if (context.actor !== "snake") {
      return {
        nextMoveIntervalMs: context.currentMoveIntervalMs,
        magnetSegments: 0,
        magnetRadiusTiles: MAGNET_RADIUS_TILES,
        magnetSpeedBonusPerSegment: MAGNET_SPEED_BONUS_PER_SEGMENT,
      };
    }

    const magnetSegments = this.getMagnetSegmentCount();
    return {
      // Task #4 will apply speed scaling using magnet segment count.
      nextMoveIntervalMs: context.currentMoveIntervalMs,
      magnetSegments,
      magnetRadiusTiles: MAGNET_RADIUS_TILES,
      magnetSpeedBonusPerSegment: MAGNET_SPEED_BONUS_PER_SEGMENT,
    };
  }

  /**
   * Collision hook seam:
   * - Shield absorption (wall/self) before game-over finalization.
   * - Splitter obstacle collisions.
   */
  onCollisionCheck(context: ParasiteCollisionContext): ParasiteCollisionResult {
    void context;
    return {
      cancelGameOver: false,
      absorbedByShield: false,
      consumedShieldSegmentId: null,
    };
  }

  /**
   * Food-contact seam:
   * - Shield blocked-next-food state machine.
   * - Echo ghost exclusion.
   */
  onFoodContact(context: ParasiteFoodContactContext): ParasiteFoodContactResult {
    if (context.actor !== "snake") {
      return {
        allowConsume: false,
        blockedByShieldPenalty: false,
      };
    }

    return {
      allowConsume: true,
      blockedByShieldPenalty: false,
    };
  }

  /**
   * Score seam:
   * - Splitter multiplier application across score sources.
   * - Echo ghost exclusion.
   */
  onScoreEvent(context: ParasiteScoreContext): ParasiteScoreResult {
    if (context.actor !== "snake") {
      return {
        awardedPoints: 0,
        multiplier: 1,
      };
    }

    return {
      // Task #6 will apply Splitter multiplier here.
      awardedPoints: context.basePoints,
      multiplier: 1,
    };
  }

  onBiomeEnter(biome: Biome): void {
    void biome;
    // Hook reserved for biome-specific parasite lifecycle behavior.
  }

  onBiomeExit(biome: Biome): void {
    void biome;
    // Hook reserved for biome-specific parasite lifecycle behavior.
  }

  onBiomeTransition(transition: ParasiteBiomeTransitionContext): void {
    void transition;
    // Task #7 will clear Splitter obstacles on biome transitions.
  }

  onRunEnd(): void {
    // Hook reserved for run-finalization behavior.
  }

  getMagnetSegmentCount(): number {
    return countActiveParasitesByType(this.state, ParasiteType.Magnet);
  }

  getShieldSegmentCount(): number {
    return countActiveParasitesByType(this.state, ParasiteType.Shield);
  }

  getSplitterSegmentCount(): number {
    return countActiveParasitesByType(this.state, ParasiteType.Splitter);
  }

  getConstants(): {
    maxSegments: number;
    magnetRadiusTiles: number;
    magnetSpeedBonusPerSegment: number;
    splitterObstacleIntervalMs: number;
  } {
    return {
      maxSegments: PARASITE_MAX_SEGMENTS,
      magnetRadiusTiles: MAGNET_RADIUS_TILES,
      magnetSpeedBonusPerSegment: MAGNET_SPEED_BONUS_PER_SEGMENT,
      splitterObstacleIntervalMs: SPLITTER_OBSTACLE_INTERVAL_MS,
    };
  }
}
