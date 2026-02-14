import Phaser from "phaser";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  TILE_SIZE,
  GRID_COLS,
  GRID_ROWS,
  COLORS,
} from "../config";
import { gameBridge, type GamePhase } from "../bridge";
import { loadHighScore, saveHighScore } from "../utils/storage";
import { isInBounds, gridEquals, type GridPos } from "../utils/grid";
import { Snake } from "../entities/Snake";
import { Food } from "../entities/Food";
import {
  EchoGhost,
  type EchoGhostRewindState,
  type EchoGhostRewindStateHook,
} from "../entities/EchoGhost";
import { emitFoodParticles, shakeCamera } from "../systems/effects";

// ── Default spawn configuration ─────────────────────────────────

/** Default head position for the snake at the start of a run. */
const DEFAULT_HEAD_POS: GridPos = {
  col: Math.floor(GRID_COLS / 2),
  row: Math.floor(GRID_ROWS / 2),
};
const DEFAULT_DIRECTION = "right" as const;
const DEFAULT_SNAKE_LENGTH = 3;

/**
 * Primary gameplay scene.
 *
 * Manages the game loop phases (start → playing → gameOver), draws the
 * arena grid, creates/destroys Snake and Food entities each run,
 * checks wall- and self-collision every grid step, and provides
 * deterministic reset logic (injectable RNG) for replay sessions.
 *
 * All score / high-score / elapsed survival time state is delegated to
 * the Phaser↔React bridge (single source of truth) so overlay
 * components and external consumers stay in sync.
 */
export class MainScene extends Phaser.Scene {
  /** The snake entity for the current run (null when not playing). */
  private snake: Snake | null = null;

  /** The food entity for the current run (null when not playing). */
  private food: Food | null = null;

  /** The echo ghost replay entity for the current run (null when not playing). */
  private echoGhost: EchoGhost | null = null;

  /** Optional observer for rewind snapshots emitted by the echo ghost. */
  private echoGhostRewindStateHook: EchoGhostRewindStateHook | null = null;

  /** Number of recorded movement steps since run start. */
  private ghostProgressTicks = 0;

  /** Number of replayable steps emitted after the delay window starts. */
  private ghostReplayTicks = 0;

  /** Whether the ghost delay window has completed and replay has started. */
  private isGhostReplayActive = false;

  /**
   * Injectable RNG function for deterministic replay sessions.
   * Returns a value in [0, 1). Defaults to Math.random.
   */
  private rng: () => number = Math.random;

  constructor() {
    super({ key: "MainScene" });
  }

  /** Bound listener for bridge phase changes (stored for cleanup). */
  private onBridgePhaseChange: ((phase: GamePhase) => void) | null = null;

  // ── Phaser lifecycle ────────────────────────────────────────

  create(): void {
    this.drawGrid();
    gameBridge.setHighScore(loadHighScore());

    // Listen for phase changes originating from React overlays
    // (e.g. StartScreen "press any key" → playing, GameOver "Play Again" → playing).
    this.onBridgePhaseChange = (phase: GamePhase) => {
      if (phase === "playing") {
        this.startRun();
      }
    };
    gameBridge.on("phaseChange", this.onBridgePhaseChange);

    this.enterPhase("start");
  }

  /** Phaser shutdown callback — clean up bridge listener. */
  shutdown(): void {
    if (this.onBridgePhaseChange) {
      gameBridge.off("phaseChange", this.onBridgePhaseChange);
      this.onBridgePhaseChange = null;
    }
    this.destroyEntities();
  }

  update(_time: number, delta: number): void {
    if (gameBridge.getState().phase !== "playing") return;

    gameBridge.setElapsedTime(gameBridge.getState().elapsedTime + delta);

    if (!this.snake || !this.food) return;

    const stepped = this.snake.update(delta);

    if (stepped) {
      this.echoGhost?.writePositions(this.snake.getSegments());
      this.ghostProgressTicks += 1;

      this.echoGhost?.advanceReplayProgress();

      const replayState = this.echoGhost?.getReplayState();
      if (!this.isGhostReplayActive && replayState === "active") {
        this.isGhostReplayActive = true;
      }
      if (replayState === "active") {
        this.ghostReplayTicks += 1;
      }
      if (replayState === "exhausted") {
        this.isGhostReplayActive = false;
      }

      const ghostTrail = this.echoGhost?.readDelayedTrail() ?? [];

      // Check collisions after the snake moved to its new grid position
      if (this.checkCollisions(ghostTrail)) {
        return; // Game over — stop processing this frame
      }

      // Check food consumption — emit particles at the old food position on eat
      const foodSprite = this.food.getSprite();
      const fx = foodSprite.x;
      const fy = foodSprite.y;
      const eaten = this.food.checkEat(this.snake, (points) =>
        this.addScore(points),
      );
      if (eaten) {
        emitFoodParticles(this, fx, fy);
      }
    }
  }

  // ── Phase management ────────────────────────────────────────

  /**
   * Transition to a new game phase and notify the bridge.
   *
   * When the phase is set to "playing" (from any source — this scene or
   * React overlays), the bridge listener created in `create()` will call
   * `startRun()` automatically, keeping a single code path.
   */
  enterPhase(next: GamePhase): void {
    gameBridge.setPhase(next);
  }

