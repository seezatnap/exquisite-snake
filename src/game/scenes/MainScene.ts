import * as Phaser from "phaser";
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

  constructor() {
    super(MAIN_SCENE_KEY);
  }

  create(): void {
    mainSceneStateBridge.resetForNextRun();
    this.setPersistedHighScore(loadHighScore());
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

    mainSceneStateBridge.setElapsedSurvivalMs(time - this.runStartMs);
  }

  startRun(): void {
    this.runStartMs = this.time.now;
    mainSceneStateBridge.resetForNextRun();
    mainSceneStateBridge.setPhase("playing");
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
    if (this.runStartMs !== null) {
      mainSceneStateBridge.setElapsedSurvivalMs(this.time.now - this.runStartMs);
    }

    this.setPersistedHighScore(
      persistHighScore(mainSceneStateBridge.getSnapshot().highScore),
    );
    this.runStartMs = null;
    mainSceneStateBridge.setPhase("game-over");
  }

  resetForReplay(): void {
    this.runStartMs = null;
    mainSceneStateBridge.resetForNextRun();
  }

  private bindStartInput(): void {
    const keyboard = this.input.keyboard;

    if (!keyboard) {
      return;
    }

    keyboard.on("keydown", this.handleAnyKeyToStart, this);
  }

  private bindSceneLifecycleEvents(): void {
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.handleShutdown, this);
  }

  private handleAnyKeyToStart(): void {
    if (mainSceneStateBridge.getSnapshot().phase !== "start") {
      return;
    }

    this.startRun();
  }

  private handleShutdown(): void {
    this.runStartMs = null;
    this.input.keyboard?.off("keydown", this.handleAnyKeyToStart, this);
  }
}
