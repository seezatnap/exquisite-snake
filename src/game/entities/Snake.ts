import Phaser from "phaser";
import { TEXTURE_KEYS, RENDER_DEPTH } from "../config";
import {
  type GridPos,
  type Direction,
  oppositeDirection,
  stepInDirection,
  gridToPixel,
  lerpGridPos,
  gridEquals,
  MoveTicker,
} from "../utils/grid";
import { TouchInput } from "../utils/touchInput";

// ── Constants ────────────────────────────────────────────────────

/** Maximum number of buffered direction inputs. */
const INPUT_BUFFER_SIZE = 2;

/** Default starting length (head + body segments). */
const DEFAULT_START_LENGTH = 3;

/** Extra tiles to keep sliding before a queued turn is applied. */
const NO_TURN_MOMENTUM = 0;

/** Key mapping from keyboard codes to Direction. */
const KEY_DIRECTION_MAP: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
};

type DirectionInputGuard = (dir: Direction) => boolean;

// ── Portal transit ──────────────────────────────────────────────

/**
 * Tracks an active portal transit where body segments are threading
 * through a portal pair one-by-one after the head has been teleported.
 */
export interface PortalTransitState {
  /** ID of the portal pair being traversed. */
  portalPairId: string;

  /** The portal end the head entered (entry side). */
  entryPos: GridPos;

  /** The portal end the head exited from (exit side). */
  exitPos: GridPos;

  /** Number of body segments that have not yet threaded through. */
  segmentsRemaining: number;
}

// ── Snake entity ─────────────────────────────────────────────────

export class Snake {
  /** Ordered list of grid positions: index 0 = head, rest = body. */
  private segments: GridPos[];

  /** Previous grid positions (before last step) for interpolation. */
  private prevSegments: GridPos[];

  /** Current movement direction (consumed at each grid step). */
  private direction: Direction;

  /** Buffered upcoming direction changes (max INPUT_BUFFER_SIZE). */
  private inputBuffer: Direction[] = [];

  /** Extra tiles to keep moving in the current direction before each turn applies. */
  private turnMomentumTiles = NO_TURN_MOMENTUM;

  /** Next queued turn currently waiting for momentum tiles to be consumed. */
  private pendingTurn: Direction | null = null;

  /** Number of remaining slide tiles before `pendingTurn` is applied. */
  private pendingTurnSlideTiles = 0;

  /** Whether the snake should grow on the next step (tail not removed). */
  private pendingGrowth = 0;

  /** Movement timing ticker. */
  private ticker: MoveTicker;

  /** Phaser sprites for each segment (index 0 = head). */
  private sprites: Phaser.GameObjects.Sprite[] = [];

  /** Reference to the Phaser scene. */
  private scene: Phaser.Scene;

  /** Whether the snake is alive and should process movement. */
  private alive = true;

  /** Touch/swipe input controller (created lazily via setupTouchInput). */
  private touchInput: TouchInput | null = null;

  /** Stored keyboard handler reference for cleanup in destroy(). */
  private keydownHandler: ((event: { code: string }) => void) | null = null;

  /** Optional scene-provided guard to reject biome-specific direction inputs. */
  private directionInputGuard: DirectionInputGuard | null = null;

  /** Whether an opposite-direction input was rejected since the last consumed step. */
  private rejectedOppositeDirectionInput = false;

  /** Active portal transit state (body segments threading through a portal). */
  private portalTransit: PortalTransitState | null = null;

  constructor(
    scene: Phaser.Scene,
    headPos: GridPos,
    direction: Direction = "right",
    length: number = DEFAULT_START_LENGTH,
    ticker?: MoveTicker,
  ) {
    this.scene = scene;
    this.direction = direction;
    this.ticker = ticker ?? new MoveTicker();

    // Build initial segment positions: head at headPos, body trailing opposite to direction
    this.segments = [];
    const trailDir = oppositeDirection(direction);
    for (let i = 0; i < length; i++) {
      const pos =
        i === 0
          ? { ...headPos }
          : stepInDirection(this.segments[i - 1], trailDir);
      this.segments.push(pos);
    }

    // Previous positions start as same as current (no interpolation on first frame)
    this.prevSegments = this.segments.map((s) => ({ ...s }));

    // Create sprites
    this.createSprites();
  }

