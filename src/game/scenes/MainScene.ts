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
  Biome,
  BiomeManager,
  type BiomeTransition,
  type BiomeVisitStats,
} from "../systems/BiomeManager";

// ── Default spawn configuration ─────────────────────────────────

/** Default head position for the snake at the start of a run. */
const DEFAULT_HEAD_POS: GridPos = {
  col: Math.floor(GRID_COLS / 2),
  row: Math.floor(GRID_ROWS / 2),
};
const DEFAULT_DIRECTION = "right" as const;
const DEFAULT_SNAKE_LENGTH = 3;
const ICE_CAVERN_TURN_MOMENTUM_TILES = 2;

export interface MoltenLavaConfig {
  /** Milliseconds between spawn attempts while Molten Core is active. */
  spawnIntervalMs: number;
  /** Probability [0,1] that a spawn attempt succeeds. */
  spawnChancePerInterval: number;
  /** Hard cap on concurrent lava pools in the arena. */
  maxPools: number;
  /** Tail segments removed when the snake touches lava. */
  burnTailSegments: number;
}

const DEFAULT_MOLTEN_LAVA_CONFIG: MoltenLavaConfig = {
  spawnIntervalMs: 1_500,
  spawnChancePerInterval: 0.35,
  maxPools: 10,
  burnTailSegments: 3,
};

interface BiomeVisualTheme {
  backgroundColor: number;
  gridLineColor: number;
  gridLineAlpha: number;
}

const BIOME_VISUAL_THEMES: Record<Biome, BiomeVisualTheme> = {
  [Biome.NeonCity]: {
    backgroundColor: COLORS.BACKGROUND,
    gridLineColor: COLORS.GRID_LINE,
    gridLineAlpha: 0.08,
  },
  [Biome.IceCavern]: {
    backgroundColor: 0x081624,
    gridLineColor: 0x7dc6ff,
    gridLineAlpha: 0.1,
  },
  [Biome.MoltenCore]: {
    backgroundColor: 0x1a0d05,
    gridLineColor: 0xff8a3d,
    gridLineAlpha: 0.13,
  },
  [Biome.VoidRift]: {
    backgroundColor: 0x060510,
    gridLineColor: 0x8a63ff,
    gridLineAlpha: 0.11,
  },
};

interface BiomeMechanicsState {
  iceMomentumActive: boolean;
  moltenLavaActive: boolean;
  voidGravityActive: boolean;
}

function createBiomeMechanicsState(biome: Biome): BiomeMechanicsState {
  return {
    iceMomentumActive: biome === Biome.IceCavern,
    moltenLavaActive: biome === Biome.MoltenCore,
    voidGravityActive: biome === Biome.VoidRift,
  };
}

/**
 * Primary gameplay scene.
 *
 * Manages the game loop phases (start → playing → gameOver), draws the
 * arena grid, creates/destroys Snake and Food entities each run,
 * checks wall- and self-collision every grid step, and provides
 * deterministic reset logic (injectable RNG) for replay sessions.
 *
 * All score / high-score / elapsed survival time / biome runtime state is delegated to
 * the Phaser↔React bridge (single source of truth) so overlay
 * components and external consumers stay in sync.
 */
export class MainScene extends Phaser.Scene {
  /** The snake entity for the current run (null when not playing). */
  private snake: Snake | null = null;

  /** The food entity for the current run (null when not playing). */
  private food: Food | null = null;

  /** Biome rotation/timing owner for the current run. */
  private readonly biomeManager = new BiomeManager();

  /** Tunable Molten Core lava behavior for spawn cadence/caps/burn amount. */
  private moltenLavaConfig: MoltenLavaConfig = { ...DEFAULT_MOLTEN_LAVA_CONFIG };

  /** Active lava pools keyed by `col:row`. */
  private moltenLavaPools = new Map<string, GridPos>();

  /** Spawn timer accumulator used while Molten Core is active. */
  private moltenLavaSpawnElapsedMs = 0;

