import * as Phaser from "phaser";
import { GRID_COLS, GRID_ROWS } from "../config";
import { Snake, type SnakeOptions } from "../entities/Snake";
import { areGridPositionsEqual, isWithinGridBounds } from "../utils/grid";
import { loadHighScore, persistHighScore } from "../utils/storage";

export const MAIN_SCENE_KEY = "MainScene" as const;

export type GamePhase = "start" | "playing" | "game-over";

export type OverlayGameState = Readonly<{
  phase: GamePhase;
  score: number;
  highScore: number;
  elapsedSurvivalMs: number;
}>;

export type OverlayStateListener = (state: OverlayGameState) => void;

const INITIAL_STATE: OverlayGameState = Object.freeze({
  phase: "start",
  score: 0,
  highScore: 0,
  elapsedSurvivalMs: 0,
});

const DEFAULT_SNAKE_OPTIONS: SnakeOptions = Object.freeze({
  initialHeadPosition: Object.freeze({ x: 8, y: 8 }),
  initialDirection: "right",
  initialLength: 3,
});

const PLAYFIELD_BOUNDS = Object.freeze({
  cols: GRID_COLS,
  rows: GRID_ROWS,
});

function clampNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

class MainSceneStateBridge {
  private state: OverlayGameState = INITIAL_STATE;
  private listeners = new Set<OverlayStateListener>();

  getSnapshot = (): OverlayGameState => this.state;

  subscribe = (listener: OverlayStateListener): (() => void) => {
    this.listeners.add(listener);
    listener(this.state);

    return () => {
      this.listeners.delete(listener);
    };
  };

  resetForNextRun(): void {
    this.patchState({
      phase: "start",
      score: 0,
      elapsedSurvivalMs: 0,
    });
  }

  setPhase(phase: GamePhase): void {
    this.patchState({ phase });
  }

  setScore(score: number): void {
    this.patchState({ score: clampNonNegativeInteger(score) });
  }

  setHighScore(highScore: number): void {
    this.patchState({ highScore: clampNonNegativeInteger(highScore) });
  }

  setElapsedSurvivalMs(elapsedSurvivalMs: number): void {
    this.patchState({
      elapsedSurvivalMs: clampNonNegativeInteger(elapsedSurvivalMs),
    });
  }

  private patchState(nextState: Partial<OverlayGameState>): void {
    const mergedState = Object.freeze({
      ...this.state,
      ...nextState,
    });

    if (this.hasNoStateChange(mergedState)) {
      return;
    }

    this.state = mergedState;
    this.emit();
  }