  getPhase(): GamePhase {
    return gameBridge.getState().phase;
  }

  // ── Run lifecycle ───────────────────────────────────────────

  /** Reset per-run state and begin a new game. */
  private startRun(): void {
    gameBridge.resetRun();
    this.destroyEntities();
    this.createEntities();
  }

  /** End the current run: kill snake, persist high-score, transition to gameOver. */
  endRun(): void {
    shakeCamera(this);
    if (this.snake?.isAlive()) {
      this.snake.kill();
    }
    const { score, highScore } = gameBridge.getState();
    if (score > highScore) {
      gameBridge.setHighScore(score);
      saveHighScore(score);
    }
    this.enterPhase("gameOver");
  }

  // ── Entity management ─────────────────────────────────────────

  /** Create snake and food entities for a new run. */
  private createEntities(): void {
    this.snake = new Snake(
      this,
      DEFAULT_HEAD_POS,
      DEFAULT_DIRECTION,
      DEFAULT_SNAKE_LENGTH,
    );
    this.snake.setupInput();
    this.snake.setupTouchInput();
    this.echoGhost = new EchoGhost(this.snake.getTicker().interval);
    this.echoGhost.setRewindStateHook(this.echoGhostRewindStateHook);
    this.food = new Food(this, this.snake, this.rng);
  }

  /** Destroy existing snake and food entities. */
  private destroyEntities(): void {
    if (this.snake) {
      this.snake.destroy();
      this.snake = null;
    }
    if (this.food) {
      this.food.destroy();
      this.food = null;
    }
    this.echoGhost = null;
    this.ghostProgressTicks = 0;
    this.ghostReplayTicks = 0;
    this.isGhostReplayActive = false;
  }

  // ── Collision detection ───────────────────────────────────────

  /**
   * Check wall-collision and self-collision.
   * If a collision is detected, ends the run and returns true.
   */
  private checkCollisions(ghostTrail: readonly GridPos[] = []): boolean {
    if (!this.snake) return false;

    const head = this.snake.getHeadPosition();

    // Wall collision: head is outside arena bounds
    if (!isInBounds(head)) {
      this.endRun();
      return true;
    }

    // Self-collision: head occupies a body segment
    if (this.snake.hasSelfCollision()) {
      this.endRun();
      return true;
    }

    // Ghost collision: head overlaps any trail segment in replay
    if (this.isGhostCollision(head, ghostTrail)) {
      this.endRun();
      return true;
    }

    return false;
  }

  /** Check whether the snake head overlaps any segment of the echo ghost trail. */
  private isGhostCollision(
    head: GridPos,
    ghostTrail: readonly GridPos[],
  ): boolean {
    for (const segment of ghostTrail) {
      if (gridEquals(head, segment)) {
        return true;
      }
    }
    return false;
  }

  // ── Score helpers ───────────────────────────────────────────

  addScore(points: number): void {
    gameBridge.setScore(gameBridge.getState().score + points);
  }

  getScore(): number {
    return gameBridge.getState().score;
  }

  getHighScore(): number {
    return gameBridge.getState().highScore;
  }

  setHighScore(value: number): void {
    gameBridge.setHighScore(value);
  }

  getElapsedTime(): number {
    return gameBridge.getState().elapsedTime;
  }

  // ── RNG / Deterministic replay ────────────────────────────────

  /** Set the RNG function for deterministic replay. */
  setRng(rng: () => number): void {
    this.rng = rng;
  }

  /** Get the current RNG function. */
  getRng(): () => number {
    return this.rng;
  }

  // ── Entity accessors (for tests and external integration) ────

  getSnake(): Snake | null {
    return this.snake;
  }

  getFood(): Food | null {
    return this.food;
  }

  /** Register a callback for per-tick echo ghost rewind snapshots; no gameplay impact until used. */
  setEchoGhostRewindStateHook(
    hook: EchoGhostRewindStateHook | null,
  ): void {
    this.echoGhostRewindStateHook = hook;
    this.echoGhost?.setRewindStateHook(hook);
  }

  /** Expose the current echo ghost rewind state for future rewind actions. */
  getEchoGhostRewindState(): EchoGhostRewindState | null {
    return this.echoGhost?.captureRewindState() ?? null;
  }

  /** Restore the echo ghost replay state from a rewind snapshot. */
  restoreEchoGhostRewindState(snapshot: EchoGhostRewindState): void {
    this.echoGhost?.restoreRewindState(snapshot);
  }

  // ── Arena grid ──────────────────────────────────────────────

  private drawGrid(): void {
    const gfx = this.add.graphics();
    gfx.lineStyle(1, COLORS.GRID_LINE, 0.08);

    // Vertical lines
    for (let col = 1; col < GRID_COLS; col++) {
      const x = col * TILE_SIZE;
      gfx.moveTo(x, 0);
      gfx.lineTo(x, ARENA_HEIGHT);
    }

    // Horizontal lines
    for (let row = 1; row < GRID_ROWS; row++) {
      const y = row * TILE_SIZE;
      gfx.moveTo(0, y);
      gfx.lineTo(ARENA_WIDTH, y);
    }

    gfx.strokePath();
  }
}
