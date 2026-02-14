import Phaser from "phaser";
import { TILE_SIZE, COLORS, TEXTURE_KEYS } from "../config";
import { gridToPixel } from "../utils/grid";
import type { EchoGhost, GhostTrailEntry } from "../entities/EchoGhost";

// ── Rendering constants ─────────────────────────────────────────

/** Base alpha applied to ghost segments (40% opacity). */
export const GHOST_BASE_ALPHA = 0.4;

/** Stroke width for the dashed outline around ghost segments. */
export const GHOST_OUTLINE_WIDTH = 1.5;

/** Dash length in pixels for the ghost outline. */
export const GHOST_DASH_LENGTH = 4;

/** Gap length in pixels between dashes. */
export const GHOST_DASH_GAP = 3;

/** Color used for the ghost's dashed outline (same as snake body). */
export const GHOST_OUTLINE_COLOR = COLORS.SNAKE_BODY;

/** Color used for the ghost segment fill. */
export const GHOST_FILL_COLOR = COLORS.SNAKE_BODY;

// ── Trailing particle constants ─────────────────────────────────

/** Number of trailing particles emitted per render call. */
export const GHOST_TRAIL_PARTICLE_COUNT = 3;

/** Lifespan of each trailing particle in ms. */
export const GHOST_TRAIL_PARTICLE_LIFESPAN = 300;

/** Speed range for trailing particles (px/s). */
export const GHOST_TRAIL_PARTICLE_SPEED_MIN = 10;
export const GHOST_TRAIL_PARTICLE_SPEED_MAX = 40;

/**
 * Minimum number of ticks between trailing particle emissions.
 * Prevents particle spam on every frame.
 */
const TRAIL_EMIT_INTERVAL_MS = 120;

// ── GhostRenderer ───────────────────────────────────────────────

/**
 * Renders the echo ghost as a translucent hazard with dashed outlines
 * and trailing particles.
 *
 * Uses a Phaser Graphics object redrawn each frame (matching the
 * existing segment geometry from Boot.ts — rounded rects).
 *
 * The renderer is a standalone system that reads from the EchoGhost
 * entity and draws to the scene. It does not modify game state.
 */
export class GhostRenderer {
  private graphics: Phaser.GameObjects.Graphics;
  private scene: Phaser.Scene;
  private timeSinceLastEmit = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
  }

  /**
   * Render the ghost trail for the current frame.
   *
   * Call this every frame from the scene's `update()` method.
   * The renderer clears and redraws the ghost graphics each frame.
   *
   * @param ghost  The EchoGhost entity to render.
   * @param delta  Time elapsed since last frame (ms), for particle timing.
   */
  render(ghost: EchoGhost, delta: number): void {
    this.graphics.clear();

    if (!ghost.isActive()) return;

    const trail = ghost.getGhostTrailWithOpacity();
    if (trail.length === 0) return;

    this.drawTrail(trail);
    this.emitTrailingParticles(ghost, delta);
  }

  /**
   * Draw all ghost trail entries as translucent segments with dashed
   * outlines. Each segment matches the snake body geometry: a rounded
   * rect inset by 2px on each side.
   */
  private drawTrail(trail: readonly GhostTrailEntry[]): void {
    for (const entry of trail) {
      const alpha = entry.opacity * GHOST_BASE_ALPHA;
      if (alpha <= 0) continue;

      for (const seg of entry.snapshot.segments) {
        const px = gridToPixel(seg);
        const x = px.x - TILE_SIZE / 2;
        const y = px.y - TILE_SIZE / 2;

        // Filled rounded rect (matching snake body: inset 2px, radius 3)
        this.graphics.fillStyle(GHOST_FILL_COLOR, alpha);
        this.graphics.fillRoundedRect(
          x + 2,
          y + 2,
          TILE_SIZE - 4,
          TILE_SIZE - 4,
          3,
        );

        // Dashed outline
        this.drawDashedRect(
          x + 2,
          y + 2,
          TILE_SIZE - 4,
          TILE_SIZE - 4,
          alpha,
        );
      }
    }
  }

  /**
   * Draw a dashed rectangle outline at the given position.
   *
   * Phaser's built-in Graphics doesn't have native dashed line support,
   * so we draw dashes manually along each edge.
   */
  private drawDashedRect(
    x: number,
    y: number,
    w: number,
    h: number,
    alpha: number,
  ): void {
    this.graphics.lineStyle(GHOST_OUTLINE_WIDTH, GHOST_OUTLINE_COLOR, alpha);

    // Top edge
    this.drawDashedLine(x, y, x + w, y);
    // Right edge
    this.drawDashedLine(x + w, y, x + w, y + h);
    // Bottom edge
    this.drawDashedLine(x + w, y + h, x, y + h);
    // Left edge
    this.drawDashedLine(x, y + h, x, y);
  }

  /**
   * Draw a dashed line between two points.
   */
  private drawDashedLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) return;

    const nx = dx / length;
    const ny = dy / length;
    const dashPlusGap = GHOST_DASH_LENGTH + GHOST_DASH_GAP;

    let dist = 0;
    while (dist < length) {
      const dashEnd = Math.min(dist + GHOST_DASH_LENGTH, length);
      this.graphics.beginPath();
      this.graphics.moveTo(x1 + nx * dist, y1 + ny * dist);
      this.graphics.lineTo(x1 + nx * dashEnd, y1 + ny * dashEnd);
      this.graphics.strokePath();
      dist += dashPlusGap;
    }
  }

  /**
   * Emit trailing particles at the ghost's current head position.
   * Throttled to avoid excessive particle creation.
   */
  private emitTrailingParticles(ghost: EchoGhost, delta: number): void {
    this.timeSinceLastEmit += delta;
    if (this.timeSinceLastEmit < TRAIL_EMIT_INTERVAL_MS) return;
    this.timeSinceLastEmit = 0;

    if (!this.scene.textures.exists(TEXTURE_KEYS.PARTICLE)) return;

    const head = ghost.getGhostHead();
    if (!head || head.segments.length === 0) return;

    const headSeg = head.segments[head.segments.length - 1];
    const px = gridToPixel(headSeg);

    const fadeOpacity = ghost.getFadeOpacity();
    const alpha = GHOST_BASE_ALPHA * fadeOpacity;
    if (alpha <= 0) return;

    const emitter = this.scene.add.particles(
      px.x,
      px.y,
      TEXTURE_KEYS.PARTICLE,
      {
        speed: {
          min: GHOST_TRAIL_PARTICLE_SPEED_MIN,
          max: GHOST_TRAIL_PARTICLE_SPEED_MAX,
        },
        angle: { min: 0, max: 360 },
        lifespan: GHOST_TRAIL_PARTICLE_LIFESPAN,
        quantity: GHOST_TRAIL_PARTICLE_COUNT,
        scale: { start: 0.6, end: 0 },
        alpha: { start: alpha, end: 0 },
        tint: GHOST_OUTLINE_COLOR,
        emitting: false,
      },
    );

    emitter.explode(GHOST_TRAIL_PARTICLE_COUNT, 0, 0);

    this.scene.time.delayedCall(GHOST_TRAIL_PARTICLE_LIFESPAN + 50, () => {
      emitter.destroy();
    });
  }

  /** Destroy the graphics object (call on scene/entity cleanup). */
  destroy(): void {
    this.graphics.destroy();
  }
}