  private hasNoStateChange(nextState: OverlayGameState): boolean {
    return (
      nextState.phase === this.state.phase &&
      nextState.score === this.state.score &&
      nextState.highScore === this.state.highScore &&
      nextState.elapsedSurvivalMs === this.state.elapsedSurvivalMs
    );
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

export const mainSceneStateBridge = new MainSceneStateBridge();

export const subscribeToMainSceneState = (
  listener: OverlayStateListener,
): (() => void) => mainSceneStateBridge.subscribe(listener);

export const getMainSceneStateSnapshot = (): OverlayGameState =>
  mainSceneStateBridge.getSnapshot();

export class MainScene extends Phaser.Scene {
  static readonly KEY = MAIN_SCENE_KEY;

  private runStartMs: number | null = null;

  private lastUpdateMs: number | null = null;

  private snake = new Snake(DEFAULT_SNAKE_OPTIONS);

  constructor() {
    super(MAIN_SCENE_KEY);
  }

  create(): void {
    mainSceneStateBridge.resetForNextRun();
    this.setPersistedHighScore(loadHighScore());
    this.rebuildSnakeForNextRun();
    this.bindSceneLifecycleEvents();
    this.bindStartInput();
  }

  update(time: number): void {
    if (
      this.runStartMs === null ||
      mainSceneStateBridge.getSnapshot().phase !== "playing"
    ) {
      return;
    }

    if (this.advanceSnakeWithCollisionChecks(this.getFrameDeltaMs(time))) {
      return;
    }

    mainSceneStateBridge.setElapsedSurvivalMs(time - this.runStartMs);
  }

  startRun(): void {
    this.rebuildSnakeForNextRun();
    this.runStartMs = this.time.now;
    this.lastUpdateMs = this.time.now;
    mainSceneStateBridge.resetForNextRun();
    mainSceneStateBridge.setPhase("playing");
    this.snake.bindKeyboardControls(this.input.keyboard ?? null);
    this.snake.bindTouchControls(this.input);
  }

  addScore(points = 1): void {
    const nextScore =
      mainSceneStateBridge.getSnapshot().score +
      clampNonNegativeInteger(points);
    const highScore = mainSceneStateBridge.getSnapshot().highScore;

    mainSceneStateBridge.setScore(nextScore);

    if (nextScore > highScore) {
      mainSceneStateBridge.setHighScore(nextScore);
    }
  }

  setPersistedHighScore(highScore: number): void {
    mainSceneStateBridge.setHighScore(highScore);
  }

  endRun(): void {
    if (mainSceneStateBridge.getSnapshot().phase === "game-over") {
      return;
    }

    if (this.runStartMs !== null) {
      mainSceneStateBridge.setElapsedSurvivalMs(this.time.now - this.runStartMs);
    }

    this.setPersistedHighScore(
      persistHighScore(mainSceneStateBridge.getSnapshot().highScore),
    );
    this.runStartMs = null;
    this.lastUpdateMs = null;
    this.snake.unbindKeyboardControls();
    this.snake.unbindTouchControls();
    mainSceneStateBridge.setPhase("game-over");
  }

  resetForReplay(): void {
    this.runStartMs = null;
    this.lastUpdateMs = null;
    this.rebuildSnakeForNextRun();
    mainSceneStateBridge.resetForNextRun();
  }

  private bindStartInput(): void {
    this.input.keyboard?.on("keydown", this.handleAnyInputToStart, this);
    this.input.on("pointerdown", this.handleAnyInputToStart, this);
  }

  private bindSceneLifecycleEvents(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);
  }

  private handleAnyInputToStart(): void {
    if (mainSceneStateBridge.getSnapshot().phase !== "start") {
      return;
    }

    this.startRun();
  }

  private handleShutdown(): void {
    this.runStartMs = null;
    this.lastUpdateMs = null;
    this.snake.unbindKeyboardControls();
    this.snake.unbindTouchControls();
    this.input.keyboard?.off("keydown", this.handleAnyInputToStart, this);
    this.input.off("pointerdown", this.handleAnyInputToStart, this);
  }

  private rebuildSnakeForNextRun(): void {
    this.snake.unbindKeyboardControls();
    this.snake.unbindTouchControls();
    this.snake = new Snake(DEFAULT_SNAKE_OPTIONS);
  }

  private getFrameDeltaMs(currentTimeMs: number): number {
    if (this.lastUpdateMs === null) {
      this.lastUpdateMs = currentTimeMs;
      return 0;
    }

    const frameDeltaMs = currentTimeMs - this.lastUpdateMs;
    this.lastUpdateMs = currentTimeMs;

    if (!Number.isFinite(frameDeltaMs) || frameDeltaMs <= 0) {
      return 0;
    }

    return frameDeltaMs;
  }

  private advanceSnakeWithCollisionChecks(frameDeltaMs: number): boolean {
    let remainingDeltaMs = frameDeltaMs;

    while (remainingDeltaMs > 0) {
      const tickDeltaMs = Math.min(remainingDeltaMs, this.snake.stepDurationMs);
      remainingDeltaMs -= tickDeltaMs;

      if (this.snake.tick(tickDeltaMs) === 0) {
        continue;
      }

      if (this.hasCollision()) {
        this.endRun();
        return true;
      }
    }

    return false;
  }

  private hasCollision(): boolean {
    return this.hasWallCollision() || this.hasSelfCollision();
  }

  private hasWallCollision(): boolean {
    return !isWithinGridBounds(this.snake.head, PLAYFIELD_BOUNDS);
  }

  private hasSelfCollision(): boolean {
    const [head, ...body] = this.snake.getSegments();

    return body.some((segment) => areGridPositionsEqual(segment, head));
  }
}