  // ── Sprite management ──────────────────────────────────────────

  private createSprites(): void {
    for (let i = 0; i < this.segments.length; i++) {
      const textureKey =
        i === 0 ? TEXTURE_KEYS.SNAKE_HEAD : TEXTURE_KEYS.SNAKE_BODY;
      const pos = gridToPixel(this.segments[i]);
      const sprite = this.scene.add.sprite(pos.x, pos.y, textureKey);
      sprite.setDepth?.(RENDER_DEPTH.SNAKE);
      this.sprites.push(sprite);
    }
  }

  private addSegmentSprite(): void {
    const lastSeg = this.segments[this.segments.length - 1];
    const pos = gridToPixel(lastSeg);
    const sprite = this.scene.add.sprite(
      pos.x,
      pos.y,
      TEXTURE_KEYS.SNAKE_BODY,
    );
    sprite.setDepth?.(RENDER_DEPTH.SNAKE);
    this.sprites.push(sprite);
  }

  /** Re-apply a uniform render depth to all segment sprites. */
  setRenderDepth(depth: number): void {
    for (const sprite of this.sprites) {
      sprite.setDepth?.(depth);
    }
  }

  // ── Input handling ─────────────────────────────────────────────

  /**
   * Register keyboard input handlers on the scene.
   * Call this once after construction.
   */
  setupInput(): void {
    if (!this.scene.input?.keyboard) return;
    this.keydownHandler = (event: { code: string }) => {
      const dir = KEY_DIRECTION_MAP[event.code];
      if (dir) {
        this.bufferDirection(dir);
      }
    };
    this.scene.input.keyboard.on("keydown", this.keydownHandler);
  }

  /**
   * Register touch/swipe input on the Phaser canvas element.
   * Swipe gestures are converted to the same buffered direction system
   * used by keyboard controls. Call this once after construction.
   */
  setupTouchInput(): void {
    const canvas = this.scene.game?.canvas;
    if (!canvas) return;

    this.touchInput = new TouchInput();
    this.touchInput.attach(canvas, (dir: Direction) => {
      this.bufferDirection(dir);
    });
  }

  /**
   * Buffer a direction change. The direction is rejected if:
   * - The buffer is full
   * - It's the opposite of the last buffered direction (or current direction
   *   if buffer is empty) — anti-180-degree rule
   * - It's the same as the last buffered direction (or current direction)
   */
  bufferDirection(dir: Direction): void {
    if (this.directionInputGuard && !this.directionInputGuard(dir)) {
      this.rejectedOppositeDirectionInput = true;
      return;
    }
    if (this.inputBuffer.length >= INPUT_BUFFER_SIZE) return;

    const lastDir =
      this.inputBuffer.length > 0
        ? this.inputBuffer[this.inputBuffer.length - 1]
        : this.pendingTurn ?? this.direction;

    // Reject same direction.
    if (dir === lastDir) return;
    // Reject opposite (180°) and mark it so callers can treat it as a no-op.
    if (dir === oppositeDirection(lastDir)) {
      this.rejectedOppositeDirectionInput = true;
      return;
    }

    this.inputBuffer.push(dir);
  }

  /** Install/remove a scene-provided direction guard. */
  setDirectionInputGuard(guard: DirectionInputGuard | null): void {
    this.directionInputGuard = guard;
  }

  /**
   * Consume and clear whether an opposite-direction input was rejected.
   *
   * Call once per gameplay step to treat rejected opposite turns as explicit no-ops.
   */
  consumeRejectedOppositeDirectionInput(): boolean {
    const rejected = this.rejectedOppositeDirectionInput;
    this.rejectedOppositeDirectionInput = false;
    return rejected;
  }

