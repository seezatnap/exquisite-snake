import Phaser from "phaser";
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  TILE_SIZE,
  GRID_COLS,
  GRID_ROWS,
  COLORS,
  RENDER_DEPTH,
} from "../config";
import { gameBridge, type GamePhase } from "../bridge";
import { loadHighScore, saveHighScore } from "../utils/storage";
import {
  isInBounds,
  gridToPixel,
  oppositeDirection,
  stepInDirection,
  type Direction,
  type GridPos,
} from "../utils/grid";
import { Snake } from "../entities/Snake";
import { Food } from "../entities/Food";
import { EchoGhost, type EchoGhostSnapshot } from "../entities/EchoGhost";
import { emitFoodParticles, shakeCamera } from "../systems/effects";
import {
  Biome,
  BIOME_CONFIG,
  BiomeManager,
  parseBiomeCycleOrder,
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
const VOID_RIFT_VORTEX_SPIN_RADIANS_PER_SEC = Math.PI * 0.75;

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
  TRANSITION_OVERLAY: 40,
  SHIFT_COUNTDOWN: 50,
} as const;

const BIOME_TRANSITION_DURATION_MS = 320;
const BIOME_TRANSITION_SHAKE_DURATION_MS = 110;
const BIOME_TRANSITION_SHAKE_INTENSITY = 0.0035;
const BIOME_TRANSITION_OVERLAY_ALPHA = 0.9;
const BIOME_ORDER_QUERY_PARAM = "biomeOrder";
const BIOME_SHIFT_COUNTDOWN_WINDOW_MS = 3_000;
const BIOME_SHIFT_COUNTDOWN_ALPHA = 0.65;
const BIOME_SHIFT_COUNTDOWN_SHAKE_X_PX = 10;
const BIOME_SHIFT_COUNTDOWN_SHAKE_Y_PX = 7;
const BIOME_SHIFT_COUNTDOWN_NUMBER_Y_OFFSET_PX = -40;
const BIOME_SHIFT_COUNTDOWN_LABEL_Y_OFFSET_PX = 88;
const ECHO_GHOST_RENDER_DEPTH = RENDER_DEPTH.SNAKE - 1;
const ECHO_GHOST_OUTLINE_ALPHA = 0.4;
const ECHO_GHOST_OUTLINE_WIDTH_PX = 2;
const ECHO_GHOST_DASH_LENGTH_PX = 6;
const ECHO_GHOST_DASH_GAP_PX = 4;
const ECHO_GHOST_SEGMENT_INSET_PX = 2;
const ECHO_GHOST_TRAIL_SPAWN_INTERVAL_MS = 90;
const ECHO_GHOST_TRAIL_LIFESPAN_MS = 420;
const ECHO_GHOST_TRAIL_MAX_PARTICLES = 40;
const ECHO_GHOST_TRAIL_RADIUS_PX = TILE_SIZE * 0.24;

interface BiomeTransitionEffectState {
  from: Biome;
  elapsedMs: number;
}
interface BiomeMechanicsState {
  iceMomentumActive: boolean;
  moltenLavaActive: boolean;
  voidGravityActive: boolean;
}
interface EchoGhostTrailParticle {
  x: number;
  y: number;
  ageMs: number;
  lifespanMs: number;
  radiusPx: number;
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

  /** Delayed playback of historical snake path for Echo Ghost mechanics. */
  private echoGhost: EchoGhost | null = null;

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

  /** Graphics object used to render biome transition wipes over gameplay. */
  private biomeTransitionOverlayGraphics: Phaser.GameObjects.Graphics | null =
    null;

  /** Active biome transition wipe metadata (null when no transition is animating). */
  private biomeTransitionEffect: BiomeTransitionEffectState | null = null;

  /** Large center-screen countdown number shown before a biome shift. */
  private biomeShiftCountdownValueText: Phaser.GameObjects.Text | null = null;

  /** Subtitle under the countdown (e.g. "BIOME SHIFT: ICE CAVERN"). */
  private biomeShiftCountdownLabelText: Phaser.GameObjects.Text | null = null;

  /** Running time used to animate the countdown shake jitter. */
  private biomeShiftCountdownShakeElapsedMs = 0;

  /** Graphics object used for mechanic-linked overlays (lava pools / void vortex). */
  private biomeMechanicGraphics: Phaser.GameObjects.Graphics | null = null;

