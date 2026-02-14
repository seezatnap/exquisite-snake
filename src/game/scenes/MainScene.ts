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
import { isInBounds, gridToPixel, type GridPos } from "../utils/grid";
import { Snake } from "../entities/Snake";
import { Food } from "../entities/Food";
import { EchoGhost, type RewindStateProvider } from "../entities/EchoGhost";
import { emitFoodParticles, emitGhostFoodParticles, shakeCamera } from "../systems/effects";
import { GhostRenderer } from "../systems/GhostRenderer";
import { BiomeColorManager } from "../systems/BiomeTheme";

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

  /** The echo ghost entity for the current run (null when not playing). */
  private ghost: EchoGhost | null = null;

  /** Renderer for the echo ghost's translucent visuals (null when not playing). */
  private ghostRenderer: GhostRenderer | null = null;

  /** Biome color manager for timed biome rotation and ghost color tinting. */
  private biomeManager: BiomeColorManager | null = null;

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

    // Advance biome rotation every frame for smooth color transitions
    if (this.biomeManager) {
      this.biomeManager.update(delta);
    }

    // Render ghost every frame for smooth visuals
    if (this.ghost && this.ghostRenderer) {
      this.ghostRenderer.render(this.ghost, delta);
    }

    const stepped = this.snake.update(delta);

    if (stepped) {
      // Record the snake's current position into the ghost buffer
      if (this.ghost) {
        this.ghost.recordTick(this.snake.getSegments());

        // Emit any ghost-food bursts that became ready this tick
        const bursts = this.ghost.consumePendingBursts();
        for (const pos of bursts) {
          const px = gridToPixel(pos);
          emitGhostFoodParticles(this, px.x, px.y);
        }
      }

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
        // Schedule a ghost-food burst at the ghost's position in 5 seconds
        if (this.ghost) {
          this.ghost.scheduleFoodBurst();
        }
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

  /** Create snake, food, and ghost entities for a new run. */
  private createEntities(): void {
    this.snake = new Snake(
      this,
      DEFAULT_HEAD_POS,
      DEFAULT_DIRECTION,
      DEFAULT_SNAKE_LENGTH,
    );
    this.snake.setupInput();
    this.snake.setupTouchInput();
    this.food = new Food(this, this.snake, this.rng);
    this.ghost = new EchoGhost();
    this.ghostRenderer = new GhostRenderer(this);
    this.biomeManager = new BiomeColorManager();
    this.biomeManager.start();
    this.ghostRenderer.setBiomeColorProvider(this.biomeManager);
  }

  /** Destroy existing snake, food, and ghost entities. */
  private destroyEntities(): void {
    if (this.snake) {
      this.snake.destroy();
      this.snake = null;
    }
    if (this.food) {
      this.food.destroy();
      this.food = null;
    }
    if (this.ghostRenderer) {
      this.ghostRenderer.destroy();
      this.ghostRenderer = null;
    }
    if (this.biomeManager) {
      this.biomeManager.reset();
      this.biomeManager = null;
    }
    if (this.ghost) {
      this.ghost.reset();
      this.ghost = null;
    }
  }

  // ── Collision detection ───────────────────────────────────────

  /**
   * Check wall-collision, self-collision, and echo-ghost collision.
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

    // Echo-ghost collision: head overlaps the ghost's delayed replay position
    if (this.ghost && this.ghost.isActive() && this.ghost.isOnGhost(head)) {
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

  getGhost(): EchoGhost | null {
    return this.ghost;
  }

  getGhostRenderer(): GhostRenderer | null {
    return this.ghostRenderer;
  }

  getBiomeManager(): BiomeColorManager | null {
    return this.biomeManager;
  }

  /**
   * Get the rewind state provider for Phase 6 integration.
   * Returns the ghost's RewindStateProvider interface, or null if
   * no ghost is active (e.g., between runs).
   */
  getRewindStateProvider(): RewindStateProvider | null {
    return this.ghost;
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
