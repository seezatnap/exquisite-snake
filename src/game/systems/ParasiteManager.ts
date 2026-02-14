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
  baseMoveIntervalMs?: number;
  snakeSegments: readonly GridPos[];
  foodPosition: GridPos | null;
  blockedFoodCells?: readonly GridPos[];
}

export interface ParasiteMovementResult {
  nextMoveIntervalMs: number;
  magnetSegments: number;
  magnetRadiusTiles: number;
  magnetSpeedBonusPerSegment: number;
  pulledFoodPosition: GridPos | null;
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
  private previousMagnetSegmentCount = 0;

  resetRun(): void {
    this.state = createParasiteRuntimeState();
    this.previousMagnetSegmentCount = 0;
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
        pulledFoodPosition: null,
      };
    }

    const magnetSegments = this.getMagnetSegmentCount();
    const baseMoveIntervalMs = Number.isFinite(context.baseMoveIntervalMs)
      ? Math.max(1, context.baseMoveIntervalMs ?? context.currentMoveIntervalMs)
      : context.currentMoveIntervalMs;
    const speedMultiplier = 1 + magnetSegments * MAGNET_SPEED_BONUS_PER_SEGMENT;
    let nextMoveIntervalMs = context.currentMoveIntervalMs;
    if (magnetSegments > 0) {
      nextMoveIntervalMs = baseMoveIntervalMs / speedMultiplier;
    } else if (this.previousMagnetSegmentCount > 0) {
      nextMoveIntervalMs = baseMoveIntervalMs;
    }
    const pulledFoodPosition = this.resolveMagnetFoodPull(context, magnetSegments);
    this.previousMagnetSegmentCount = magnetSegments;

    return {
      nextMoveIntervalMs,
      magnetSegments,
      magnetRadiusTiles: MAGNET_RADIUS_TILES,
      magnetSpeedBonusPerSegment: MAGNET_SPEED_BONUS_PER_SEGMENT,
      pulledFoodPosition,
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
    this.previousMagnetSegmentCount = 0;
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
    const occupied = new Set<string>();

    for (const segment of context.snakeSegments) {
      occupied.add(this.gridPosKey(segment));
    }
    if (context.foodPosition) {
      occupied.add(this.gridPosKey(context.foodPosition));
    }

    for (const obstacle of this.state.splitterObstacles) {
      occupied.add(this.gridPosKey(obstacle.position));
    }

    const externalObstacles = context.obstaclePositions ?? [];
    for (const obstacle of externalObstacles) {
      occupied.add(this.gridPosKey(obstacle));
    }

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

  private resolveMagnetFoodPull(
    context: ParasiteMovementContext,
    magnetSegments: number,
  ): GridPos | null {
    if (!context.foodPosition || magnetSegments <= 0) {
      return null;
    }
    const foodPosition = context.foodPosition;

    const anchorSegments = this.getMagnetAnchorSegments(context.snakeSegments);
    if (anchorSegments.length <= 0) {
      return null;
    }

    const inRangeAnchors = anchorSegments
      .map((anchor, index) => ({
        anchor,
        index,
        distance: this.getManhattanDistance(anchor, foodPosition),
      }))
      .filter((candidate) =>
        candidate.distance > 0 && candidate.distance <= MAGNET_RADIUS_TILES
      )
      .sort((a, b) => a.distance - b.distance || a.index - b.index);

    if (inRangeAnchors.length <= 0) {
      return null;
    }

    const blockedCells = this.buildFoodBlockedCellSet(context);
    blockedCells.delete(this.gridPosKey(foodPosition));

    for (const candidate of inRangeAnchors) {
      const stepOptions = this.getMagnetStepCandidates(
        foodPosition,
        candidate.anchor,
      );
      for (const step of stepOptions) {
        if (!this.isFoodPullCellValid(step, blockedCells)) {
          continue;
        }
        return step;
      }
    }

    return null;
  }

  private getMagnetAnchorSegments(snakeSegments: readonly GridPos[]): GridPos[] {
    if (snakeSegments.length <= 0) {
      return [];
    }

    const bodyTailToHead = snakeSegments.slice(1).reverse();
    const fallbackSegment = snakeSegments[snakeSegments.length - 1];
    const anchors: GridPos[] = [];

    for (let index = 0; index < this.state.activeSegments.length; index++) {
      const parasiteSegment = this.state.activeSegments[index];
      if (parasiteSegment.type !== ParasiteType.Magnet) {
        continue;
      }
      const anchor = bodyTailToHead[index] ?? fallbackSegment;
      if (anchor) {
        anchors.push(anchor);
      }
    }

    return anchors;
  }

  private buildFoodBlockedCellSet(
    context: ParasiteMovementContext,
  ): Set<string> {
    const blocked = new Set<string>();

    for (const segment of context.snakeSegments) {
      blocked.add(this.gridPosKey(segment));
    }
    if (this.state.pickup) {
      blocked.add(this.gridPosKey(this.state.pickup.position));
    }
    for (const obstacle of this.state.splitterObstacles) {
      blocked.add(this.gridPosKey(obstacle.position));
    }
    for (const blockedPos of context.blockedFoodCells ?? []) {
      blocked.add(this.gridPosKey(blockedPos));
    }

    return blocked;
  }

  private getMagnetStepCandidates(food: GridPos, anchor: GridPos): GridPos[] {
    const deltaCol = anchor.col - food.col;
    const deltaRow = anchor.row - food.row;
    const colStep = Math.sign(deltaCol);
    const rowStep = Math.sign(deltaRow);

    const candidates: GridPos[] = [];
    if (Math.abs(deltaCol) >= Math.abs(deltaRow) && colStep !== 0) {
      candidates.push({ col: food.col + colStep, row: food.row });
      if (rowStep !== 0) {
        candidates.push({ col: food.col, row: food.row + rowStep });
      }
      return candidates;
    }

    if (rowStep !== 0) {
      candidates.push({ col: food.col, row: food.row + rowStep });
    }
    if (colStep !== 0) {
      candidates.push({ col: food.col + colStep, row: food.row });
    }
    return candidates;
  }

  private isFoodPullCellValid(pos: GridPos, blocked: Set<string>): boolean {
    return (
      pos.col >= 0 &&
      pos.col < GRID_COLS &&
      pos.row >= 0 &&
      pos.row < GRID_ROWS &&
      !blocked.has(this.gridPosKey(pos))
    );
  }

  private getManhattanDistance(a: GridPos, b: GridPos): number {
    return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
  }
}