  /** Configure how many extra tiles to slide before each queued turn applies. */
  setTurnMomentumTiles(extraTiles: number): void {
    this.turnMomentumTiles = Math.max(0, Math.floor(extraTiles));
    if (this.turnMomentumTiles === NO_TURN_MOMENTUM) {
      this.pendingTurnSlideTiles = 0;
    }
  }

  /**
   * Clear any in-progress ice momentum slide, applying the pending turn
   * immediately instead. Called after portal teleport so the snake does
   * not continue sliding in the pre-teleport direction after a spatial
   * discontinuity.
   */
  clearPendingMomentum(): void {
    if (this.pendingTurn !== null) {
      this.direction = this.pendingTurn;
      this.pendingTurn = null;
      this.pendingTurnSlideTiles = 0;
    }
  }

  // ── Movement ───────────────────────────────────────────────────

  /**
   * Advance the snake by `delta` ms. Returns `true` if a grid step occurred.
   */
  update(delta: number): boolean {
    if (!this.alive) return false;

    const stepped = this.ticker.advance(delta);

    if (stepped) {
      this.step();
    }

    // Update sprite positions with interpolation
    this.interpolateSprites();

    return stepped;
  }

  /**
   * Move the snake one grid step forward.
   * Consumes the next buffered direction if available.
   */
  private step(): void {
    if (this.pendingTurn === null && this.inputBuffer.length > 0) {
      const queuedTurn = this.inputBuffer.shift()!;
      if (this.turnMomentumTiles === NO_TURN_MOMENTUM) {
        this.direction = queuedTurn;
      } else {
        this.pendingTurn = queuedTurn;
        this.pendingTurnSlideTiles = this.turnMomentumTiles;
      }
    }

    if (this.pendingTurn !== null) {
      if (this.pendingTurnSlideTiles > 0) {
        this.pendingTurnSlideTiles--;
      } else {
        this.direction = this.pendingTurn;
        this.pendingTurn = null;
      }
    }

    this.advanceSegments(this.direction);
  }

  /**
   * Apply a deterministic one-tile external displacement.
   *
   * Used by biome mechanics such as Void Rift gravity. This does not mutate
   * the snake's facing direction or consume buffered player turns.
   */
  applyExternalNudge(direction: Direction): void {
    if (!this.alive) return;
    this.advanceSegments(direction);
  }

  private advanceSegments(direction: Direction): void {
    // Save previous positions for interpolation
    this.prevSegments = this.segments.map((s) => ({ ...s }));

    // Compute new head position
    const newHead = stepInDirection(this.segments[0], direction);

    // Shift segments: add new head, optionally keep or remove tail
    this.segments.unshift(newHead);

    if (this.pendingGrowth > 0) {
      this.pendingGrowth--;
      // Add a new sprite for the new segment
      this.addSegmentSprite();
      // Extend prevSegments to match new length
      this.prevSegments.unshift({ ...this.prevSegments[0] });
    } else {
      this.segments.pop();
    }
  }

  /**
   * Update sprite positions using linear interpolation between
   * previous and current grid positions.
   */
  private interpolateSprites(): void {
    const t = this.ticker.progress;

    for (let i = 0; i < this.sprites.length; i++) {
      if (i >= this.segments.length || i >= this.prevSegments.length) break;
      const pos = lerpGridPos(this.prevSegments[i], this.segments[i], t);
      this.sprites[i].setPosition(pos.x, pos.y);
    }
  }

  // ── Growth ─────────────────────────────────────────────────────

  /** Queue a number of growth segments. */
  grow(amount: number = 1): void {
    this.pendingGrowth += amount;
  }

  /**
   * Burn tail segments from the snake.
   *
   * Returns `false` when burning would consume the head segment.
   */
  burnTailSegments(amount: number): boolean {
    const burnCount = Math.max(0, Math.floor(amount));
    if (burnCount === 0) {
      return true;
    }

    // Keep at least the head segment alive.
    if (this.segments.length <= burnCount) {
      return false;
    }

    for (let i = 0; i < burnCount; i++) {
      this.segments.pop();
      this.prevSegments.pop();
      this.sprites.pop()?.destroy();
    }

    return true;
  }