  /** Graphics object used to render the delayed echo-ghost overlay. */
  private echoGhostGraphics: Phaser.GameObjects.Graphics | null = null;

  /** Short-lived particles that trail behind the delayed ghost path. */
  private echoGhostTrailParticles: EchoGhostTrailParticle[] = [];

  /** Time accumulator that controls periodic ghost trail particle spawns. */
  private echoGhostTrailSpawnElapsedMs = 0;

  /** Last ghost head position used to detect movement for trail spawning. */
  private lastEchoGhostHead: GridPos | null = null;

  /** Number of snake steps elapsed since entering Void Rift. */
  private voidGravityStepCounter = 0;

  /** Current animated spin offset for the Void Rift center vortex. */
  private voidVortexSpinRadians = 0;

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
    this.applyBiomeCycleOrderOverrideFromUrl();
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
    this.clearBiomeTransitionEffect();
    this.destroyEntities();
    this.backdropGraphics?.destroy?.();
    this.backdropGraphics = null;
    this.tilemapGraphics?.destroy?.();
    this.tilemapGraphics = null;
    this.gridGraphics?.destroy?.();
    this.gridGraphics = null;
    this.biomeMechanicGraphics?.destroy?.();
    this.biomeMechanicGraphics = null;
    this.destroyEchoGhostVisuals();
    this.destroyBiomeShiftCountdown();
  }

  update(_time: number, delta: number): void {
    if (gameBridge.getState().phase !== "playing") {
      this.clearBiomeShiftCountdown();
      this.clearEchoGhostVisualState();
      return;
    }

    gameBridge.setElapsedTime(gameBridge.getState().elapsedTime + delta);
    this.updateBiomeState(delta);

    if (!this.snake || !this.food || !this.echoGhost) return;
    this.echoGhost.advance(delta);
    this.updateEchoGhostVisuals(delta);
    this.updateMoltenCoreMechanics(delta);
    this.updateBiomeMechanicVisuals(delta);

    const stepped = this.snake.update(delta);

    if (stepped) {
      if (this.checkCollisions()) {
        return; // Game over — stop processing this frame
      }

      this.resolveFoodConsumption();

      const gravityApplied = this.applyVoidRiftGravityNudgeIfDue();
      if (gravityApplied) {
        if (this.checkCollisions()) {
          this.echoGhost.recordPath(this.snake.getSegments());
          return;
        }
        this.resolveFoodConsumption();
      }

      this.echoGhost.recordPath(this.snake.getSegments());
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
    this.biomeManager.startRun();
    gameBridge.resetRun({
      currentBiome: this.biomeManager.getCurrentBiome(),
      biomeVisitStats: this.biomeManager.getVisitStats(),
    });
    this.resetMoltenCoreState();
    this.clearBiomeTransitionEffect();
    this.clearBiomeShiftCountdown();
    this.voidGravityStepCounter = 0;
    this.voidVortexSpinRadians = 0;
    this.destroyBiomeMechanicGraphics();
    this.handleBiomeEnter(this.biomeManager.getCurrentBiome());
    this.destroyEntities();
    this.createEntities();
  }

  /** End the current run: kill snake, persist high-score, transition to gameOver. */
  endRun(): void {
    shakeCamera(this);
    this.biomeManager.stopRun();
    this.resetMoltenCoreState();
    this.clearBiomeTransitionEffect();
    this.clearBiomeShiftCountdown();
    this.destroyBiomeMechanicGraphics();
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
    this.echoGhost = new EchoGhost();
    this.echoGhost.recordPath(this.snake.getSegments());
    this.ensureEchoGhostGraphics();
    this.clearEchoGhostVisualState();
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
    if (this.echoGhost) {
      this.echoGhost.reset();
      this.echoGhost = null;
    }
    this.destroyEchoGhostVisuals();
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

    if (this.isVoidRiftCenterHazard(head)) {
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

  /** Override the run biome order (must be a full permutation of all biomes). */
  setBiomeCycleOrder(order: readonly Biome[]): void {
    this.biomeManager.setCycleOrder(order);
    this.resetMoltenCoreState();
    this.clearBiomeTransitionEffect();
    this.clearBiomeShiftCountdown();
    this.voidGravityStepCounter = 0;
    this.voidVortexSpinRadians = 0;
    this.destroyBiomeMechanicGraphics();

    const currentBiome = this.biomeManager.getCurrentBiome();
    this.syncBiomeRuntimeToBridge();
    this.applyBiomeMovementMechanics(currentBiome);
    this.applyBiomeVisualTheme(currentBiome);
    this.updateBiomeMechanicVisuals(0);
  }

  // ── Entity accessors (for tests and external integration) ────

  getSnake(): Snake | null {
    return this.snake;
  }

  getFood(): Food | null {
    return this.food;
  }

  getEchoGhost(): EchoGhost | null {
    return this.echoGhost;
  }

  /**
   * Rewind integration hook: capture the active EchoGhost buffer/timing snapshot.
   */
  createEchoGhostSnapshot(): EchoGhostSnapshot | null {
    return this.echoGhost?.createSnapshot() ?? null;
  }

  /**
   * Rewind integration hook: restore a previously captured EchoGhost snapshot.
   */
  restoreEchoGhostSnapshot(snapshot: EchoGhostSnapshot | null): void {
    if (!this.echoGhost || !snapshot) {
      return;
    }
    this.echoGhost.restoreSnapshot(snapshot);
    this.clearEchoGhostVisualState();
  }

  // ── Arena grid ──────────────────────────────────────────────

  private updateBiomeState(delta: number): void {
    this.updateBiomeTransitionEffect(delta);
    const transitions = this.biomeManager.update(delta);
    this.updateBiomeShiftCountdown(delta);
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
    this.startBiomeTransitionEffect(transition.from);
  }

  private handleBiomeEnter(biome: Biome): void {
    if (biome === Biome.MoltenCore) {
      this.moltenLavaSpawnElapsedMs = 0;
    }

    if (biome === Biome.VoidRift) {
      this.voidGravityStepCounter = 0;
      this.voidVortexSpinRadians = 0;
    }

    const mechanics = createBiomeMechanicsState(biome);
    gameBridge.emitBiomeEnter(biome);
    this.events?.emit?.("biomeEnter", biome);
    this.events?.emit?.("biomeMechanicsChange", mechanics);
    this.applyBiomeMovementMechanics(biome);
    this.applyBiomeVisualTheme(biome);
    this.updateBiomeMechanicVisuals(0);
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

  private applyBiomeCycleOrderOverrideFromUrl(): void {
    const search = globalThis?.location?.search;
    if (typeof search !== "string" || search.length === 0) {
      return;
    }

    const rawOrder = new URLSearchParams(search).get(BIOME_ORDER_QUERY_PARAM);
    const parsedOrder = parseBiomeCycleOrder(rawOrder);
    if (!parsedOrder) {
      return;
    }

    this.biomeManager.setCycleOrder(parsedOrder);
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
    this.applyVoidRiftInputGuard(biome);
  }

  private applyVoidRiftInputGuard(biome: Biome): void {
    if (!this.snake) {
      return;
    }

    if (biome !== Biome.VoidRift) {
      this.snake.setDirectionInputGuard(null);
      return;
    }

    this.snake.setDirectionInputGuard((dir) => {
      const activeSnake = this.snake;
      if (!activeSnake) {
        return true;
      }
      const pullDirection = this.getVoidRiftPullDirection(
        activeSnake.getHeadPosition(),
      );
      if (!pullDirection) {
        return true;
      }
      return dir !== oppositeDirection(pullDirection);
    });
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
    const head = this.snake.getHeadPosition();
    const cadenceSteps = this.getVoidRiftGravityCadenceSteps(head);
    if (this.voidGravityStepCounter % cadenceSteps !== 0) {
      return false;
    }

    if (this.snake.consumeRejectedOppositeDirectionInput()) {
      return false;
    }

    const pullDirection = this.getVoidRiftPullDirection(head);
    if (!pullDirection) {
      return false;
    }

    // If the player is steering against the pull, treat gravity as canceled
    // for this cadence step to avoid accidental "forced reversal" deaths.
    const counterPullDirection = oppositeDirection(pullDirection);
    if (
      this.snake.getDirection() === counterPullDirection ||
      this.snake.hasQueuedDirection(counterPullDirection)
    ) {
      return false;
    }

    // Skip the nudge if it would push the head onto the snake's own body.
    const nudgeDest = stepInDirection(head, pullDirection);
    if (this.snake.isOnBody(nudgeDest)) {
      return false;
    }

    this.snake.applyExternalNudge(pullDirection);
    return true;
  }

  private getVoidRiftGravityCadenceSteps(head: GridPos): number {
    const baseCadence = this.biomeMechanicsConfig.voidRift.gravityPullCadenceSteps;
    const distanceFromCenter =
      Math.abs(head.col - VOID_RIFT_CENTER.col) +
      Math.abs(head.row - VOID_RIFT_CENTER.row);

    if (distanceFromCenter <= 6) {
      return Math.max(1, baseCadence - 1);
    }
    if (distanceFromCenter >= 26) {
      return baseCadence + 1;
    }
    return baseCadence;
  }

  private isVoidRiftCenterHazard(head: GridPos): boolean {
    return (
      this.biomeManager.getCurrentBiome() === Biome.VoidRift &&
      head.col === VOID_RIFT_CENTER.col &&
      head.row === VOID_RIFT_CENTER.row
    );
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

  private updateBiomeMechanicVisuals(delta: number): void {
    const biome = this.biomeManager.getCurrentBiome();

    if (biome !== Biome.MoltenCore && biome !== Biome.VoidRift) {
      this.destroyBiomeMechanicGraphics();
      return;
    }

    if (!this.biomeMechanicGraphics) {
      this.biomeMechanicGraphics = this.add.graphics();
      this.biomeMechanicGraphics.setDepth?.(RENDER_DEPTH.BIOME_MECHANIC);
    }

    const gfx = this.biomeMechanicGraphics;
    gfx.clear?.();

    if (biome === Biome.MoltenCore) {
      this.drawMoltenLavaPoolVisuals(gfx);
      return;
    }

    this.voidVortexSpinRadians =
      (this.voidVortexSpinRadians +
        (delta / 1_000) * VOID_RIFT_VORTEX_SPIN_RADIANS_PER_SEC) %
      (Math.PI * 2);
    this.drawVoidCenterVortex(gfx, this.voidVortexSpinRadians);
  }

  private destroyBiomeMechanicGraphics(): void {
    this.biomeMechanicGraphics?.destroy?.();
    this.biomeMechanicGraphics = null;
  }

  private drawMoltenLavaPoolVisuals(gfx: Phaser.GameObjects.Graphics): void {
    for (const pool of this.moltenLavaPools.values()) {
      const center = gridToPixel(pool);
      const outerRadius = TILE_SIZE * 0.42;

      gfx.fillStyle?.(0xff5b1f, 0.8);
      gfx.fillCircle?.(center.x, center.y, outerRadius);
      gfx.fillStyle?.(0xffc56f, 0.6);
      gfx.fillCircle?.(center.x, center.y, outerRadius * 0.58);
      gfx.lineStyle(1, 0x5c1500, 0.7);

      const crackRadius = outerRadius * 0.9;
      gfx.moveTo(center.x - crackRadius, center.y);
      gfx.lineTo(center.x + crackRadius, center.y);
      gfx.moveTo(center.x, center.y - crackRadius);
      gfx.lineTo(center.x, center.y + crackRadius);
      gfx.strokePath();
    }
  }

  private drawVoidCenterVortex(
    gfx: Phaser.GameObjects.Graphics,
    spinRadians: number,
  ): void {
    const center = gridToPixel(VOID_RIFT_CENTER);
    const ringCount = 4;
    const ringSegments = 20;
    const maxRadius = TILE_SIZE * 6;

    for (let ring = 0; ring < ringCount; ring++) {
      const ringT = ring / ringCount;
      const radius = maxRadius - ring * TILE_SIZE * 1.2;
      const alpha = 0.26 - ringT * 0.05;
      gfx.lineStyle(2 - ringT, 0x8d68ff, alpha);

      for (let segment = 0; segment <= ringSegments; segment++) {
        const segmentT = segment / ringSegments;
        const angle =
          spinRadians * (1 + ringT * 0.7) +
          segmentT * Math.PI * 2 +
          ring * 0.45;
        const spiralPull = 1 - segmentT * 0.28;
        const x = center.x + Math.cos(angle) * radius * spiralPull;
        const y = center.y + Math.sin(angle) * radius * spiralPull * 0.8;

        if (segment === 0) {
          gfx.moveTo(x, y);
        } else {
          gfx.lineTo(x, y);
        }
      }

      gfx.strokePath();
    }

    gfx.fillStyle?.(0x5a2cd8, 0.48);
    gfx.fillCircle?.(center.x, center.y, TILE_SIZE * 1.45);
    gfx.fillStyle?.(0xd6c8ff, 0.58);
    gfx.fillCircle?.(center.x, center.y, TILE_SIZE * 0.62);
  }

  private applyBiomeVisualTheme(biome: Biome): void {
    const theme = BIOME_VISUAL_THEMES[biome];
    this.cameras.main?.setBackgroundColor?.(theme.backgroundColor);
    this.drawBackdrop(biome, theme);
    this.drawTilemap(biome, theme);
    this.drawGrid(theme.gridLineColor, theme.gridLineAlpha);
    this.syncGameplayLayering();
  }

  /**
   * Keep gameplay sprites above arena graphics after biome redraws.
   *
   * Biome transitions recreate backdrop/tilemap/grid graphics while the
   * snake and food remain alive, so we explicitly re-assert gameplay depths.
   */
  private syncGameplayLayering(): void {
    this.gridGraphics?.setDepth?.(RENDER_DEPTH.BIOME_GRID);
    this.food?.getSprite()?.setDepth?.(RENDER_DEPTH.FOOD);
    this.echoGhostGraphics?.setDepth?.(ECHO_GHOST_RENDER_DEPTH);
    this.snake?.setRenderDepth(RENDER_DEPTH.SNAKE);
    this.children?.depthSort?.();
  }

  private ensureEchoGhostGraphics(): boolean {
    if (this.echoGhostGraphics) {
      return true;
    }

    const addFactory = this.add as unknown as {
      graphics?: () => Phaser.GameObjects.Graphics;
    };
    if (typeof addFactory.graphics !== "function") {
      return false;
    }

    const graphics = addFactory.graphics();
    graphics.setDepth?.(ECHO_GHOST_RENDER_DEPTH);
    this.echoGhostGraphics = graphics;
    return true;
  }

  private clearEchoGhostVisualState(): void {
    this.echoGhostGraphics?.clear?.();
    this.echoGhostTrailParticles = [];
    this.echoGhostTrailSpawnElapsedMs = 0;
    this.lastEchoGhostHead = null;
  }

  private destroyEchoGhostVisuals(): void {
    this.clearEchoGhostVisualState();
    this.echoGhostGraphics?.destroy?.();
    this.echoGhostGraphics = null;
  }

  private updateEchoGhostVisuals(delta: number): void {
    if (!this.ensureEchoGhostGraphics()) {
      return;
    }

    const gfx = this.echoGhostGraphics!;
    gfx.clear?.();

    const ghost = this.echoGhost;
    const ghostOpacity = ghost?.getOpacity() ?? 0;
    const renderOpacity = Math.max(
      0,
      Math.min(1, ghostOpacity * ECHO_GHOST_OUTLINE_ALPHA),
    );
    const segments =
      ghost && ghost.isActive() ? ghost.getPlaybackSegments() : [];
    const tintColor = this.getEchoGhostTintForCurrentBiome();

    this.updateEchoGhostTrailParticles(delta, segments);
    this.drawEchoGhostTrailParticles(gfx, tintColor, renderOpacity);

    if (segments.length === 0 || renderOpacity <= 0) {
      return;
    }

    gfx.lineStyle(ECHO_GHOST_OUTLINE_WIDTH_PX, tintColor, renderOpacity);
    for (const segment of segments) {
      this.drawEchoGhostDashedSegment(gfx, segment);
    }
    gfx.strokePath?.();
  }

  private getEchoGhostTintForCurrentBiome(): number {
    const biome = this.biomeManager.getCurrentBiome();
    return BIOME_VISUAL_THEMES[biome].tilemapAccentColor;
  }

  private updateEchoGhostTrailParticles(
    delta: number,
    ghostSegments: readonly GridPos[],
  ): void {
    const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    for (const particle of this.echoGhostTrailParticles) {
      particle.ageMs += safeDelta;
    }
    this.echoGhostTrailParticles = this.echoGhostTrailParticles.filter((particle) =>
      particle.ageMs < particle.lifespanMs
    );

    if (ghostSegments.length === 0) {
      this.echoGhostTrailSpawnElapsedMs = 0;
      this.lastEchoGhostHead = null;
      return;
    }

    const head = ghostSegments[0];
    const headMoved =
      !this.lastEchoGhostHead ||
      this.lastEchoGhostHead.col !== head.col ||
      this.lastEchoGhostHead.row !== head.row;
    this.echoGhostTrailSpawnElapsedMs += safeDelta;

    if (
      headMoved ||
      this.echoGhostTrailSpawnElapsedMs >= ECHO_GHOST_TRAIL_SPAWN_INTERVAL_MS
    ) {
      this.echoGhostTrailSpawnElapsedMs = 0;
      const headPixel = gridToPixel(head);
      this.echoGhostTrailParticles.push({
        x: headPixel.x,
        y: headPixel.y,
        ageMs: 0,
        lifespanMs: ECHO_GHOST_TRAIL_LIFESPAN_MS,
        radiusPx: ECHO_GHOST_TRAIL_RADIUS_PX,
      });

      const overflow =
        this.echoGhostTrailParticles.length - ECHO_GHOST_TRAIL_MAX_PARTICLES;
      if (overflow > 0) {
        this.echoGhostTrailParticles.splice(0, overflow);
      }
    }

    this.lastEchoGhostHead = {
      col: head.col,
      row: head.row,
    };
  }

  private drawEchoGhostTrailParticles(
    gfx: Phaser.GameObjects.Graphics,
    tintColor: number,
    baseOpacity: number,
  ): void {
    if (this.echoGhostTrailParticles.length === 0 || baseOpacity <= 0) {
      return;
    }

    for (const particle of this.echoGhostTrailParticles) {
      const lifeProgress = particle.ageMs / particle.lifespanMs;
      const alpha = Math.max(0, baseOpacity * (1 - lifeProgress));
      if (alpha <= 0) {
        continue;
      }

      const radius = Math.max(
        1,
        particle.radiusPx * (1 - Math.min(1, lifeProgress * 0.5)),
      );
      gfx.fillStyle?.(tintColor, alpha);
      gfx.fillCircle?.(particle.x, particle.y, radius);
    }
  }

  private drawEchoGhostDashedSegment(
    gfx: Phaser.GameObjects.Graphics,
    segment: GridPos,
  ): void {
    const center = gridToPixel(segment);
    const size = TILE_SIZE - ECHO_GHOST_SEGMENT_INSET_PX * 2;
    const half = size / 2;
    const left = center.x - half;
    const top = center.y - half;
    const right = center.x + half;
    const bottom = center.y + half;

    this.drawDashedLine(gfx, left, top, right, top);
    this.drawDashedLine(gfx, right, top, right, bottom);
    this.drawDashedLine(gfx, right, bottom, left, bottom);
    this.drawDashedLine(gfx, left, bottom, left, top);
  }

  private drawDashedLine(
    gfx: Phaser.GameObjects.Graphics,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): void {
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance <= 0) {
      return;
    }

    const unitX = deltaX / distance;
    const unitY = deltaY / distance;
    let cursor = 0;

    while (cursor < distance) {
      const segmentStartX = startX + unitX * cursor;
      const segmentStartY = startY + unitY * cursor;
      const segmentEndDistance = Math.min(
        distance,
        cursor + ECHO_GHOST_DASH_LENGTH_PX,
      );
      const segmentEndX = startX + unitX * segmentEndDistance;
      const segmentEndY = startY + unitY * segmentEndDistance;

      gfx.moveTo(segmentStartX, segmentStartY);
      gfx.lineTo(segmentEndX, segmentEndY);
      cursor += ECHO_GHOST_DASH_LENGTH_PX + ECHO_GHOST_DASH_GAP_PX;
    }
  }

  private startBiomeTransitionEffect(from: Biome): void {
    this.biomeTransitionEffect = {
      from,
      elapsedMs: 0,
    };

    this.cameras.main?.shake?.(
      BIOME_TRANSITION_SHAKE_DURATION_MS,
      BIOME_TRANSITION_SHAKE_INTENSITY,
    );

    this.biomeTransitionOverlayGraphics?.destroy?.();
    const overlay = this.add.graphics();
    this.biomeTransitionOverlayGraphics = overlay;
    overlay.setDepth?.(BIOME_LAYER_DEPTH.TRANSITION_OVERLAY);

    this.drawBiomeTransitionOverlay(from, 0);
  }

  private updateBiomeTransitionEffect(delta: number): void {
    if (!this.biomeTransitionEffect) {
      return;
    }

    this.biomeTransitionEffect.elapsedMs += Math.max(0, delta);
    const progress = Math.min(
      1,
      this.biomeTransitionEffect.elapsedMs / BIOME_TRANSITION_DURATION_MS,
    );
    this.drawBiomeTransitionOverlay(this.biomeTransitionEffect.from, progress);

    if (progress >= 1) {
      this.clearBiomeTransitionEffect();
    }
  }

  private drawBiomeTransitionOverlay(from: Biome, progress: number): void {
    const gfx = this.biomeTransitionOverlayGraphics;
    if (!gfx) {
      return;
    }

    const theme = BIOME_VISUAL_THEMES[from];
    const clampedProgress = Math.max(0, Math.min(1, progress));
    const centerX = ARENA_WIDTH / 2;
    const centerY = ARENA_HEIGHT / 2;
    const maxRevealRadius = Math.hypot(centerX, centerY);
    const revealRadius =
      clampedProgress * (maxRevealRadius + TILE_SIZE) - TILE_SIZE;

    gfx.clear?.();
    gfx.fillStyle?.(theme.backgroundColor, BIOME_TRANSITION_OVERLAY_ALPHA);

    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        if (!this.isTransitionCellCovered(col, row, revealRadius)) {
          continue;
        }
        gfx.fillRect?.(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }

    gfx.lineStyle?.(
      1,
      theme.tilemapPrimaryColor,
      Math.min(1, theme.tilemapPrimaryAlpha + 0.24),
    );
    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        if (!this.isTransitionCellCovered(col, row, revealRadius)) {
          continue;
        }
        if (!this.shouldDrawTilePrimary(from, col, row)) {
          continue;
        }
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;
        gfx.moveTo?.(x + 2, y + TILE_SIZE / 2);
        gfx.lineTo?.(x + TILE_SIZE - 2, y + TILE_SIZE / 2);
      }
    }
    gfx.strokePath?.();

    gfx.lineStyle?.(
      1,
      theme.tilemapAccentColor,
      Math.min(1, theme.tilemapAccentAlpha + 0.2),
    );
    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        if (!this.isTransitionCellCovered(col, row, revealRadius)) {
          continue;
        }
        if (!this.shouldDrawTileAccent(from, col, row)) {
          continue;
        }
        const x = col * TILE_SIZE;
        const y = row * TILE_SIZE;
        gfx.moveTo?.(x + TILE_SIZE / 2, y + 2);
        gfx.lineTo?.(x + TILE_SIZE / 2, y + TILE_SIZE - 2);
      }
    }
    gfx.strokePath?.();
  }

  private isTransitionCellCovered(
    col: number,
    row: number,
    revealRadius: number,
  ): boolean {
    const centerX = ARENA_WIDTH / 2;
    const centerY = ARENA_HEIGHT / 2;
    const tileCenterX = col * TILE_SIZE + TILE_SIZE / 2;
    const tileCenterY = row * TILE_SIZE + TILE_SIZE / 2;
    return (
      Math.hypot(tileCenterX - centerX, tileCenterY - centerY) > revealRadius
    );
  }

  private clearBiomeTransitionEffect(): void {
    this.biomeTransitionEffect = null;
    this.biomeTransitionOverlayGraphics?.destroy?.();
    this.biomeTransitionOverlayGraphics = null;
  }

  private ensureBiomeShiftCountdownText(): boolean {
    if (this.biomeShiftCountdownValueText && this.biomeShiftCountdownLabelText) {
      return true;
    }

    const addFactory = this.add as unknown as {
      text?: (
        x: number,
        y: number,
        text: string,
        style?: Phaser.Types.GameObjects.Text.TextStyle,
      ) => Phaser.GameObjects.Text;
    };
    if (typeof addFactory.text !== "function") {
      return false;
    }

    if (!this.biomeShiftCountdownValueText) {
      const valueText = addFactory.text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, "", {
        fontFamily: '"Arial Black", "Impact", sans-serif',
        fontSize: "216px",
        color: "#ffffff",
        stroke: "#05080f",
        strokeThickness: 10,
      });
      valueText.setOrigin?.(0.5, 0.5);
      valueText.setDepth?.(BIOME_LAYER_DEPTH.SHIFT_COUNTDOWN);
      valueText.setAlpha?.(BIOME_SHIFT_COUNTDOWN_ALPHA);
      valueText.setVisible?.(false);
      this.biomeShiftCountdownValueText = valueText;
    }

    if (!this.biomeShiftCountdownLabelText) {
      const labelText = addFactory.text(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, "", {
        fontFamily: '"Arial Black", "Impact", sans-serif',
        fontSize: "36px",
        color: "#ffffff",
        stroke: "#05080f",
        strokeThickness: 5,
      });
      labelText.setOrigin?.(0.5, 0.5);
      labelText.setDepth?.(BIOME_LAYER_DEPTH.SHIFT_COUNTDOWN);
      labelText.setAlpha?.(BIOME_SHIFT_COUNTDOWN_ALPHA);
      labelText.setVisible?.(false);
      this.biomeShiftCountdownLabelText = labelText;
    }

    return Boolean(
      this.biomeShiftCountdownValueText && this.biomeShiftCountdownLabelText,
    );
  }

  private clearBiomeShiftCountdown(): void {
    this.biomeShiftCountdownShakeElapsedMs = 0;
    this.biomeShiftCountdownValueText?.setVisible?.(false);
    this.biomeShiftCountdownLabelText?.setVisible?.(false);
  }

  private destroyBiomeShiftCountdown(): void {
    this.biomeShiftCountdownShakeElapsedMs = 0;
    this.biomeShiftCountdownValueText?.destroy?.();
    this.biomeShiftCountdownValueText = null;
    this.biomeShiftCountdownLabelText?.destroy?.();
    this.biomeShiftCountdownLabelText = null;
  }

  private updateBiomeShiftCountdown(delta: number): void {
    const msUntilNextBiome = this.biomeManager.getMsUntilNextBiome();
    const showCountdown = this.biomeManager.isRunning() &&
      msUntilNextBiome > 0 &&
      msUntilNextBiome <= BIOME_SHIFT_COUNTDOWN_WINDOW_MS;

    if (!showCountdown) {
      this.clearBiomeShiftCountdown();
      return;
    }

    if (!this.ensureBiomeShiftCountdownText()) {
      return;
    }

    this.biomeShiftCountdownShakeElapsedMs += Math.max(0, delta);
    const shakeX =
      Math.sin(this.biomeShiftCountdownShakeElapsedMs * 0.07) *
      BIOME_SHIFT_COUNTDOWN_SHAKE_X_PX;
    const shakeY =
      Math.cos(this.biomeShiftCountdownShakeElapsedMs * 0.09) *
      BIOME_SHIFT_COUNTDOWN_SHAKE_Y_PX;
    const nextBiome = this.biomeManager.getNextBiome();
    const countdownValue = Math.max(
      1,
      Math.min(3, Math.ceil(msUntilNextBiome / 1_000)),
    );

    this.biomeShiftCountdownValueText?.setText?.(String(countdownValue));
    this.biomeShiftCountdownValueText?.setPosition?.(
      ARENA_WIDTH / 2 + shakeX,
      ARENA_HEIGHT / 2 + BIOME_SHIFT_COUNTDOWN_NUMBER_Y_OFFSET_PX + shakeY,
    );
    this.biomeShiftCountdownValueText?.setVisible?.(true);

    this.biomeShiftCountdownLabelText?.setText?.(
      `BIOME SHIFT: ${BIOME_CONFIG[nextBiome].label.toUpperCase()}`,
    );
    this.biomeShiftCountdownLabelText?.setPosition?.(
      ARENA_WIDTH / 2 + shakeX * 0.45,
      ARENA_HEIGHT / 2 + BIOME_SHIFT_COUNTDOWN_LABEL_Y_OFFSET_PX + shakeY * 0.45,
    );
    this.biomeShiftCountdownLabelText?.setVisible?.(true);
  }

  private drawBackdrop(biome: Biome, theme: BiomeVisualTheme): void {
    this.backdropGraphics?.destroy?.();
    const gfx = this.add.graphics();
    this.backdropGraphics = gfx;
    gfx.setDepth?.(RENDER_DEPTH.BIOME_BACKDROP);

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
    gfx.setDepth?.(RENDER_DEPTH.BIOME_TILEMAP);

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
    gfx.setDepth?.(RENDER_DEPTH.BIOME_GRID);
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