  /** Graphics object used to render biome-specific arena grid lines. */
  private gridGraphics: Phaser.GameObjects.Graphics | null = null;

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
    this.syncBiomeRuntimeToBridge();
    this.applyBiomeVisualTheme(this.biomeManager.getCurrentBiome());
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
    this.biomeManager.stopRun();
    this.resetMoltenCoreState();
    this.destroyEntities();
    this.gridGraphics?.destroy?.();
    this.gridGraphics = null;
  }

  update(_time: number, delta: number): void {
    if (gameBridge.getState().phase !== "playing") return;

    gameBridge.setElapsedTime(gameBridge.getState().elapsedTime + delta);
    this.updateBiomeState(delta);

    if (!this.snake || !this.food) return;
    this.updateMoltenCoreMechanics(delta);

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
    this.biomeManager.startRun();
    this.resetMoltenCoreState();
    this.handleBiomeEnter(this.biomeManager.getCurrentBiome());
    this.destroyEntities();
    this.createEntities();
  }

  /** End the current run: kill snake, persist high-score, transition to gameOver. */
  endRun(): void {
    shakeCamera(this);
    this.biomeManager.stopRun();
    this.resetMoltenCoreState();
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
    this.applyBiomeMovementMechanics(this.biomeManager.getCurrentBiome());
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

    if (this.handleMoltenLavaCollision(head)) {
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

  getCurrentBiome(): Biome {
    return this.biomeManager.getCurrentBiome();
  }

  getBiomeVisitStats(): BiomeVisitStats {
    return this.biomeManager.getVisitStats();
  }

  getMoltenLavaPools(): readonly GridPos[] {
    return Array.from(this.moltenLavaPools.values(), (pool) => ({ ...pool }));
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

  /** Override Molten Core spawn/burn knobs (used by balancing and tests). */
  setMoltenLavaConfig(config: Partial<MoltenLavaConfig>): void {
    this.moltenLavaConfig = {
      spawnIntervalMs: Math.max(
        1,
        Math.floor(config.spawnIntervalMs ?? this.moltenLavaConfig.spawnIntervalMs),
      ),
      spawnChancePerInterval: Math.max(
        0,
        Math.min(
          1,
          config.spawnChancePerInterval ?? this.moltenLavaConfig.spawnChancePerInterval,
        ),
      ),
      maxPools: Math.max(
        0,
        Math.floor(config.maxPools ?? this.moltenLavaConfig.maxPools),
      ),
      burnTailSegments: Math.max(
        1,
        Math.floor(config.burnTailSegments ?? this.moltenLavaConfig.burnTailSegments),
      ),
    };

    this.trimMoltenLavaPoolsToCap();
  }

  // ── Entity accessors (for tests and external integration) ────

  getSnake(): Snake | null {
    return this.snake;
  }

  getFood(): Food | null {
    return this.food;
  }

  // ── Arena grid ──────────────────────────────────────────────

  private updateBiomeState(delta: number): void {
    const transitions = this.biomeManager.update(delta);
    if (transitions.length === 0) {
      return;
    }

    for (const transition of transitions) {
      this.handleBiomeTransition(transition);
    }
  }

  private handleBiomeTransition(transition: BiomeTransition): void {
    this.handleBiomeExit(transition.from);
    this.syncBiomeRuntimeToBridge();
    gameBridge.emitBiomeTransition(transition);
    this.handleBiomeEnter(transition.to);
  }

  private handleBiomeEnter(biome: Biome): void {
    if (biome === Biome.MoltenCore) {
      this.moltenLavaSpawnElapsedMs = 0;
    }

    const mechanics = createBiomeMechanicsState(biome);
    gameBridge.emitBiomeEnter(biome);
    this.events?.emit?.("biomeEnter", biome);
    this.events?.emit?.("biomeMechanicsChange", mechanics);
    this.applyBiomeMovementMechanics(biome);
    this.applyBiomeVisualTheme(biome);
    this.events?.emit?.("biomeVisualChange", biome);
  }

  private handleBiomeExit(biome: Biome): void {
    if (biome === Biome.MoltenCore) {
      this.resetMoltenCoreState();
    }

    gameBridge.emitBiomeExit(biome);
    this.events?.emit?.("biomeExit", biome);
  }

  private updateMoltenCoreMechanics(delta: number): void {
    if (!this.snake || !this.food || this.biomeManager.getCurrentBiome() !== Biome.MoltenCore) {
      this.moltenLavaSpawnElapsedMs = 0;
      return;
    }

    this.moltenLavaSpawnElapsedMs += delta;

    while (this.moltenLavaSpawnElapsedMs >= this.moltenLavaConfig.spawnIntervalMs) {
      this.moltenLavaSpawnElapsedMs -= this.moltenLavaConfig.spawnIntervalMs;
      this.trySpawnMoltenLavaPool();
    }
  }

  private trySpawnMoltenLavaPool(): void {
    if (this.moltenLavaPools.size >= this.moltenLavaConfig.maxPools) {
      return;
    }

    if (this.rng() >= this.moltenLavaConfig.spawnChancePerInterval) {
      return;
    }

    const freeCells = this.getMoltenLavaSpawnCandidates();
    if (freeCells.length === 0) {
      return;
    }

    const poolIndex = Math.floor(this.rng() * freeCells.length);
    const poolPos = freeCells[poolIndex];
    this.moltenLavaPools.set(this.gridPosKey(poolPos), poolPos);
  }

  private getMoltenLavaSpawnCandidates(): GridPos[] {
    if (!this.snake || !this.food) {
      return [];
    }

    const foodPos = this.food.getPosition();
    const candidates: GridPos[] = [];

    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        const pos: GridPos = { col, row };
        if (this.snake.isOnSnake(pos)) {
          continue;
        }
        if (foodPos.col === col && foodPos.row === row) {
          continue;
        }
        if (this.moltenLavaPools.has(this.gridPosKey(pos))) {
          continue;
        }
        candidates.push(pos);
      }
    }

    return candidates;
  }

  private handleMoltenLavaCollision(head: GridPos): boolean {
    if (!this.snake || this.biomeManager.getCurrentBiome() !== Biome.MoltenCore) {
      return false;
    }

    if (!this.moltenLavaPools.has(this.gridPosKey(head))) {
      return false;
    }

    const survived = this.snake.burnTailSegments(this.moltenLavaConfig.burnTailSegments);
    if (!survived) {
      this.endRun();
      return true;
    }

    return false;
  }

  private resetMoltenCoreState(): void {
    this.moltenLavaPools.clear();
    this.moltenLavaSpawnElapsedMs = 0;
  }

  private trimMoltenLavaPoolsToCap(): void {
    while (this.moltenLavaPools.size > this.moltenLavaConfig.maxPools) {
      const firstKey = this.moltenLavaPools.keys().next().value;
      if (firstKey === undefined) {
        return;
      }
      this.moltenLavaPools.delete(firstKey);
    }
  }

  private gridPosKey(pos: GridPos): string {
    return `${pos.col}:${pos.row}`;
  }

  private syncBiomeRuntimeToBridge(): void {
    gameBridge.setCurrentBiome(this.biomeManager.getCurrentBiome());
    gameBridge.setBiomeVisitStats(this.biomeManager.getVisitStats());
  }

  private applyBiomeMovementMechanics(biome: Biome): void {
    if (!this.snake) {
      return;
    }
    const turnMomentumTiles =
      biome === Biome.IceCavern ? ICE_CAVERN_TURN_MOMENTUM_TILES : 0;
    this.snake.setTurnMomentumTiles(turnMomentumTiles);
  }

  private applyBiomeVisualTheme(biome: Biome): void {
    const theme = BIOME_VISUAL_THEMES[biome];
    this.cameras.main?.setBackgroundColor?.(theme.backgroundColor);
    this.drawGrid(theme.gridLineColor, theme.gridLineAlpha);
  }

  private drawGrid(lineColor: number, lineAlpha: number): void {
    this.gridGraphics?.destroy?.();
    const gfx = this.add.graphics();
    this.gridGraphics = gfx;
    gfx.lineStyle(1, lineColor, lineAlpha);

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