  // ── Portal traversal ──────────────────────────────────────────

  /**
   * Teleport the snake head to a new grid position.
   *
   * Used by portal traversal: the head is relocated to the exit portal
   * cell while preserving the current direction and movement cadence.
   * The previous-position for the head is also set to the exit so that
   * sprite interpolation doesn't create a visual "slide" from the old
   * position to the new one.
   *
   * When `portalPairId` and `entryPos` are provided, initiates body
   * threading so that subsequent segments transit through the portal
   * one-by-one on each step.
   */
  teleportHead(
    exitPos: GridPos,
    portalPairId?: string,
    entryPos?: GridPos,
  ): void {
    this.segments[0] = { ...exitPos };
    this.prevSegments[0] = { ...exitPos };

    // Start body threading if portal info is provided and there are body segments
    if (portalPairId && entryPos && this.segments.length > 1) {
      this.portalTransit = {
        portalPairId,
        entryPos: { ...entryPos },
        exitPos: { ...exitPos },
        segmentsRemaining: this.segments.length - 1,
      };
    }
  }

  /**
   * Thread body segments through the active portal transit.
   *
   * Called after each movement step. For each body segment that has
   * arrived at the entry portal position, teleport it to the exit
   * position (and fix prevSegments to avoid interpolation glitches).
   *
   * Returns the number of segments threaded this step.
   */
  resolveBodyThreading(): number {
    if (!this.portalTransit) return 0;

    const { entryPos, exitPos } = this.portalTransit;
    let threaded = 0;

    for (let i = 1; i < this.segments.length; i++) {
      if (
        gridEquals(this.segments[i], entryPos)
      ) {
        this.segments[i] = { ...exitPos };
        // Also fix the previous position so interpolation doesn't
        // visually slide the segment across the screen
        if (i < this.prevSegments.length) {
          this.prevSegments[i] = { ...exitPos };
        }
        this.portalTransit.segmentsRemaining--;
        threaded++;
      }
    }

    // Transit is complete when all segments have threaded through
    if (this.portalTransit.segmentsRemaining <= 0) {
      this.portalTransit = null;
    }

    return threaded;
  }

  /**
   * Get the current portal transit state, or null if no transit is active.
   */
  getPortalTransit(): PortalTransitState | null {
    if (!this.portalTransit) return null;
    return { ...this.portalTransit, entryPos: { ...this.portalTransit.entryPos }, exitPos: { ...this.portalTransit.exitPos } };
  }

  /**
   * Clear the active portal transit (e.g. when the portal collapses
   * and remaining segments are force-teleported).
   */
  clearPortalTransit(): void {
    this.portalTransit = null;
  }

  /**
   * Force-complete the active portal transit by instantly teleporting
   * all remaining unthreaded body segments to the exit side.
   *
   * Used when a portal collapses while the snake is still mid-transit.
   * Each unthreaded segment that is still on the entry side (or hasn't
   * yet reached the exit side) is relocated to the exit position, and
   * its prevSegments entry is fixed to prevent interpolation glitches.
   *
   * After the forced teleport, the transit is cleared.
   *
   * Returns the number of segments that were force-teleported.
   */
  forceCompleteTransit(): number {
    if (!this.portalTransit) return 0;

    const { exitPos } = this.portalTransit;
    let forceTeleported = 0;

    // Teleport all body segments that haven't been threaded yet.
    // A segment that has already threaded will be at exitPos or
    // beyond it (following the head). We only relocate segments
    // that are NOT already at the exit position — but more
    // precisely, we just relocate ALL remaining body segments
    // that are still "on the entry side" (i.e. not yet at the
    // exit position or trailing the head on the exit side).
    //
    // The simplest correct approach: walk body segments from tail
    // to head. For each segment still at the entry pos or that
    // hasn't reached the exit side, teleport to exitPos. But since
    // we can't easily distinguish which side a segment is on when
    // positions overlap, we just teleport the last N segments
    // (where N = segmentsRemaining) to exitPos, maintaining their
    // relative ordering by keeping them all at the exit position.
    const total = this.segments.length;
    const remaining = this.portalTransit.segmentsRemaining;

    // The unthreaded segments are the tail-end of the body.
    // They start at index (total - remaining) and go to (total - 1).
    const startIdx = total - remaining;
    for (let i = startIdx; i < total; i++) {
      this.segments[i] = { ...exitPos };
      if (i < this.prevSegments.length) {
        this.prevSegments[i] = { ...exitPos };
      }
      forceTeleported++;
    }

    this.portalTransit = null;
    return forceTeleported;
  }

