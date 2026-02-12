import * as Phaser from "phaser";
import { GRID_COLS, GRID_ROWS, TEXTURE_KEYS, TILE_SIZE } from "../config";
import { Food } from "../entities/Food";
import { Snake, type SnakeOptions } from "../entities/Snake";
import {
  areGridPositionsEqual,
  isWithinGridBounds,
  type GridPosition,
} from "../utils/grid";
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

const FOOD_PICKUP_PARTICLE_COUNT = 10;
const FOOD_PICKUP_PARTICLE_LIFESPAN_MS = 220;
const FOOD_PICKUP_PARTICLE_CLEANUP_DELAY_MS = 260;
const FOOD_PICKUP_PARTICLE_SPEED = Object.freeze({
  min: 48,
  max: 132,
});
const DEATH_SHAKE_DURATION_MS = 120;
const DEATH_SHAKE_INTENSITY = 0.0025;

function clampNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

const gridPositionToWorldCenter = (
  position: GridPosition,
): Readonly<{ x: number; y: number }> => ({
  x: (position.x + 0.5) * TILE_SIZE,
  y: (position.y + 0.5) * TILE_SIZE,
});

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

export const requestMainSceneStart = (): boolean => {
  const activeScene = MainScene.getActiveScene();

  if (!activeScene) {
    return false;
  }

  if (mainSceneStateBridge.getSnapshot().phase !== "start") {
    return false;
  }

  activeScene.startRun();
  return true;
};

export const requestMainSceneReplay = (): boolean => {
  const activeScene = MainScene.getActiveScene();

  if (!activeScene) {
    return false;
  }

  if (mainSceneStateBridge.getSnapshot().phase !== "game-over") {
    return false;
  }

  activeScene.resetForReplay();
  activeScene.startRun();
  return true;
};

export class MainScene extends Phaser.Scene {
  static readonly KEY = MAIN_SCENE_KEY;
  private static activeScene: MainScene | null = null;

  static getActiveScene(): MainScene | null {
    return MainScene.activeScene;
  }

  private runStartMs: number | null = null;

  private lastUpdateMs: number | null = null;

  private snake = new Snake(DEFAULT_SNAKE_OPTIONS);

  private food = this.createFoodForRun();

  constructor() {
    super(MAIN_SCENE_KEY);
  }

  create(): void {
    MainScene.activeScene = this;
    mainSceneStateBridge.resetForNextRun();
    this.setPersistedHighScore(loadHighScore());
    this.rebuildSnakeForNextRun();
    this.rebuildFoodForNextRun();
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
    this.rebuildFoodForNextRun();
    this.food.spawnForSnake(this.snake);
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
    this.rebuildFoodForNextRun();
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
    if (MainScene.activeScene === this) {
      MainScene.activeScene = null;
    }

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

  private createFoodForRun(): Food {
    return new Food({
      bounds: PLAYFIELD_BOUNDS,
      onScore: (points) => this.addScore(points),
    });
  }

  private rebuildFoodForNextRun(): void {
    this.food = this.createFoodForRun();
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
        this.triggerDeathScreenShake();
        this.endRun();
        return true;
      }

      const eatenFoodPosition = this.food.currentPosition;
      if (this.food.tryEat(this.snake)) {
        this.emitFoodPickupBurst(eatenFoodPosition);
      }
    }

    return false;
  }

  private emitFoodPickupBurst(foodPosition: GridPosition | null): void {
    if (!foodPosition) {
      return;
    }

    const burstOrigin = gridPositionToWorldCenter(foodPosition);
    const emitter = this.add.particles(
      burstOrigin.x,
      burstOrigin.y,
      TEXTURE_KEYS.PARTICLE,
      {
        angle: { min: 0, max: 360 },
        speed: FOOD_PICKUP_PARTICLE_SPEED,
        scale: { start: 0.55, end: 0 },
        alpha: { start: 0.9, end: 0 },
        lifespan: FOOD_PICKUP_PARTICLE_LIFESPAN_MS,
        quantity: FOOD_PICKUP_PARTICLE_COUNT,
        gravityY: 0,
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      },
    );

    emitter.explode(FOOD_PICKUP_PARTICLE_COUNT, burstOrigin.x, burstOrigin.y);
    this.time.delayedCall(FOOD_PICKUP_PARTICLE_CLEANUP_DELAY_MS, () => {
      emitter.stop();
      emitter.destroy();
    });
  }

  private triggerDeathScreenShake(): void {
    const mainCamera = this.cameras.main;

    if (!mainCamera || mainCamera.shakeEffect.isRunning) {
      return;
    }

    mainCamera.shake(DEATH_SHAKE_DURATION_MS, DEATH_SHAKE_INTENSITY, true);
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
