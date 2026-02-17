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
  gridEquals,
  gridToPixel,
  oppositeDirection,
  stepInDirection,
  type Direction,
  type GridPos,
} from "../utils/grid";
import { Snake, type PortalTraversalSnapshot } from "../entities/Snake";
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
import type { Portal, PortalLifecycleState } from "../entities/Portal";
import {
  PortalManager,
  type PortalManagerUpdateResult,
  type PortalSpawnContext,
} from "../systems/PortalManager";

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

export const PORTAL_SCENE_EVENTS = {
  UPDATE: "portalUpdate",
  STAGE_EXPOSURE: "portalStageExposure",
  STATE_CHANGE: "portalStateChange",
} as const;

export type PortalExposureStage = "rendering" | "movement" | "collision";

export interface PortalRuntimeSnapshot {
  deltaMs: number;
  activePortalPairId: string | null;
  activePortalState: PortalLifecycleState | null;
  activePortalEndpoints: readonly [GridPos, GridPos] | null;
  updateResult: PortalManagerUpdateResult;
}

export interface PortalStageExposure {
  stage: PortalExposureStage;
  snapshot: PortalRuntimeSnapshot;
}

export interface PortalDistortionConfig {
  radiusTiles: number;
  intensity: number;
}

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
const PORTAL_RENDER_DEPTH = RENDER_DEPTH.BIOME_MECHANIC + 1;
const PORTAL_VORTEX_SPIN_RADIANS_PER_SEC = Math.PI * 2.4;
const PORTAL_VORTEX_RING_COUNT = 3;
const PORTAL_VORTEX_RING_SEGMENTS = 18;
const PORTAL_HOOK_RING_SEGMENTS = 16;
const PORTAL_RING_VERTICAL_SQUASH = 0.78;
const PORTAL_SPAWN_HOOK_DURATION_MS = 260;
const PORTAL_DESPAWN_HOOK_DURATION_MS = 220;
const PORTAL_EMERGENCY_FLASH_DURATION_MS = 240;
const PORTAL_EMERGENCY_COLLISION_DISABLE_DURATION_MS = 500;
const PORTAL_SPLIT_SNAKE_RENDER_DEPTH = RENDER_DEPTH.SNAKE - 0.5;
const PORTAL_SPLIT_HEAD_ALPHA = 0.46;
const PORTAL_SPLIT_BODY_ALPHA = 0.34;
const PORTAL_SPLIT_HEAD_RADIUS_PX = TILE_SIZE * 0.42;
const PORTAL_SPLIT_BODY_RADIUS_PX = TILE_SIZE * 0.34;
const PORTAL_DISTORTION_PULSE_RADIANS_PER_SEC = Math.PI * 1.35;
const PORTAL_DISTORTION_MIN_RADIUS_TILES = 0;
const PORTAL_DISTORTION_MAX_RADIUS_TILES = 8;
const PORTAL_DISTORTION_MIN_INTENSITY = 0;
const PORTAL_DISTORTION_MAX_INTENSITY = 1;
const DEFAULT_PORTAL_DISTORTION_CONFIG: PortalDistortionConfig = {
  radiusTiles: 2.15,
  intensity: 0.32,
};
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
interface PortalVortexRenderProfile {
  alpha: number;
  scale: number;
  spinMultiplier: number;
}
interface PortalDistortionRenderProfile {
  radiusTiles: number;
  intensity: number;
}
type PortalLifecycleHookKind = "spawn" | "despawn" | "emergencyTeleport";
interface PortalLifecycleHookEffect {
  pairId: string;
  kind: PortalLifecycleHookKind;
  endpoints: readonly [GridPos, GridPos];
  elapsedMs: number;
  durationMs: number;
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

  /** Portal spawn/collapse scheduler for the current run. */
  private readonly portalManager: PortalManager;

  /** Last portal-manager update payload emitted during the current frame. */
  private lastPortalUpdateResult: PortalManagerUpdateResult =
    createEmptyPortalUpdateResult();

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

  /** Graphics object used to render active portal vortices and lifecycle hooks. */
  private portalGraphics: Phaser.GameObjects.Graphics | null = null;

  /** Graphics overlay that mirrors threaded snake segments during portal transit. */
  private portalSplitSnakeGraphics: Phaser.GameObjects.Graphics | null = null;

  /** Graphics object used to render the delayed echo-ghost overlay. */
  private echoGhostGraphics: Phaser.GameObjects.Graphics | null = null;

  /** Short-lived particles that trail behind the delayed ghost path. */
  private echoGhostTrailParticles: EchoGhostTrailParticle[] = [];

  /** Time accumulator that controls periodic ghost trail particle spawns. */
  private echoGhostTrailSpawnElapsedMs = 0;

  /** Last ghost head position used to detect movement for trail spawning. */
  private lastEchoGhostHead: GridPos | null = null;

  /** Monotonic token used to ignore delayed callbacks from older runs. */
  private activeRunId = 0;

  /** Number of snake steps elapsed since entering Void Rift. */
  private voidGravityStepCounter = 0;

  /** Current animated spin offset for the Void Rift center vortex. */
  private voidVortexSpinRadians = 0;

  /** Current animated spin offset for portal vortex visuals. */
  private portalVortexSpinRadians = 0;

