import type { Biome } from "./BiomeManager";
import { GRID_COLS, GRID_ROWS } from "../config";
import type { GridPos } from "../utils/grid";
import {
  MAGNET_RADIUS_TILES,
  MAGNET_SPEED_BONUS_PER_SEGMENT,
  PARASITE_MAX_SEGMENTS,
  PARASITE_PICKUP_SPAWN_CHANCE_PER_INTERVAL,
  PARASITE_PICKUP_SPAWN_INTERVAL_MS,
  PARASITE_TYPES,
  SPLITTER_SCORE_MULTIPLIER,
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

export interface ParasitePickupSpawnContext {
  snakeSegments: readonly GridPos[];
  foodPosition: GridPos | null;
  obstaclePositions?: readonly GridPos[];
  rng?: () => number;
}

export interface ParasitePickupContactContext {
  actor: ParasiteActor;
  headPosition: GridPos;
}

export interface ParasitePickupContactResult {
  consumed: boolean;
  attachedSegmentId: string | null;
  shedSegmentId: string | null;
}

/**
 * Parasite system orchestrator.
 *
 * Phase 4 integration surface for parasite pickup/state mechanics.
 * Behavior is implemented incrementally across task slices.
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
   * Spawn hook for on-board parasite pickups.
   *
   * Pickups are attempted on a fixed cadence with probability checks,
   * and only occupy cells that are empty of snake, food, and obstacles.
   */
  updatePickupSpawn(context: ParasitePickupSpawnContext): void {
    if (this.state.pickup) {
      return;
    }

    const spawnAttempts = Math.floor(
      this.state.timers.pickupSpawnElapsedMs / PARASITE_PICKUP_SPAWN_INTERVAL_MS,
    );
    if (spawnAttempts <= 0) {
      return;
    }

    this.state.timers.pickupSpawnElapsedMs -=
      spawnAttempts * PARASITE_PICKUP_SPAWN_INTERVAL_MS;

    const rng = context.rng ?? Math.random;
    for (let attempt = 0; attempt < spawnAttempts; attempt++) {
      if (this.sampleUnit(rng) >= PARASITE_PICKUP_SPAWN_CHANCE_PER_INTERVAL) {
        continue;
      }

      const position = this.pickRandomPickupCell(context, rng);
      if (!position) {
        return;
      }

      const type = this.pickRandomParasiteType(rng);
      this.state.pickup = {
        id: `pickup-${this.state.nextEntityId}`,
        type,
        position,
        spawnedAtMs: this.state.timers.glowPulseElapsedMs,
      };
      this.state.nextEntityId += 1;
      return;
    }
  }

  /**
   * Splitter obstacle spawn hook.
   *
   * While at least one Splitter segment is attached, place one stationary
   * obstacle every fixed interval on a random empty cell.
   */
  updateSplitterObstacleSpawn(context: ParasitePickupSpawnContext): void {
    if (this.getSplitterSegmentCount() <= 0) {
      // Only count attached time toward the splitter cadence.
      this.state.timers.splitterObstacleElapsedMs = 0;
      return;
    }

    const spawnAttempts = Math.floor(
      this.state.timers.splitterObstacleElapsedMs / SPLITTER_OBSTACLE_INTERVAL_MS,
    );
    if (spawnAttempts <= 0) {
      return;
    }

    this.state.timers.splitterObstacleElapsedMs -=
      spawnAttempts * SPLITTER_OBSTACLE_INTERVAL_MS;

    const rng = context.rng ?? Math.random;
    for (let attempt = 0; attempt < spawnAttempts; attempt++) {
      const position = this.pickRandomObstacleCell(context, rng);
      if (!position) {
        return;
      }

      this.state.splitterObstacles.push({
        id: `obstacle-${this.state.nextEntityId}`,
        position,
        spawnedAtMs: this.state.timers.glowPulseElapsedMs,
      });
      this.state.nextEntityId += 1;
    }
  }

  /**
   * Pickup-contact seam:
   * - consume parasite pickup on snake contact
   * - attach a new active segment
   * - enforce max-segment FIFO shedding
   * - increment run-level collection counter
   */
  onPickupContact(
    context: ParasitePickupContactContext,
  ): ParasitePickupContactResult {
    const pickup = this.state.pickup;
    if (context.actor !== "snake" || !pickup) {
      return {
        consumed: false,
        attachedSegmentId: null,
        shedSegmentId: null,
      };
    }

    if (
      pickup.position.col !== context.headPosition.col ||
      pickup.position.row !== context.headPosition.row
    ) {
      return {
        consumed: false,
        attachedSegmentId: null,
        shedSegmentId: null,
      };
    }

    this.state.pickup = null;
    const attachedSegmentId = `segment-${this.state.nextEntityId}`;
    this.state.nextEntityId += 1;
    this.state.activeSegments.push({
      id: attachedSegmentId,
      type: pickup.type,
      attachedAtMs: this.state.timers.glowPulseElapsedMs,
    });

    let shedSegmentId: string | null = null;
    if (this.state.activeSegments.length > PARASITE_MAX_SEGMENTS) {
      shedSegmentId = this.state.activeSegments.shift()?.id ?? null;
    }

    this.state.counters.collected += 1;
    return {
      consumed: true,
      attachedSegmentId,
      shedSegmentId,
    };
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

    const basePoints = Number.isFinite(context.basePoints)
      ? context.basePoints
      : 0;
    const hasSplitter = this.getSplitterSegmentCount() > 0;
    const multiplier = hasSplitter && basePoints > 0
      ? SPLITTER_SCORE_MULTIPLIER
      : 1;

    return {
      awardedPoints: basePoints * multiplier,
      multiplier,
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
    this.clearSplitterObstacles();
  }

  onRunEnd(): void {
    this.clearSplitterObstacles();
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

  private pickRandomPickupCell(
    context: ParasitePickupSpawnContext,
    rng: () => number,
  ): GridPos | null {
    return this.pickRandomEmptyCell(context, rng, false);
  }

  private pickRandomObstacleCell(
    context: ParasitePickupSpawnContext,
    rng: () => number,
  ): GridPos | null {
    return this.pickRandomEmptyCell(context, rng, true);
  }

  private pickRandomEmptyCell(
    context: ParasitePickupSpawnContext,
    rng: () => number,
    includeActivePickup: boolean,
  ): GridPos | null {
    const occupied = this.collectOccupiedCells(context, includeActivePickup);
    const freeCells: GridPos[] = [];
    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        const pos = { col, row };
        if (!occupied.has(this.gridPosKey(pos))) {
          freeCells.push(pos);
        }
      }
    }

    if (freeCells.length === 0) {
      return null;
    }

    const cellIndex = Math.floor(this.sampleUnit(rng) * freeCells.length);
    return freeCells[cellIndex];
  }

  private collectOccupiedCells(
    context: ParasitePickupSpawnContext,
    includeActivePickup: boolean,
  ): Set<string> {
    const occupied = new Set<string>();

    for (const segment of context.snakeSegments) {
      occupied.add(this.gridPosKey(segment));
    }
    if (context.foodPosition) {
      occupied.add(this.gridPosKey(context.foodPosition));
    }
    if (includeActivePickup && this.state.pickup) {
      occupied.add(this.gridPosKey(this.state.pickup.position));
    }

    for (const obstacle of this.state.splitterObstacles) {
      occupied.add(this.gridPosKey(obstacle.position));
    }

    const externalObstacles = context.obstaclePositions ?? [];
    for (const obstacle of externalObstacles) {
      occupied.add(this.gridPosKey(obstacle));
    }

    return occupied;
  }

  private clearSplitterObstacles(): void {
    this.state.splitterObstacles = [];
    this.state.timers.splitterObstacleElapsedMs = 0;
  }

  private pickRandomParasiteType(rng: () => number): ParasiteType {
    const index = Math.floor(this.sampleUnit(rng) * PARASITE_TYPES.length);
    return PARASITE_TYPES[index] ?? PARASITE_TYPES[PARASITE_TYPES.length - 1];
  }

  private sampleUnit(rng: () => number): number {
    const raw = rng();
    if (!Number.isFinite(raw)) {
      return 0;
    }
    if (raw <= 0) {
      return 0;
    }
    if (raw >= 1) {
      return 0.999999;
    }
    return raw;
  }

  private gridPosKey(pos: GridPos): string {
    return `${pos.col}:${pos.row}`;
  }
}
