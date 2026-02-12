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
import { isInBounds, type GridPos } from "../utils/grid";
import { Snake } from "../entities/Snake";
import { Food } from "../entities/Food";
import { emitFoodParticles, shakeCamera } from "../systems/effects";
import {
  BiomeManager,
  Biome,
  type BiomeChangeListener,
} from "../systems/BiomeManager";
import { IceMomentum } from "../systems/IceMomentum";

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

  /** Biome rotation manager — persists across runs (reset between runs). */
  private biomeManager = new BiomeManager();

  /** Ice Cavern momentum handler — persists across runs (reset between runs). */
  private iceMomentum = new IceMomentum();

  /** Bound listener for biome change events (stored for cleanup). */
  private onBiomeChange: BiomeChangeListener | null = null;

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

    // Subscribe to biome transitions and sync to bridge
    this.onBiomeChange = (newBiome: Biome) => {
      gameBridge.setBiome(newBiome);
      gameBridge.setBiomeVisitStats(this.biomeManager.getVisitStats());
      // Enable/disable ice momentum based on biome
      this.iceMomentum.setEnabled(newBiome === Biome.IceCavern);
    };
    this.biomeManager.onChange(this.onBiomeChange);

    this.enterPhase("start");
  }

  /** Phaser shutdown callback — clean up bridge listener. */
  shutdown(): void {
    if (this.onBridgePhaseChange) {
      gameBridge.off("phaseChange", this.onBridgePhaseChange);
      this.onBridgePhaseChange = null;
    }
    if (this.onBiomeChange) {
      this.biomeManager.offChange(this.onBiomeChange);
      this.onBiomeChange = null;
    }
    this.biomeManager.reset();
    this.iceMomentum.reset();
    this.iceMomentum.setEnabled(false);
    this.destroyEntities();
  }

  update(_time: number, delta: number): void {
    if (gameBridge.getState().phase !== "playing") return;

    gameBridge.setElapsedTime(gameBridge.getState().elapsedTime + delta);

    // Advance biome timer and sync time-remaining to bridge
    this.biomeManager.update(delta);
    gameBridge.setBiomeTimeRemaining(this.biomeManager.getTimeRemaining());

    if (!this.snake || !this.food) return;

    const stepped = this.snake.update(delta);

    if (stepped) {
      // Check collisions after the snake moved to its new grid position
      if (this.checkCollisions()) {
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
    this.biomeManager.reset();
    this.biomeManager.start();
    // Sync initial biome state to bridge
    const initialBiome = this.biomeManager.getCurrentBiome();
    gameBridge.setBiome(initialBiome);
    gameBridge.setBiomeTimeRemaining(this.biomeManager.getTimeRemaining());
    gameBridge.setBiomeVisitStats(this.biomeManager.getVisitStats());
    // Reset and configure ice momentum for the starting biome
    this.iceMomentum.reset();
    this.iceMomentum.setEnabled(initialBiome === Biome.IceCavern);
    this.destroyEntities();
    this.createEntities();
  }

  /** End the current run: kill snake, persist high-score, transition to gameOver. */
  endRun(): void {
    shakeCamera(this);
    if (this.snake?.isAlive()) {
      this.snake.kill();
    }
    // Snapshot final biome stats before stopping the manager
    gameBridge.setBiomeVisitStats(this.biomeManager.getVisitStats());
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
    this.snake.setIceMomentum(this.iceMomentum);
    this.snake.setupInput();
    this.snake.setupTouchInput();
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
  }

  // ── Collision detection ───────────────────────────────────────

  /**
   * Check wall-collision and self-collision.
   * If a collision is detected, ends the run and returns true.
   */
  private checkCollisions(): boolean {
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

  getBiomeManager(): BiomeManager {
    return this.biomeManager;
  }

  getIceMomentum(): IceMomentum {
    return this.iceMomentum;
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