  /** Current animated pulse offset for portal tile distortion. */
  private portalDistortionPulseRadians = 0;

  /** Tunable portal tile-distortion controls. */
  private portalDistortionConfig: PortalDistortionConfig =
    clonePortalDistortionConfig(DEFAULT_PORTAL_DISTORTION_CONFIG);

  /** Cached endpoint positions per portal pair for despawn visual hooks. */
  private portalEndpointCache = new Map<string, readonly [GridPos, GridPos]>();

  /** Active short-lived portal lifecycle effects (spawn/despawn hooks). */
  private portalLifecycleHookEffects: PortalLifecycleHookEffect[] = [];

  /** Remaining collision-suppression time after forced portal-collapse teleport. */
  private portalEmergencyCollisionDisableMs = 0;

  /** Monotonic ID for uniquely keyed emergency-teleport flash effects. */
  private portalEmergencyFlashEffectCounter = 0;

  /**
   * Injectable RNG function for deterministic replay sessions.
   * Returns a value in [0, 1). Defaults to Math.random.
   */
  private rng: () => number = Math.random;

  constructor() {
    super({ key: "MainScene" });
    this.portalManager = new PortalManager({
      rng: () => sampleBiomeRandom(this.rng),
    });
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
    this.portalManager.stopRun();
    this.lastPortalUpdateResult = createEmptyPortalUpdateResult();
    this.portalEmergencyCollisionDisableMs = 0;
    this.portalEmergencyFlashEffectCounter = 0;
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
    this.destroyPortalVisuals();
    this.destroyPortalSplitSnakeVisuals();
    this.destroyEchoGhostVisuals();
    this.destroyBiomeShiftCountdown();
  }

