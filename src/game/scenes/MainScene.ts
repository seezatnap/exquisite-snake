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
import { isInBounds, type Direction, type GridPos } from "../utils/grid";
import { Snake } from "../entities/Snake";
import { Food } from "../entities/Food";
import { emitFoodParticles, shakeCamera } from "../systems/effects";
import {
  Biome,
  BiomeManager,
  type BiomeTransition,
  type BiomeVisitStats,
} from "../systems/BiomeManager";
import {
  type BiomeMechanicsConfig,
  type BiomeMechanicsConfigPatch,
  type MoltenLavaConfig,
  DEFAULT_BIOME_MECHANICS_CONFIG,
  cloneBiomeMechanicsConfig,
  mergeBiomeMechanicsConfig,
  normalizeRandomHook,
  sampleBiomeRandom,
} from "../systems/biomeMechanics";

// ── Default spawn configuration ─────────────────────────────────

/** Default head position for the snake at the start of a run. */
const DEFAULT_HEAD_POS: GridPos = {
  col: Math.floor(GRID_COLS / 2),
  row: Math.floor(GRID_ROWS / 2),
};
const DEFAULT_DIRECTION = "right" as const;
const DEFAULT_SNAKE_LENGTH = 3;
const VOID_RIFT_CENTER: GridPos = {
  col: Math.floor(GRID_COLS / 2),
  row: Math.floor(GRID_ROWS / 2),
};

interface BiomeVisualTheme {
  backgroundColor: number;
  gridLineColor: number;
  gridLineAlpha: number;
  tilemapPrimaryColor: number;
  tilemapPrimaryAlpha: number;
  tilemapAccentColor: number;
  tilemapAccentAlpha: number;
  backdropPrimaryColor: number;
  backdropPrimaryAlpha: number;
  backdropAccentColor: number;
  backdropAccentAlpha: number;
}

const BIOME_VISUAL_THEMES: Record<Biome, BiomeVisualTheme> = {
  [Biome.NeonCity]: {
    backgroundColor: COLORS.BACKGROUND,
    gridLineColor: COLORS.GRID_LINE,
    gridLineAlpha: 0.08,
    tilemapPrimaryColor: 0x00d5e2,
    tilemapPrimaryAlpha: 0.14,
    tilemapAccentColor: 0xff4b8f,
    tilemapAccentAlpha: 0.12,
    backdropPrimaryColor: 0x00f0ff,
    backdropPrimaryAlpha: 0.12,
    backdropAccentColor: 0xff2d78,
    backdropAccentAlpha: 0.1,
  },
  [Biome.IceCavern]: {
    backgroundColor: 0x081624,
    gridLineColor: 0x7dc6ff,
    gridLineAlpha: 0.1,
    tilemapPrimaryColor: 0x8ed5ff,
    tilemapPrimaryAlpha: 0.16,
    tilemapAccentColor: 0xd3f1ff,
    tilemapAccentAlpha: 0.12,
    backdropPrimaryColor: 0x8fdcff,
    backdropPrimaryAlpha: 0.16,
    backdropAccentColor: 0xf0fbff,
    backdropAccentAlpha: 0.12,
  },
  [Biome.MoltenCore]: {
    backgroundColor: 0x1a0d05,
    gridLineColor: 0xff8a3d,
    gridLineAlpha: 0.13,
    tilemapPrimaryColor: 0xff7a33,
    tilemapPrimaryAlpha: 0.16,
    tilemapAccentColor: 0xffcb71,
    tilemapAccentAlpha: 0.12,
    backdropPrimaryColor: 0xff6026,
    backdropPrimaryAlpha: 0.18,
    backdropAccentColor: 0xffb362,
    backdropAccentAlpha: 0.14,
  },
  [Biome.VoidRift]: {
    backgroundColor: 0x060510,
    gridLineColor: 0x8a63ff,
    gridLineAlpha: 0.11,
    tilemapPrimaryColor: 0x7855de,
    tilemapPrimaryAlpha: 0.14,
    tilemapAccentColor: 0xba9bff,
    tilemapAccentAlpha: 0.11,
    backdropPrimaryColor: 0x7b59ff,
    backdropPrimaryAlpha: 0.14,
    backdropAccentColor: 0xdfd2ff,
    backdropAccentAlpha: 0.1,
  },
};