  // ── State queries ──────────────────────────────────────────────

  /** Get the head grid position. */
  getHeadPosition(): GridPos {
    return { ...this.segments[0] };
  }

  /** Get all segment grid positions (head first). */
  getSegments(): readonly GridPos[] {
    return this.segments;
  }

  /** Get the number of segments (head + body). */
  getLength(): number {
    return this.segments.length;
  }

  /** Get the current movement direction. */
  getDirection(): Direction {
    return this.direction;
  }

  /**
   * Whether a direction is currently queued to be applied on a future step.
   *
   * Includes both the immediate input buffer and a pending delayed-turn state.
   */
  hasQueuedDirection(dir: Direction): boolean {
    if (this.pendingTurn === dir) {
      return true;
    }
    return this.inputBuffer.includes(dir);
  }

  /** Check if the given grid position overlaps any body segment (not head). */
  isOnBody(pos: GridPos): boolean {
    for (let i = 1; i < this.segments.length; i++) {
      if (gridEquals(pos, this.segments[i])) return true;
    }
    return false;
  }

  /** Check if the given grid position overlaps any segment (including head). */
  isOnSnake(pos: GridPos): boolean {
    for (let i = 0; i < this.segments.length; i++) {
      if (gridEquals(pos, this.segments[i])) return true;
    }
    return false;
  }

  /** Check for self-collision: head occupies a body segment. */
  hasSelfCollision(): boolean {
    return this.isOnBody(this.segments[0]);
  }

  /** Whether the snake is alive. */
  isAlive(): boolean {
    return this.alive;
  }

  /** Kill the snake (stops movement). */
  kill(): void {
    this.alive = false;
  }

  /** Get the movement ticker (for external progress queries). */
  getTicker(): MoveTicker {
    return this.ticker;
  }

  // ── Cleanup ────────────────────────────────────────────────────

  /** Destroy all sprites, detach input listeners, and reset state. */
  destroy(): void {
    this.alive = false;
    this.portalTransit = null;
    if (this.keydownHandler && this.scene.input?.keyboard) {
      this.scene.input.keyboard.off("keydown", this.keydownHandler);
      this.keydownHandler = null;
    }
    this.touchInput?.detach();
    this.touchInput = null;
    this.directionInputGuard = null;
    this.rejectedOppositeDirectionInput = false;
    for (const sprite of this.sprites) {
      sprite.destroy();
    }
    this.sprites = [];
  }

  /**
   * Reset the snake to a new starting position.
   * Destroys existing sprites and creates new ones.
   */
  reset(
    headPos: GridPos,
    direction: Direction = "right",
    length: number = DEFAULT_START_LENGTH,
  ): void {
    // Destroy old sprites
    for (const sprite of this.sprites) {
      sprite.destroy();
    }
    this.sprites = [];

    // Reset state
    this.alive = true;
    this.direction = direction;
    this.inputBuffer = [];
    this.pendingTurn = null;
    this.pendingTurnSlideTiles = 0;
    this.pendingGrowth = 0;
    this.rejectedOppositeDirectionInput = false;
    this.portalTransit = null;
    this.ticker.reset();

    // Build new segments
    this.segments = [];
    const trailDir = oppositeDirection(direction);
    for (let i = 0; i < length; i++) {
      const pos =
        i === 0
          ? { ...headPos }
          : stepInDirection(this.segments[i - 1], trailDir);
      this.segments.push(pos);
    }

    this.prevSegments = this.segments.map((s) => ({ ...s }));

    // Create new sprites
    this.createSprites();
  }
}