  update(_time: number, delta: number): void {
    if (gameBridge.getState().phase !== "playing") {
      this.clearBiomeShiftCountdown();
      this.clearPortalVisualState();
      this.clearPortalSplitSnakeVisualState();
      this.clearEchoGhostVisualState();
      this.portalEmergencyCollisionDisableMs = 0;
      return;
    }

    this.advancePortalEmergencyCollisionSafety(delta);
    gameBridge.setElapsedTime(gameBridge.getState().elapsedTime + delta);
    this.updateBiomeState(delta);

    if (!this.snake || !this.food || !this.echoGhost) return;
    const portalSnapshot = this.updatePortalState(delta);
    this.resolvePortalCollapseMidTransit(portalSnapshot);

    this.emitPortalStageExposure("rendering", portalSnapshot);
    this.echoGhost.advance(delta);
    this.updateEchoGhostVisuals(delta);
    this.updateMoltenCoreMechanics(delta);
    this.updateBiomeMechanicVisuals(delta);
    this.updatePortalVisuals(delta, portalSnapshot);

    this.emitPortalStageExposure("movement", portalSnapshot);
    const stepped = this.snake.update(delta);

    if (stepped) {
      this.resolvePortalHeadTraversal();
      this.emitPortalStageExposure("collision", portalSnapshot);
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

    this.updatePortalSplitSnakeVisuals();
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
    this.activeRunId += 1;
    this.biomeManager.startRun();
    this.portalManager.startRun();
    this.lastPortalUpdateResult = createEmptyPortalUpdateResult();
    this.portalEmergencyCollisionDisableMs = 0;
    this.portalEmergencyFlashEffectCounter = 0;
    gameBridge.resetRun({
      currentBiome: this.biomeManager.getCurrentBiome(),
      biomeVisitStats: this.biomeManager.getVisitStats(),
    });
    this.resetMoltenCoreState();
    this.clearBiomeTransitionEffect();
    this.clearBiomeShiftCountdown();
    this.voidGravityStepCounter = 0;
    this.voidVortexSpinRadians = 0;
    this.clearPortalVisualState();
    this.clearPortalSplitSnakeVisualState();
    this.destroyBiomeMechanicGraphics();
    this.handleBiomeEnter(this.biomeManager.getCurrentBiome());
    this.destroyEntities();
    this.createEntities();
  }

  /** End the current run: kill snake, persist high-score, transition to gameOver. */
  endRun(): void {
    shakeCamera(this);
    this.biomeManager.stopRun();
    this.portalManager.stopRun();
    this.lastPortalUpdateResult = createEmptyPortalUpdateResult();
    this.portalEmergencyCollisionDisableMs = 0;
    this.resetMoltenCoreState();
    this.clearBiomeTransitionEffect();
    this.clearBiomeShiftCountdown();
    this.clearPortalVisualState();
    this.clearPortalSplitSnakeVisualState();
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

  private resolvePortalHeadTraversal(): void {
    if (!this.snake) {
      return;
    }

    const entryPos = this.snake.getHeadPosition();
    const exitPos = this.portalManager.getExitPositionForEntryCell(entryPos);
    if (!exitPos) {
      return;
    }

    this.snake.beginPortalTraversal(entryPos, exitPos);
  }

  private resolvePortalCollapseMidTransit(
    snapshot: PortalRuntimeSnapshot,
  ): void {
    if (!this.snake || !this.snake.isPortalThreadingActive()) {
      return;
    }

    const collapsedDuringUpdate = snapshot.updateResult.lifecycleTransitions.some(
      ({ transition }) =>
        transition.to === "collapsing" || transition.to === "collapsed",
    );
    if (!collapsedDuringUpdate) {
      return;
    }

    const traversalSnapshots = this.snake.getPortalTraversalSnapshots();
    this.snake.forceCompletePortalTraversal();
    this.activatePortalEmergencyTeleportSafety(traversalSnapshots);
  }

  private activatePortalEmergencyTeleportSafety(
    traversals: readonly PortalTraversalSnapshot[],
  ): void {
    this.portalEmergencyCollisionDisableMs = Math.max(
      this.portalEmergencyCollisionDisableMs,
      PORTAL_EMERGENCY_COLLISION_DISABLE_DURATION_MS,
    );

    const flashedPortalPairs = new Set<string>();
    for (const traversal of traversals) {
      const traversalPairKey = `${traversal.entry.col}:${traversal.entry.row}->${traversal.exit.col}:${traversal.exit.row}`;
      if (flashedPortalPairs.has(traversalPairKey)) {
        continue;
      }
      flashedPortalPairs.add(traversalPairKey);

      this.queuePortalLifecycleHook(
        `portal-emergency-${this.portalEmergencyFlashEffectCounter}`,
        [
          { col: traversal.entry.col, row: traversal.entry.row },
          { col: traversal.exit.col, row: traversal.exit.row },
        ],
        "emergencyTeleport",
        PORTAL_EMERGENCY_FLASH_DURATION_MS,
      );
      this.portalEmergencyFlashEffectCounter += 1;
    }
  }

  private advancePortalEmergencyCollisionSafety(deltaMs: number): void {
    if (this.portalEmergencyCollisionDisableMs <= 0) {
      return;
    }

    const safeDeltaMs = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
    this.portalEmergencyCollisionDisableMs = Math.max(
      0,
      this.portalEmergencyCollisionDisableMs - safeDeltaMs,
    );
  }

  // ── Collision detection ───────────────────────────────────────

  /**
   * Check wall-collision, self-collision, and echo-ghost collision.
   * If a collision is detected, ends the run and returns true.
   */
  private checkCollisions(): boolean {
    if (!this.snake) return false;
    if (this.portalEmergencyCollisionDisableMs > 0) {
      return false;
    }

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

    if (this.hasEchoGhostCollision(head)) {
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

  private hasEchoGhostCollision(head: GridPos): boolean {
    if (!this.echoGhost || !this.echoGhost.isActive()) {
      return false;
    }

    const playbackSegments = this.echoGhost.getPlaybackSegments();
    for (const segment of playbackSegments) {
      if (gridEquals(segment, head)) {
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

  /** Override the portal tile-distortion radius/intensity tuning knobs. */
  setPortalDistortionConfig(config: Partial<PortalDistortionConfig>): void {
    this.portalDistortionConfig = mergePortalDistortionConfig(
      this.portalDistortionConfig,
      config,
    );
  }

  /** Snapshot of the active portal tile-distortion tuning values. */
  getPortalDistortionConfig(): PortalDistortionConfig {
    return clonePortalDistortionConfig(this.portalDistortionConfig);
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

  getPortalManager(): PortalManager {
    return this.portalManager;
  }

  getPortalUpdateResult(): PortalManagerUpdateResult {
    return this.lastPortalUpdateResult;
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

  private updatePortalState(deltaMs: number): PortalRuntimeSnapshot {
    const updateResult = this.portalManager.update(
      deltaMs,
      this.createPortalSpawnContext(),
    );
    this.lastPortalUpdateResult = updateResult;

    const activePortal = this.portalManager.getActivePortal();
    const activePortalEndpoints = activePortal
      ? clonePortalEndpoints(activePortal.getEndpoints())
      : null;

    const snapshot: PortalRuntimeSnapshot = {
      deltaMs,
      activePortalPairId: activePortal?.getPairId() ?? null,
      activePortalState: activePortal?.getState() ?? null,
      activePortalEndpoints,
      updateResult,
    };

    this.events?.emit?.(PORTAL_SCENE_EVENTS.UPDATE, snapshot);
    for (const portalEvent of updateResult.orderedEvents) {
      this.events?.emit?.(PORTAL_SCENE_EVENTS.STATE_CHANGE, portalEvent);
    }

    return snapshot;
  }

  private emitPortalStageExposure(
    stage: PortalExposureStage,
    snapshot: PortalRuntimeSnapshot,
  ): void {
    const exposure: PortalStageExposure = { stage, snapshot };
    this.events?.emit?.(PORTAL_SCENE_EVENTS.STAGE_EXPOSURE, exposure);
  }

  private createPortalSpawnContext(): PortalSpawnContext {
    const occupiedCells: GridPos[] = [];
    if (this.snake) {
      for (const segment of this.snake.getSegments()) {
        occupiedCells.push({ col: segment.col, row: segment.row });
      }
    }
    if (this.food) {
      const foodPos = this.food.getPosition();
      occupiedCells.push({ col: foodPos.col, row: foodPos.row });
    }

    const blockedCells: GridPos[] = [];
    for (const lavaPool of this.moltenLavaPools.values()) {
      blockedCells.push({ col: lavaPool.col, row: lavaPool.row });
    }
    if (this.biomeManager.getCurrentBiome() === Biome.VoidRift) {
      blockedCells.push({ ...VOID_RIFT_CENTER });
    }

    return {
      occupiedCells,
      blockedCells,
    };
  }

  private ensurePortalGraphics(): boolean {
    if (this.portalGraphics) {
      return true;
    }

    const addFactory = this.add as unknown as {
      graphics?: () => Phaser.GameObjects.Graphics;
    };
    if (typeof addFactory.graphics !== "function") {
      return false;
    }

    const graphics = addFactory.graphics();
    graphics.setDepth?.(PORTAL_RENDER_DEPTH);
    this.portalGraphics = graphics;
    return true;
  }

  private ensurePortalSplitSnakeGraphics(): boolean {
    if (this.portalSplitSnakeGraphics) {
      return true;
    }

    const addFactory = this.add as unknown as {
      graphics?: () => Phaser.GameObjects.Graphics;
    };
    if (typeof addFactory.graphics !== "function") {
      return false;
    }

    const graphics = addFactory.graphics();
    graphics.setDepth?.(PORTAL_SPLIT_SNAKE_RENDER_DEPTH);
    this.portalSplitSnakeGraphics = graphics;
    return true;
  }

  private clearPortalSplitSnakeVisualState(): void {
    this.portalSplitSnakeGraphics?.clear?.();
  }

  private destroyPortalSplitSnakeVisuals(): void {
    this.clearPortalSplitSnakeVisualState();
    this.portalSplitSnakeGraphics?.destroy?.();
    this.portalSplitSnakeGraphics = null;
  }

  private clearPortalVisualState(): void {
    this.portalGraphics?.clear?.();
    this.portalVortexSpinRadians = 0;
    this.portalDistortionPulseRadians = 0;
    this.portalEndpointCache.clear();
    this.portalLifecycleHookEffects = [];
  }

  private destroyPortalVisuals(): void {
    this.clearPortalVisualState();
    this.portalGraphics?.destroy?.();
    this.portalGraphics = null;
  }

  private updatePortalSplitSnakeVisuals(): void {
    if (!this.snake || !this.snake.isPortalThreadingActive()) {
      this.portalSplitSnakeGraphics?.clear?.();
      return;
    }

    if (!this.ensurePortalSplitSnakeGraphics()) {
      return;
    }

    const gfx = this.portalSplitSnakeGraphics!;
    gfx.clear?.();

    const segments = this.snake.getSegments();
    if (segments.length === 0) {
      return;
    }

    const traversals = this.snake.getPortalTraversalSnapshots();
    for (const traversal of traversals) {
      this.drawPortalSplitTraversal(gfx, segments, traversal);
    }
  }

  private drawPortalSplitTraversal(
    gfx: Phaser.GameObjects.Graphics,
    segments: readonly GridPos[],
    traversal: PortalTraversalSnapshot,
  ): void {
    const bodySegmentCount = Math.max(0, segments.length - 1);
    const threadedBodySegments = Math.min(
      bodySegmentCount,
      Math.max(0, Math.floor(traversal.stepsElapsed)),
    );
    const mirroredSegmentCount = Math.min(
      segments.length,
      threadedBodySegments + 1,
    );
    if (mirroredSegmentCount <= 0) {
      return;
    }

    const colOffset = traversal.entry.col - traversal.exit.col;
    const rowOffset = traversal.entry.row - traversal.exit.row;

    for (let i = 0; i < mirroredSegmentCount; i += 1) {
      const sourceSegment = segments[i];
      const mirroredPos = {
        col: sourceSegment.col + colOffset,
        row: sourceSegment.row + rowOffset,
      };
      if (!isInBounds(mirroredPos)) {
        continue;
      }

      const center = gridToPixel(mirroredPos);
      const isHeadMirror = i === 0;
      gfx.fillStyle?.(
        isHeadMirror ? COLORS.SNAKE_HEAD : COLORS.SNAKE_BODY,
        isHeadMirror ? PORTAL_SPLIT_HEAD_ALPHA : PORTAL_SPLIT_BODY_ALPHA,
      );
      gfx.fillCircle?.(
        center.x,
        center.y,
        isHeadMirror
          ? PORTAL_SPLIT_HEAD_RADIUS_PX
          : PORTAL_SPLIT_BODY_RADIUS_PX,
      );
    }
  }

  private updatePortalVisuals(
    deltaMs: number,
    snapshot: PortalRuntimeSnapshot,
  ): void {
    this.capturePortalLifecycleHookEvents(snapshot);
    const activePortal = this.portalManager.getActivePortal();
    const hasActiveVortex = Boolean(activePortal && snapshot.activePortalEndpoints);
    const hasLifecycleHooks = this.portalLifecycleHookEffects.length > 0;
    if (!hasActiveVortex && !hasLifecycleHooks) {
      this.portalGraphics?.clear?.();
      return;
    }

    if (!this.ensurePortalGraphics()) {
      return;
    }

    const gfx = this.portalGraphics!;
    gfx.clear?.();

    const safeDeltaMs = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
    this.portalVortexSpinRadians =
      (this.portalVortexSpinRadians +
        (safeDeltaMs / 1_000) * PORTAL_VORTEX_SPIN_RADIANS_PER_SEC) %
      (Math.PI * 2);
    this.portalDistortionPulseRadians =
      (this.portalDistortionPulseRadians +
        (safeDeltaMs / 1_000) * PORTAL_DISTORTION_PULSE_RADIANS_PER_SEC) %
      (Math.PI * 2);

    if (activePortal && snapshot.activePortalEndpoints) {
      const distortionProfile = this.getPortalDistortionRenderProfile(activePortal);
      if (
        distortionProfile.radiusTiles > 0 &&
        distortionProfile.intensity > 0
      ) {
        this.drawPortalTileDistortionField(
          gfx,
          snapshot.activePortalEndpoints,
          distortionProfile,
        );
      }

      const vortexProfile = this.getPortalVortexRenderProfile(activePortal);
      if (vortexProfile.alpha > 0 && vortexProfile.scale > 0) {
        this.drawPortalPairVortex(
          gfx,
          snapshot.activePortalEndpoints,
          this.portalVortexSpinRadians * vortexProfile.spinMultiplier,
          vortexProfile.alpha,
          vortexProfile.scale,
        );
      }
    }

    this.drawPortalLifecycleHooks(gfx);
    this.advancePortalLifecycleHooks(safeDeltaMs);
  }

  private capturePortalLifecycleHookEvents(snapshot: PortalRuntimeSnapshot): void {
    const collapseHookedPairIds = new Set<string>();
    for (const portalEvent of snapshot.updateResult.orderedEvents) {
      if (portalEvent.type === "spawned") {
        const endpoints = cloneGridPosPair(portalEvent.endpoints);
        this.portalEndpointCache.set(portalEvent.pairId, endpoints);
        this.queuePortalLifecycleHook(
          portalEvent.pairId,
          endpoints,
          "spawn",
          PORTAL_SPAWN_HOOK_DURATION_MS,
        );
        continue;
      }

      if (portalEvent.type === "lifecycleTransition") {
        if (portalEvent.transition.to !== "collapsing") {
          continue;
        }
        const endpoints = this.resolvePortalHookEndpoints(
          portalEvent.pairId,
          snapshot,
        );
        if (!endpoints) {
          continue;
        }
        collapseHookedPairIds.add(portalEvent.pairId);
        this.queuePortalLifecycleHook(
          portalEvent.pairId,
          endpoints,
          "despawn",
          PORTAL_DESPAWN_HOOK_DURATION_MS,
        );
        continue;
      }

      if (portalEvent.type === "despawned") {
        if (!collapseHookedPairIds.has(portalEvent.pairId)) {
          const endpoints = this.resolvePortalHookEndpoints(
            portalEvent.pairId,
            snapshot,
          );
          if (endpoints) {
            this.queuePortalLifecycleHook(
              portalEvent.pairId,
              endpoints,
              "despawn",
              PORTAL_DESPAWN_HOOK_DURATION_MS,
            );
          }
        }
        this.portalEndpointCache.delete(portalEvent.pairId);
      }
    }

    if (snapshot.activePortalPairId && snapshot.activePortalEndpoints) {
      this.portalEndpointCache.set(
        snapshot.activePortalPairId,
        cloneGridPosPair(snapshot.activePortalEndpoints),
      );
    }
  }

  private resolvePortalHookEndpoints(
    pairId: string,
    snapshot: PortalRuntimeSnapshot,
  ): readonly [GridPos, GridPos] | null {
    if (
      snapshot.activePortalPairId === pairId &&
      snapshot.activePortalEndpoints !== null
    ) {
      return cloneGridPosPair(snapshot.activePortalEndpoints);
    }

    const cachedEndpoints = this.portalEndpointCache.get(pairId);
    return cachedEndpoints ? cloneGridPosPair(cachedEndpoints) : null;
  }

  private queuePortalLifecycleHook(
    pairId: string,
    endpoints: readonly [GridPos, GridPos],
    kind: PortalLifecycleHookKind,
    durationMs: number,
  ): void {
    this.portalLifecycleHookEffects.push({
      pairId,
      kind,
      endpoints: cloneGridPosPair(endpoints),
      elapsedMs: 0,
      durationMs,
    });
  }

  private advancePortalLifecycleHooks(deltaMs: number): void {
    if (this.portalLifecycleHookEffects.length === 0) {
      return;
    }

    for (const effect of this.portalLifecycleHookEffects) {
      effect.elapsedMs += deltaMs;
    }
    this.portalLifecycleHookEffects = this.portalLifecycleHookEffects.filter(
      (effect) => effect.elapsedMs < effect.durationMs,
    );
  }

  private getPortalVortexRenderProfile(activePortal: Portal): PortalVortexRenderProfile {
    const state = activePortal.getState();
    const durations = activePortal.getLifecycleDurations();
    const elapsedInStateMs = activePortal.getElapsedInStateMs();

    if (state === "spawning") {
      const progress = normalizeProgress(elapsedInStateMs, durations.spawningMs);
      return {
        alpha: 0.25 + progress * 0.75,
        scale: 0.55 + progress * 0.45,
        spinMultiplier: 0.7 + progress * 0.35,
      };
    }

    if (state === "collapsing") {
      const progress = normalizeProgress(elapsedInStateMs, durations.collapsingMs);
      return {
        alpha: Math.max(0.08, 1 - progress),
        scale: 1 + progress * 0.35,
        spinMultiplier: 1.2 + progress * 0.5,
      };
    }

    if (state === "active") {
      return {
        alpha: 1,
        scale: 1,
        spinMultiplier: 1,
      };
    }

    return {
      alpha: 0,
      scale: 0,
      spinMultiplier: 1,
    };
  }

  private getPortalDistortionRenderProfile(
    activePortal: Portal,
  ): PortalDistortionRenderProfile {
    const state = activePortal.getState();
    const durations = activePortal.getLifecycleDurations();
    const elapsedInStateMs = activePortal.getElapsedInStateMs();

    let lifecycleMultiplier = 1;
    if (state === "spawning") {
      const progress = normalizeProgress(elapsedInStateMs, durations.spawningMs);
      lifecycleMultiplier = 0.38 + progress * 0.62;
    } else if (state === "collapsing") {
      const progress = normalizeProgress(elapsedInStateMs, durations.collapsingMs);
      lifecycleMultiplier = Math.max(0, 1 - progress);
    } else if (state === "collapsed") {
      lifecycleMultiplier = 0;
    }

    return {
      radiusTiles: this.portalDistortionConfig.radiusTiles,
      intensity: this.portalDistortionConfig.intensity * lifecycleMultiplier,
    };
  }

  private drawPortalTileDistortionField(
    gfx: Phaser.GameObjects.Graphics,
    endpoints: readonly [GridPos, GridPos],
    profile: PortalDistortionRenderProfile,
  ): void {
    this.drawPortalEndpointTileDistortion(gfx, endpoints[0], profile, 0);
    this.drawPortalEndpointTileDistortion(gfx, endpoints[1], profile, Math.PI);
  }

  private drawPortalEndpointTileDistortion(
    gfx: Phaser.GameObjects.Graphics,
    endpoint: GridPos,
    profile: PortalDistortionRenderProfile,
    phaseOffset: number,
  ): void {
    if (profile.radiusTiles <= 0 || profile.intensity <= 0) {
      return;
    }

    const minCol = Math.max(0, Math.floor(endpoint.col - profile.radiusTiles));
    const maxCol = Math.min(
      GRID_COLS - 1,
      Math.ceil(endpoint.col + profile.radiusTiles),
    );
    const minRow = Math.max(0, Math.floor(endpoint.row - profile.radiusTiles));
    const maxRow = Math.min(
      GRID_ROWS - 1,
      Math.ceil(endpoint.row + profile.radiusTiles),
    );
    const endpointCenterCol = endpoint.col + 0.5;
    const endpointCenterRow = endpoint.row + 0.5;
    const radiusDenominator = Math.max(0.0001, profile.radiusTiles);

    for (let col = minCol; col <= maxCol; col += 1) {
      for (let row = minRow; row <= maxRow; row += 1) {
        const tileCenterCol = col + 0.5;
        const tileCenterRow = row + 0.5;
        const deltaCol = tileCenterCol - endpointCenterCol;
        const deltaRow = tileCenterRow - endpointCenterRow;
        const distanceTiles = Math.hypot(deltaCol, deltaRow);
        if (distanceTiles > profile.radiusTiles) {
          continue;
        }

        const falloff = 1 - distanceTiles / radiusDenominator;
        if (falloff <= 0) {
          continue;
        }

        const wave = Math.sin(
          this.portalDistortionPulseRadians +
            phaseOffset +
            distanceTiles * 1.9,
        );
        const normalizedWave = 0.5 + wave * 0.5;
        const tileScale =
          1 + profile.intensity * falloff * (0.45 + normalizedWave * 0.55);

        const swirlAngle =
          Math.atan2(deltaRow, deltaCol) +
          this.portalDistortionPulseRadians * 0.45 +
          phaseOffset;
        const swirlOffsetPx = TILE_SIZE * profile.intensity * falloff * 0.2;
        const centerX =
          col * TILE_SIZE +
          TILE_SIZE / 2 +
          Math.cos(swirlAngle) * swirlOffsetPx;
        const centerY =
          row * TILE_SIZE +
          TILE_SIZE / 2 +
          Math.sin(swirlAngle) * swirlOffsetPx * PORTAL_RING_VERTICAL_SQUASH;
        const scaledSize = Math.max(1, TILE_SIZE * tileScale);
        const alpha = Math.min(
          0.38,
          profile.intensity * falloff * (0.16 + normalizedWave * 0.14),
        );
        if (alpha <= 0) {
          continue;
        }

        const tintColor = (col + row) % 2 === 0 ? 0x7855de : 0x93a6ff;
        gfx.fillStyle?.(tintColor, alpha);
        gfx.fillRect?.(
          centerX - scaledSize / 2,
          centerY - scaledSize / 2,
          scaledSize,
          scaledSize,
        );
      }
    }
  }

  private drawPortalPairVortex(
    gfx: Phaser.GameObjects.Graphics,
    endpoints: readonly [GridPos, GridPos],
    spinRadians: number,
    alpha: number,
    scale: number,
  ): void {
    this.drawPortalEndpointVortex(
      gfx,
      endpoints[0],
      spinRadians,
      alpha,
      scale,
      0,
    );
    this.drawPortalEndpointVortex(
      gfx,
      endpoints[1],
      spinRadians,
      alpha,
      scale,
      Math.PI,
    );
  }

  private drawPortalEndpointVortex(
    gfx: Phaser.GameObjects.Graphics,
    endpoint: GridPos,
    spinRadians: number,
    alpha: number,
    scale: number,
    phaseOffset: number,
  ): void {
    const center = gridToPixel(endpoint);
    const baseRadius = TILE_SIZE * 0.52 * scale;

    gfx.fillStyle?.(0x1b0c34, 0.34 * alpha);
    gfx.fillCircle?.(center.x, center.y, baseRadius * 1.65);

    for (let ring = 0; ring < PORTAL_VORTEX_RING_COUNT; ring += 1) {
      const ringT = ring / Math.max(1, PORTAL_VORTEX_RING_COUNT - 1);
      const radius = baseRadius * (1.34 - ringT * 0.28);
      const ringAlpha = Math.max(0, alpha * (0.62 - ringT * 0.17));
      const ringColor = ring % 2 === 0 ? 0x8f6bff : 0x5ce3ff;
      const lineWidth = Math.max(1, 2 - ringT * 0.8);

      gfx.lineStyle?.(lineWidth, ringColor, ringAlpha);
      for (let segment = 0; segment <= PORTAL_VORTEX_RING_SEGMENTS; segment += 1) {
        const segmentT = segment / PORTAL_VORTEX_RING_SEGMENTS;
        const angle =
          spinRadians * (1 + ringT * 0.55) +
          phaseOffset +
          segmentT * Math.PI * 2 +
          ring * 0.38;
        const spiralPull = 1 - segmentT * 0.24;
        const x = center.x + Math.cos(angle) * radius * spiralPull;
        const y =
          center.y +
          Math.sin(angle) *
            radius *
            PORTAL_RING_VERTICAL_SQUASH *
            spiralPull;

        if (segment === 0) {
          gfx.moveTo?.(x, y);
        } else {
          gfx.lineTo?.(x, y);
        }
      }
      gfx.strokePath?.();
    }

    gfx.fillStyle?.(0x5e31d1, 0.5 * alpha);
    gfx.fillCircle?.(center.x, center.y, baseRadius * 0.92);
    gfx.fillStyle?.(0xe8dbff, 0.72 * alpha);
    gfx.fillCircle?.(center.x, center.y, Math.max(1, baseRadius * 0.33));
  }

  private drawPortalLifecycleHooks(gfx: Phaser.GameObjects.Graphics): void {
    for (const effect of this.portalLifecycleHookEffects) {
      const progress = normalizeProgress(effect.elapsedMs, effect.durationMs);
      const easedProgress = 1 - (1 - progress) ** 2;
      const isSpawnHook = effect.kind === "spawn";
      const isDespawnHook = effect.kind === "despawn";
      const ringRadius =
        TILE_SIZE *
        (isSpawnHook
          ? 0.35 + easedProgress * 1.05
          : isDespawnHook
            ? 0.5 + easedProgress * 1.35
            : 0.62 + easedProgress * 1.55);
      const alphaBase = isSpawnHook ? 0.58 : isDespawnHook ? 0.66 : 0.88;
      const alpha = alphaBase * Math.max(0, 1 - progress);
      if (alpha <= 0) {
        continue;
      }

      const ringColor = isSpawnHook
        ? 0x8ff7ff
        : isDespawnHook
          ? 0xff8adf
          : 0xffef91;
      const flashColor = isSpawnHook
        ? 0xcbfbff
        : isDespawnHook
          ? 0xffd4f2
          : 0xffffff;
      const flashAlpha = isSpawnHook ? 0.32 : isDespawnHook ? 0.4 : 0.58;
      const flashRadius =
        TILE_SIZE *
        (isSpawnHook ? 0.45 : isDespawnHook ? 0.55 : 0.72) *
        (1 - progress * (isSpawnHook || isDespawnHook ? 0.5 : 0.7));

      for (const endpoint of effect.endpoints) {
        const center = gridToPixel(endpoint);
        gfx.fillStyle?.(flashColor, alpha * flashAlpha);
        gfx.fillCircle?.(center.x, center.y, Math.max(1, flashRadius));
        this.drawPortalHookRing(
          gfx,
          center.x,
          center.y,
          ringRadius,
          ringColor,
          alpha,
        );
      }
    }
  }

  private drawPortalHookRing(
    gfx: Phaser.GameObjects.Graphics,
    centerX: number,
    centerY: number,
    radius: number,
    color: number,
    alpha: number,
  ): void {
    if (radius <= 0 || alpha <= 0) {
      return;
    }

    const lineWidth = Math.max(1, 2.4 - radius / (TILE_SIZE * 1.2));
    gfx.lineStyle?.(lineWidth, color, alpha);
    for (let segment = 0; segment <= PORTAL_HOOK_RING_SEGMENTS; segment += 1) {
      const segmentT = segment / PORTAL_HOOK_RING_SEGMENTS;
      const radians = segmentT * Math.PI * 2;
      const x = centerX + Math.cos(radians) * radius;
      const y =
        centerY +
        Math.sin(radians) * radius * PORTAL_RING_VERTICAL_SQUASH;
      if (segment === 0) {
        gfx.moveTo?.(x, y);
      } else {
        gfx.lineTo?.(x, y);
      }
    }
    gfx.strokePath?.();
  }

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
    const activePortalEndpointKeys = this.getActivePortalEndpointKeys();
    const candidates: GridPos[] = [];

    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS; row++) {
        const key = `${col}:${row}`;
        const pos: GridPos = { col, row };
        if (this.snake.isOnSnake(pos)) {
          continue;
        }
        if (foodPos.col === col && foodPos.row === row) {
          continue;
        }
        if (this.moltenLavaPools.has(key)) {
          continue;
        }
        if (activePortalEndpointKeys.has(key)) {
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

  private getActivePortalEndpointKeys(): Set<string> {
    const keys = new Set<string>();
    const endpoints = this.portalManager.getActivePortalEndpoints();
    if (!endpoints) {
      return keys;
    }
    keys.add(this.gridPosKey(endpoints[0].position));
    keys.add(this.gridPosKey(endpoints[1].position));
    return keys;
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
    if (!this.snake || !this.food || !this.echoGhost) {
      return;
    }

    const foodSprite = this.food.getSprite();
    const fx = foodSprite.x;
    const fy = foodSprite.y;
    const eatGridPos = this.snake.getHeadPosition();
    const ghostSampleTimestampMs = this.echoGhost.getElapsedMs();
    const ghostDelayMs = this.echoGhost.getDelayMs();
    const runIdAtEat = this.activeRunId;
    const eaten = this.food.checkEat(this.snake, (points) =>
      this.addScore(points),
    );
    if (eaten) {
      emitFoodParticles(this, fx, fy);
      this.queueDelayedEchoGhostFoodBurst(
        ghostSampleTimestampMs,
        ghostDelayMs,
        runIdAtEat,
        eatGridPos,
      );
    }
  }

  private queueDelayedEchoGhostFoodBurst(
    targetSampleTimestampMs: number,
    delayMs: number,
    runIdAtEat: number,
    burstGridPos: GridPos,
  ): void {
    const safeDelayMs = Number.isFinite(delayMs) ? Math.max(0, Math.floor(delayMs)) : 0;
    const queuedBurstGridPos: GridPos = { ...burstGridPos };

    this.time.delayedCall(safeDelayMs, () => {
      if (runIdAtEat !== this.activeRunId) {
        return;
      }

      if (gameBridge.getState().phase !== "playing") {
        return;
      }

      const ghost = this.echoGhost;
      if (!ghost) {
        return;
      }

      if (!ghost.getHeadAtOrBefore(targetSampleTimestampMs)) {
        return;
      }

      const ghostPixel = gridToPixel(queuedBurstGridPos);
      emitFoodParticles(this, ghostPixel.x, ghostPixel.y);
    });
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
    this.portalGraphics?.setDepth?.(PORTAL_RENDER_DEPTH);
    this.portalSplitSnakeGraphics?.setDepth?.(PORTAL_SPLIT_SNAKE_RENDER_DEPTH);
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

function createEmptyPortalUpdateResult(): PortalManagerUpdateResult {
  return {
    spawnedPairs: [],
    lifecycleTransitions: [],
    despawnedPairIds: [],
    orderedEvents: [],
  };
}

function clonePortalEndpoints(
  endpoints: readonly [{ position: GridPos }, { position: GridPos }],
): readonly [GridPos, GridPos] {
  return cloneGridPosPair([
    { col: endpoints[0].position.col, row: endpoints[0].position.row },
    { col: endpoints[1].position.col, row: endpoints[1].position.row },
  ]);
}

function cloneGridPosPair(
  endpoints: readonly [GridPos, GridPos],
): readonly [GridPos, GridPos] {
  return [
    { col: endpoints[0].col, row: endpoints[0].row },
    { col: endpoints[1].col, row: endpoints[1].row },
  ] as const;
}

function normalizeProgress(elapsedMs: number, durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return 1;
  }
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, elapsedMs / durationMs));
}

function clonePortalDistortionConfig(
  config: PortalDistortionConfig,
): PortalDistortionConfig {
  return {
    radiusTiles: config.radiusTiles,
    intensity: config.intensity,
  };
}

function mergePortalDistortionConfig(
  current: PortalDistortionConfig,
  patch: Partial<PortalDistortionConfig>,
): PortalDistortionConfig {
  return {
    radiusTiles: clampPortalDistortionRadiusTiles(
      patch.radiusTiles,
      current.radiusTiles,
    ),
    intensity: clampPortalDistortionIntensity(
      patch.intensity,
      current.intensity,
    ),
  };
}

function clampPortalDistortionRadiusTiles(
  value: number | undefined,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(
    PORTAL_DISTORTION_MIN_RADIUS_TILES,
    Math.min(PORTAL_DISTORTION_MAX_RADIUS_TILES, value),
  );
}

function clampPortalDistortionIntensity(
  value: number | undefined,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(
    PORTAL_DISTORTION_MIN_INTENSITY,
    Math.min(PORTAL_DISTORTION_MAX_INTENSITY, value),
  );
}