const BIOME_LAYER_DEPTH = {
  BACKDROP: -30,
  TILEMAP: -20,
  GRID: -10,
} as const;

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

  /** Shared balancing knobs for Ice, Molten, and Void biome mechanics. */
  private biomeMechanicsConfig: BiomeMechanicsConfig = cloneBiomeMechanicsConfig(
    DEFAULT_BIOME_MECHANICS_CONFIG,
  );

  /** Active lava pools keyed by `col:row`. */
  private moltenLavaPools = new Map<string, GridPos>();

  /** Spawn timer accumulator used while Molten Core is active. */
  private moltenLavaSpawnElapsedMs = 0;

  /** Graphics object used to render biome-specific backdrop motifs. */
  private backdropGraphics: Phaser.GameObjects.Graphics | null = null;

  /** Graphics object used to render biome-specific tilemap motifs. */
  private tilemapGraphics: Phaser.GameObjects.Graphics | null = null;

  /** Graphics object used to render biome-specific arena grid lines. */
  private gridGraphics: Phaser.GameObjects.Graphics | null = null;

  /** Number of snake steps elapsed since entering Void Rift. */
  private voidGravityStepCounter = 0;

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
    this.backdropGraphics?.destroy?.();
    this.backdropGraphics = null;
    this.tilemapGraphics?.destroy?.();
    this.tilemapGraphics = null;
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
      if (this.checkCollisions()) {
        return; // Game over — stop processing this frame
      }

      this.resolveFoodConsumption();

      const gravityApplied = this.applyVoidRiftGravityNudgeIfDue();
      if (gravityApplied) {
        if (this.checkCollisions()) {
          return;
        }
        this.resolveFoodConsumption();
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
    this.voidGravityStepCounter = 0;
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
    this.rng = normalizeRandomHook(rng, this.rng);
  }

  /** Get the current RNG function. */
  getRng(): () => number {
    return this.rng;
  }

  /** Override shared biome balancing knobs (Ice, Molten, Void). */
  setBiomeMechanicsConfig(config: BiomeMechanicsConfigPatch): void {
    this.biomeMechanicsConfig = mergeBiomeMechanicsConfig(
      this.biomeMechanicsConfig,
      config,
    );
    this.trimMoltenLavaPoolsToCap();
    this.applyBiomeMovementMechanics(this.biomeManager.getCurrentBiome());
  }

  /** Snapshot of the currently active biome-mechanics balancing config. */
  getBiomeMechanicsConfig(): BiomeMechanicsConfig {
    return cloneBiomeMechanicsConfig(this.biomeMechanicsConfig);
  }

  /** Backward-compatible Molten Core config override used by existing tests. */
  setMoltenLavaConfig(config: Partial<MoltenLavaConfig>): void {
    this.setBiomeMechanicsConfig({ moltenCore: config });
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

    if (biome === Biome.VoidRift) {
      this.voidGravityStepCounter = 0;
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

    const moltenConfig = this.biomeMechanicsConfig.moltenCore;
    this.moltenLavaSpawnElapsedMs += delta;

    while (this.moltenLavaSpawnElapsedMs >= moltenConfig.spawnIntervalMs) {
      this.moltenLavaSpawnElapsedMs -= moltenConfig.spawnIntervalMs;
      this.trySpawnMoltenLavaPool();
    }
  }

  private trySpawnMoltenLavaPool(): void {
    const moltenConfig = this.biomeMechanicsConfig.moltenCore;
    if (this.moltenLavaPools.size >= moltenConfig.maxPools) {
      return;
    }

    if (sampleBiomeRandom(this.rng) >= moltenConfig.spawnChancePerInterval) {
      return;
    }

    const freeCells = this.getMoltenLavaSpawnCandidates();
    if (freeCells.length === 0) {
      return;
    }

    const poolIndex = Math.floor(sampleBiomeRandom(this.rng) * freeCells.length);
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

    const survived = this.snake.burnTailSegments(
      this.biomeMechanicsConfig.moltenCore.burnTailSegments,
    );
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
    while (this.moltenLavaPools.size > this.biomeMechanicsConfig.moltenCore.maxPools) {
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
    const turnMomentumTiles = biome === Biome.IceCavern
      ? this.biomeMechanicsConfig.iceCavern.turnMomentumTiles
      : 0;
    this.snake.setTurnMomentumTiles(turnMomentumTiles);
  }

  private resolveFoodConsumption(): void {
    if (!this.snake || !this.food) {
      return;
    }

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

  private applyVoidRiftGravityNudgeIfDue(): boolean {
    if (!this.snake || this.biomeManager.getCurrentBiome() !== Biome.VoidRift) {
      return false;
    }

    this.voidGravityStepCounter += 1;
    const cadenceSteps = this.biomeMechanicsConfig.voidRift.gravityPullCadenceSteps;
    if (this.voidGravityStepCounter % cadenceSteps !== 0) {
      return false;
    }

    const pullDirection = this.getVoidRiftPullDirection(this.snake.getHeadPosition());
    if (!pullDirection) {
      return false;
    }

    this.snake.applyExternalNudge(pullDirection);
    return true;
  }

  private getVoidRiftPullDirection(head: GridPos): Direction | null {
    const deltaCol = VOID_RIFT_CENTER.col - head.col;
    const deltaRow = VOID_RIFT_CENTER.row - head.row;

    if (deltaCol === 0 && deltaRow === 0) {
      return null;
    }

    if (Math.abs(deltaCol) > Math.abs(deltaRow)) {
      return deltaCol > 0 ? "right" : "left";
    }
    if (Math.abs(deltaRow) > Math.abs(deltaCol)) {
      return deltaRow > 0 ? "down" : "up";
    }

    // Use the injectable RNG so replay sessions get deterministic tie-breaks.
    const preferHorizontal = sampleBiomeRandom(this.rng) < 0.5;
    if (preferHorizontal) {
      return deltaCol > 0 ? "right" : "left";
    }
    return deltaRow > 0 ? "down" : "up";
  }

  private applyBiomeVisualTheme(biome: Biome): void {
    const theme = BIOME_VISUAL_THEMES[biome];
    this.cameras.main?.setBackgroundColor?.(theme.backgroundColor);
    this.drawBackdrop(biome, theme);
    this.drawTilemap(biome, theme);
    this.drawGrid(theme.gridLineColor, theme.gridLineAlpha);
  }

  private drawBackdrop(biome: Biome, theme: BiomeVisualTheme): void {
    this.backdropGraphics?.destroy?.();
    const gfx = this.add.graphics();
    this.backdropGraphics = gfx;
    gfx.setDepth?.(BIOME_LAYER_DEPTH.BACKDROP);

    gfx.lineStyle(2, theme.backdropPrimaryColor, theme.backdropPrimaryAlpha);
    switch (biome) {
      case Biome.NeonCity:
        this.drawNeonBackdrop(gfx);
        break;
      case Biome.IceCavern:
        this.drawIceBackdrop(gfx);
        break;
      case Biome.MoltenCore:
        this.drawMoltenBackdrop(gfx);
        break;
      case Biome.VoidRift:
        this.drawVoidBackdrop(gfx);
        break;
    }
    gfx.strokePath();

    gfx.lineStyle(1, theme.backdropAccentColor, theme.backdropAccentAlpha);
    this.drawBackdropAccent(biome, gfx);
    gfx.strokePath();
  }

  private drawTilemap(biome: Biome, theme: BiomeVisualTheme): void {
    this.tilemapGraphics?.destroy?.();
    const gfx = this.add.graphics();
    this.tilemapGraphics = gfx;
    gfx.setDepth?.(BIOME_LAYER_DEPTH.TILEMAP);

    gfx.lineStyle(1, theme.tilemapPrimaryColor, theme.tilemapPrimaryAlpha);
    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        if (!this.shouldDrawTilePrimary(biome, col, row)) {
          continue;
        }

        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;
        gfx.moveTo(x + 2, y + TILE_SIZE / 2);
        gfx.lineTo(x + TILE_SIZE - 2, y + TILE_SIZE / 2);
      }
    }
    gfx.strokePath();

    gfx.lineStyle(1, theme.tilemapAccentColor, theme.tilemapAccentAlpha);
    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        if (!this.shouldDrawTileAccent(biome, col, row)) {
          continue;
        }

        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;
        gfx.moveTo(x + TILE_SIZE / 2, y + 2);
        gfx.lineTo(x + TILE_SIZE / 2, y + TILE_SIZE - 2);
      }
    }
    gfx.strokePath();
  }

  private shouldDrawTilePrimary(biome: Biome, col: number, row: number): boolean {
    switch (biome) {
      case Biome.NeonCity:
        return (col + row) % 2 === 0;
      case Biome.IceCavern:
        return row % 2 === 0;
      case Biome.MoltenCore:
        return (col * 3 + row) % 5 < 2;
      case Biome.VoidRift:
        return (col + row * 2) % 4 === 0;
    }
  }

  private shouldDrawTileAccent(biome: Biome, col: number, row: number): boolean {
    switch (biome) {
      case Biome.NeonCity:
        return col % 3 === 0 && row % 2 === 0;
      case Biome.IceCavern:
        return col % 4 === 0 && row % 3 !== 1;
      case Biome.MoltenCore:
        return (col + row) % 4 === 1;
      case Biome.VoidRift:
        return (col * 2 + row) % 5 === 0;
    }
  }

  private drawNeonBackdrop(gfx: Phaser.GameObjects.Graphics): void {
    for (let col = 0; col <= GRID_COLS; col += 4) {
      const x = col * TILE_SIZE;
      gfx.moveTo(x, 0);
      gfx.lineTo(Math.min(ARENA_WIDTH, x + TILE_SIZE * 2), ARENA_HEIGHT);
    }
    for (let row = 3; row <= GRID_ROWS; row += 5) {
      const y = row * TILE_SIZE;
      gfx.moveTo(0, y);
      gfx.lineTo(ARENA_WIDTH, y);
    }
  }

  private drawIceBackdrop(gfx: Phaser.GameObjects.Graphics): void {
    for (let row = 2; row <= GRID_ROWS; row += 4) {
      const y = row * TILE_SIZE;
      gfx.moveTo(0, y);
      gfx.lineTo(ARENA_WIDTH, Math.min(ARENA_HEIGHT, y + TILE_SIZE / 2));
    }
    for (let col = 2; col <= GRID_COLS; col += 6) {
      const x = col * TILE_SIZE;
      gfx.moveTo(x, 0);
      gfx.lineTo(Math.max(0, x - TILE_SIZE * 2), ARENA_HEIGHT);
    }
  }

  private drawMoltenBackdrop(gfx: Phaser.GameObjects.Graphics): void {
    for (let col = 1; col <= GRID_COLS; col += 5) {
      const baseX = col * TILE_SIZE;
      gfx.moveTo(baseX, 0);
      for (let row = 1; row <= GRID_ROWS; row += 3) {
        const y = row * TILE_SIZE;
        const direction = (col + row) % 2 === 0 ? 1 : -1;
        gfx.lineTo(baseX + direction * (TILE_SIZE * 0.8), y);
      }
    }
  }

  private drawVoidBackdrop(gfx: Phaser.GameObjects.Graphics): void {
    const centerX = ARENA_WIDTH / 2;
    const centerY = ARENA_HEIGHT / 2;
    const radiusX = ARENA_WIDTH * 0.55;
    const radiusY = ARENA_HEIGHT * 0.55;

    for (let angle = 0; angle < 360; angle += 30) {
      const radians = (angle * Math.PI) / 180;
      gfx.moveTo(centerX, centerY);
      gfx.lineTo(
        centerX + Math.cos(radians) * radiusX,
        centerY + Math.sin(radians) * radiusY,
      );
    }
  }

  private drawBackdropAccent(biome: Biome, gfx: Phaser.GameObjects.Graphics): void {
    switch (biome) {
      case Biome.NeonCity: {
        for (let row = 1; row < GRID_ROWS; row += 6) {
          const y = row * TILE_SIZE;
          gfx.moveTo(0, y);
          gfx.lineTo(ARENA_WIDTH, Math.min(ARENA_HEIGHT, y + TILE_SIZE * 1.5));
        }
        break;
      }
      case Biome.IceCavern: {
        for (let col = 1; col < GRID_COLS; col += 5) {
          const x = col * TILE_SIZE;
          gfx.moveTo(x, 0);
          gfx.lineTo(x, ARENA_HEIGHT);
        }
        break;
      }
      case Biome.MoltenCore: {
        for (let row = 2; row < GRID_ROWS; row += 4) {
          const y = row * TILE_SIZE;
          gfx.moveTo(0, y);
          gfx.lineTo(ARENA_WIDTH, y - TILE_SIZE / 2);
        }
        break;
      }
      case Biome.VoidRift: {
        const centerX = ARENA_WIDTH / 2;
        const centerY = ARENA_HEIGHT / 2;
        for (let ring = 1; ring <= 4; ring++) {
          const halfWidth = ring * TILE_SIZE * 3;
          const halfHeight = ring * TILE_SIZE * 2;
          gfx.moveTo(centerX - halfWidth, centerY);
          gfx.lineTo(centerX, centerY - halfHeight);
          gfx.lineTo(centerX + halfWidth, centerY);
          gfx.lineTo(centerX, centerY + halfHeight);
          gfx.lineTo(centerX - halfWidth, centerY);
        }
        break;
      }
    }
  }

  private drawGrid(lineColor: number, lineAlpha: number): void {
    this.gridGraphics?.destroy?.();
    const gfx = this.add.graphics();
    this.gridGraphics = gfx;
    gfx.setDepth?.(BIOME_LAYER_DEPTH.GRID);
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
