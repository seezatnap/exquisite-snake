import { expect, vi } from "vitest";
import {
  EchoGhost,
  ECHO_DELAY_MS,
  DEFAULT_BUFFER_CAPACITY,
  type EchoGhostBufferSnapshot,
} from "@/game/entities/EchoGhost";
import type { GhostFoodBurstResult } from "@/game/systems/GhostFoodBurstQueue";
import {
  DEFAULT_MOVE_INTERVAL_MS,
  gridToPixel,
  type Direction,
  type GridPos,
} from "@/game/utils/grid";

export const DELAY_TICKS = Math.round(ECHO_DELAY_MS / DEFAULT_MOVE_INTERVAL_MS);

const DEFAULT_TIMER_START_MS = Date.UTC(2026, 0, 1, 0, 0, 0, 0);

export interface DeterministicTimerControls {
  readonly tickMs: number;
  now(): number;
  advanceMs(ms: number): void;
  advanceTicks(ticks?: number): void;
  runOnlyPending(): void;
  runAll(): void;
}

export interface DeterministicTimerOptions {
  startTimeMs?: number;
  tickMs?: number;
}

export async function withDeterministicTimers<T>(
  run: (timers: DeterministicTimerControls) => T | Promise<T>,
  options: DeterministicTimerOptions = {},
): Promise<T> {
  const tickMs = options.tickMs ?? DEFAULT_MOVE_INTERVAL_MS;
  const startTimeMs = options.startTimeMs ?? DEFAULT_TIMER_START_MS;

  vi.useFakeTimers();
  vi.setSystemTime(startTimeMs);

  const controls: DeterministicTimerControls = {
    tickMs,
    now: () => Date.now(),
    advanceMs: (ms) => {
      if (!Number.isFinite(ms) || ms < 0) {
        throw new Error(`advanceMs requires a finite non-negative value; received ${ms}`);
      }
      vi.advanceTimersByTime(ms);
    },
    advanceTicks: (ticks = 1) => {
      if (!Number.isInteger(ticks) || ticks < 0) {
        throw new Error(
          `advanceTicks requires a non-negative integer; received ${ticks}`,
        );
      }
      vi.advanceTimersByTime(ticks * tickMs);
    },
    runOnlyPending: () => {
      vi.runOnlyPendingTimers();
    },
    runAll: () => {
      vi.runAllTimers();
    },
  };

  try {
    return await run(controls);
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
  }
}

export function makeSegments(headCol: number, length = 3, row = 10): GridPos[] {
  return Array.from({ length }, (_, i) => ({
    col: headCol - i,
    row,
  }));
}

function createDirectionalSegments(
  head: GridPos,
  direction: Direction,
  length: number,
): GridPos[] {
  return Array.from({ length }, (_, i) => {
    if (direction === "right") return { col: head.col - i, row: head.row };
    if (direction === "left") return { col: head.col + i, row: head.row };
    if (direction === "down") return { col: head.col, row: head.row - i };
    return { col: head.col, row: head.row + i };
  });
}

function offsetHead(start: GridPos, direction: Direction, ticks: number): GridPos {
  if (direction === "right") return { col: start.col + ticks, row: start.row };
  if (direction === "left") return { col: start.col - ticks, row: start.row };
  if (direction === "down") return { col: start.col, row: start.row + ticks };
  return { col: start.col, row: start.row - ticks };
}

export interface SnakePathFixtureOptions {
  ticks: number;
  startHead?: GridPos;
  direction?: Direction;
  length?: number;
}

export function createSnakePathFixture(
  options: SnakePathFixtureOptions,
): GridPos[][] {
  const startHead = options.startHead ?? { col: 10, row: 10 };
  const direction = options.direction ?? "right";
  const length = options.length ?? 3;

  return Array.from({ length: options.ticks }, (_, tick) =>
    createDirectionalSegments(offsetHead(startHead, direction, tick), direction, length),
  );
}

export interface GhostPathFixture {
  snakePath: GridPos[][];
  expectedGhostHeadByTick: Array<GridPos | null>;
  delayTicks: number;
}

export function createGhostPathFixture(
  snakePath: readonly (readonly GridPos[])[],
  delayTicks = DELAY_TICKS,
): GhostPathFixture {
  const clonedPath = snakePath.map((segments) =>
    segments.map((segment) => ({ ...segment })),
  );
  const expectedGhostHeadByTick = snakePath.map((_, tick) => {
    const sourceTick = tick - (delayTicks - 1);
    if (sourceTick < 0) return null;
    return { ...snakePath[sourceTick][0] };
  });

  return {
    snakePath: clonedPath,
    expectedGhostHeadByTick,
    delayTicks,
  };
}

export function recordNTicks(
  ghost: EchoGhost,
  n: number,
  startCol = 10,
  length = 3,
): void {
  for (let i = 0; i < n; i++) {
    ghost.record(makeSegments(startCol + i, length));
  }
}

export function recordPathIntoGhost(
  ghost: EchoGhost,
  path: readonly (readonly GridPos[])[],
): void {
  for (const segments of path) {
    ghost.record(segments);
  }
}

export interface ActiveGhostFixtureOptions {
  bufferSize?: number;
  ticksSinceStart?: number;
  opacity?: number;
}

