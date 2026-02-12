import Phaser from "phaser";
import { TEXTURE_KEYS } from "../config";
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
    this.sprites.push(sprite);
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
    if (this.inputBuffer.length >= INPUT_BUFFER_SIZE) return;

    const lastDir =
      this.inputBuffer.length > 0
        ? this.inputBuffer[this.inputBuffer.length - 1]
        : this.direction;

    // Reject same direction or opposite (180°)
    if (dir === lastDir || dir === oppositeDirection(lastDir)) return;

    this.inputBuffer.push(dir);
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
    // Consume next buffered direction
    if (this.inputBuffer.length > 0) {
      this.direction = this.inputBuffer.shift()!;
    }

    // Save previous positions for interpolation
    this.prevSegments = this.segments.map((s) => ({ ...s }));

    // Compute new head position
    const newHead = stepInDirection(this.segments[0], this.direction);

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
   * Remove segments from the tail end of the snake.
   *
   * Used by the Molten Core lava-pool mechanic to burn off tail segments.
   * The head segment (index 0) is never removed by this method.
   *
   * @param count - Number of tail segments to remove.
   * @returns The number of segments actually removed (may be less than
   *          `count` if the snake isn't long enough).
   */
  burnTail(count: number): number {
    const removable = Math.min(count, this.segments.length - 1); // keep head
    for (let i = 0; i < removable; i++) {
      this.segments.pop();
      this.prevSegments.pop();
      const sprite = this.sprites.pop();
      sprite?.destroy();
    }
    // Cancel any pending growth that would extend past the burn
    this.pendingGrowth = Math.max(0, this.pendingGrowth - count);
    return removable;
  }

  // ── Position nudge (Void Rift gravity well) ─────────────────────

  /**
   * Shift the head position by a delta vector.
   *
   * Used by the Void Rift gravity well to pull the snake toward the
   * arena center. The nudge is applied after normal movement so the
   * player can anticipate it (deterministic cadence).
   *
   * Only the head segment is moved; the body will follow naturally on
   * subsequent steps.
   */
  applyPositionNudge(delta: GridPos): void {
    this.segments[0] = {
      col: this.segments[0].col + delta.col,
      row: this.segments[0].row + delta.row,
    };
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
    if (this.keydownHandler && this.scene.input?.keyboard) {
      this.scene.input.keyboard.off("keydown", this.keydownHandler);
      this.keydownHandler = null;
    }
    this.touchInput?.detach();
    this.touchInput = null;
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
    this.pendingGrowth = 0;
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