export function createActiveGhostSnapshotFixture(
  ghostSegments: readonly GridPos[],
  options: ActiveGhostFixtureOptions = {},
): EchoGhostBufferSnapshot {
  const bufferSize = Math.max(1, options.bufferSize ?? DEFAULT_BUFFER_CAPACITY);
  const ticksSinceStart = options.ticksSinceStart ?? DELAY_TICKS;
  const opacity = options.opacity ?? 1;

  const cloneSegments = () => ghostSegments.map((segment) => ({ ...segment }));

  return {
    buffer: Array.from({ length: bufferSize }, () => ({ segments: cloneSegments() })),
    head: 0,
    count: bufferSize,
    writeIndex: 0,
    readIndex: 0,
    active: true,
    opacity,
    currentSegments: cloneSegments(),
    ticksSinceStart,
  };
}

export function activateGhostWithFixture(
  ghost: EchoGhost,
  ghostSegments: readonly GridPos[],
  options: ActiveGhostFixtureOptions = {},
): void {
  ghost.restore(createActiveGhostSnapshotFixture(ghostSegments, options));
}

export function expectGhostHeadPosition(ghost: EchoGhost, expected: GridPos): void {
  const state = ghost.getState();
  expect(state.active).toBe(true);
  expect(state.segments.length).toBeGreaterThan(0);
  expect(state.segments[0]).toEqual(expected);
}

export function expectGhostPositionFromFixture(
  ghost: EchoGhost,
  fixture: GhostPathFixture,
  tickIndex: number,
): void {
  const expected = fixture.expectedGhostHeadByTick[tickIndex];
  if (expected) {
    expectGhostHeadPosition(ghost, expected);
    return;
  }

  expect(ghost.active).toBe(false);
  expect(ghost.getSegments()).toEqual([]);
}

export interface GhostFadeStateAssertion {
  active?: boolean;
  minOpacity?: number;
  maxOpacity?: number;
  bufferedCount?: number;
}

export function expectGhostFadeState(
  ghost: EchoGhost,
  expectation: GhostFadeStateAssertion,
): void {
  if (expectation.active !== undefined) {
    expect(ghost.active).toBe(expectation.active);
  }
  if (expectation.bufferedCount !== undefined) {
    expect(ghost.getBufferedCount()).toBe(expectation.bufferedCount);
  }
  if (expectation.minOpacity !== undefined) {
    expect(ghost.opacity).toBeGreaterThanOrEqual(expectation.minOpacity);
  }
  if (expectation.maxOpacity !== undefined) {
    expect(ghost.opacity).toBeLessThanOrEqual(expectation.maxOpacity);
  }
}

interface SnakeStateLike {
  isAlive(): boolean;
}

interface CollisionSceneLike {
  getPhase(): string;
  getSnake(): SnakeStateLike | null;
}

export interface CollisionGameOverAssertionOptions {
  cameraShakeSpy?: ReturnType<typeof vi.fn>;
}

export function expectCollisionGameOverSignal(
  scene: CollisionSceneLike,
  options: CollisionGameOverAssertionOptions = {},
): void {
  expect(scene.getPhase()).toBe("gameOver");
  const snake = scene.getSnake();
  expect(snake).not.toBeNull();
  expect(snake?.isAlive()).toBe(false);
  if (options.cameraShakeSpy) {
    expect(options.cameraShakeSpy).toHaveBeenCalled();
  }
}

export function expectFoodBurstEventsAtGridPositions(
  bursts: readonly GhostFoodBurstResult[],
  expectedGridPositions: readonly GridPos[],
): void {
  expect(bursts).toHaveLength(expectedGridPositions.length);
  for (let i = 0; i < expectedGridPositions.length; i++) {
    const expected = gridToPixel(expectedGridPositions[i]);
    expect(bursts[i]).toEqual({ x: expected.x, y: expected.y });
  }
}

export function expectFoodBurstAtGhostHead(
  bursts: readonly GhostFoodBurstResult[],
  ghost: EchoGhost,
  burstIndex = 0,
): void {
  const segments = ghost.getSegments();
  expect(segments.length).toBeGreaterThan(0);
  expectFoodBurstEventsAtGridPositions([bursts[burstIndex]], [segments[0]]);
}

export interface SnapshotRestoreHookLike<TSnapshot> {
  snapshot(): TSnapshot;
  restore(snapshot: TSnapshot): void;
}

export function expectSnapshotRestoreHookInvocation<TSnapshot>(
  hook: SnapshotRestoreHookLike<TSnapshot>,
  mutateState: () => void,
): TSnapshot {
  const snapshotSpy = vi.spyOn(hook, "snapshot");
  const restoreSpy = vi.spyOn(hook, "restore");

  try {
    const snap = hook.snapshot();
    mutateState();
    hook.restore(snap);

    expect(snapshotSpy).toHaveBeenCalledTimes(1);
    expect(restoreSpy).toHaveBeenCalledTimes(1);
    expect(restoreSpy).toHaveBeenCalledWith(snap);
    return snap;
  } finally {
    snapshotSpy.mockRestore();
    restoreSpy.mockRestore();
  }
}
