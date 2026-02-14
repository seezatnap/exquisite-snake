import Phaser from "phaser";
import { TILE_SIZE, RENDER_DEPTH, TEXTURE_KEYS } from "../config";
import { gridToPixel, type GridPos } from "../utils/grid";
import type { EchoGhostState } from "../entities/EchoGhost";
import { Biome } from "../systems/BiomeManager";

// ── Constants ─────────────────────────────────────────────────────

/** Base opacity for the ghost rendering (spec: 40%). */
export const GHOST_BASE_OPACITY = 0.4;

/** Dash length in pixels for the ghost outline. */
export const GHOST_DASH_LENGTH = 4;

/** Gap length in pixels between dashes. */
export const GHOST_DASH_GAP = 3;

/** Line width for the dashed outline. */
export const GHOST_OUTLINE_WIDTH = 2;

/** Number of trailing particles emitted per render frame. */
export const GHOST_TRAIL_PARTICLE_COUNT = 2;

/** Lifespan of trailing particles in ms. */
export const GHOST_TRAIL_PARTICLE_LIFESPAN = 280;

/** Speed range for trailing particles (px/s). */
export const GHOST_TRAIL_PARTICLE_SPEED_MIN = 20;
export const GHOST_TRAIL_PARTICLE_SPEED_MAX = 50;

/** Biome-specific ghost tint colors. */
export const GHOST_BIOME_TINTS: Record<Biome, number> = {
  [Biome.NeonCity]: 0x00f0ff,
  [Biome.IceCavern]: 0x8ed5ff,
  [Biome.MoltenCore]: 0xff7a33,
  [Biome.VoidRift]: 0x8a63ff,
};

// ── EchoGhostRenderer ────────────────────────────────────────────

/**
 * Renders the echo ghost trail with a dashed outline, 40% opacity,
 * trailing particle effects, and biome-matched tint color.
 *
 * Lifecycle:
 * - Call `render(state, biome)` every frame during gameplay.
 * - Call `destroy()` on game restart / scene shutdown.
 */
export class EchoGhostRenderer {
  private scene: Phaser.Scene;

  /** Graphics object for drawing dashed outlines. */
  private graphics: Phaser.GameObjects.Graphics | null = null;

  /** Particle emitter for trailing effects (reused across frames). */
  private trailEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null =
    null;

  /** Previous tail position for trail particle spawning. */
  private prevTailPos: GridPos | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Render the echo ghost for the current frame.
   *
   * @param state  Read-only ghost state from `EchoGhost.getState()`.
   * @param biome  Active biome for tint coloring.
   */
  render(state: EchoGhostState, biome: Biome): void {
    if (!state.active || state.segments.length === 0) {
      this.clear();
      return;
    }

    const tintColor = GHOST_BIOME_TINTS[biome];
    const alpha = GHOST_BASE_OPACITY * state.opacity;

    this.drawDashedOutlines(state.segments, tintColor, alpha);
    this.emitTrailingParticles(state.segments, tintColor, alpha);
  }

  /** Clear all ghost visuals (e.g. when ghost is inactive). */
  clear(): void {
    this.graphics?.clear?.();
    this.prevTailPos = null;
  }

  /** Get the underlying graphics object (for external depth management). */
  getGraphics(): Phaser.GameObjects.Graphics | null {
    return this.graphics;
  }

  /** Destroy all owned Phaser objects. */
  destroy(): void {
    this.graphics?.destroy?.();
    this.graphics = null;
    this.trailEmitter?.destroy?.();
    this.trailEmitter = null;
    this.prevTailPos = null;
  }

  // ── Internal ─────────────────────────────────────────────────────

  /**
   * Draw dashed rectangular outlines for each ghost segment.
   */
  private drawDashedOutlines(
    segments: readonly GridPos[],
    tintColor: number,
    alpha: number,
  ): void {
    if (!this.graphics) {
      this.graphics = this.scene.add.graphics();
      this.graphics.setDepth?.(RENDER_DEPTH.ECHO_GHOST);
    }

    const gfx = this.graphics;
    gfx.clear?.();
    gfx.lineStyle(GHOST_OUTLINE_WIDTH, tintColor, alpha);

    const inset = 2;
    const size = TILE_SIZE - inset * 2;

    for (const seg of segments) {
      const center = gridToPixel(seg);
      const x = center.x - TILE_SIZE / 2 + inset;
      const y = center.y - TILE_SIZE / 2 + inset;

      this.drawDashedRect(gfx, x, y, size, size);
    }

    gfx.strokePath?.();
  }

  /**
   * Draw a dashed rectangle by walking each edge with dash/gap segments.
   */
  private drawDashedRect(
    gfx: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    // Top edge
    this.drawDashedLine(gfx, x, y, x + width, y);
    // Right edge
    this.drawDashedLine(gfx, x + width, y, x + width, y + height);
    // Bottom edge
    this.drawDashedLine(gfx, x + width, y + height, x, y + height);
    // Left edge
    this.drawDashedLine(gfx, x, y + height, x, y);
  }

  /**
   * Draw a dashed line from (x1,y1) to (x2,y2).
   */
  private drawDashedLine(
    gfx: Phaser.GameObjects.Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length === 0) return;

    const ux = dx / length;
    const uy = dy / length;

    let drawn = 0;
    let drawing = true;

    while (drawn < length) {
      const segLen = drawing
        ? Math.min(GHOST_DASH_LENGTH, length - drawn)
        : Math.min(GHOST_DASH_GAP, length - drawn);

      if (drawing) {
        gfx.moveTo?.(x1 + ux * drawn, y1 + uy * drawn);
        gfx.lineTo?.(
          x1 + ux * (drawn + segLen),
          y1 + uy * (drawn + segLen),
        );
      }

      drawn += segLen;
      drawing = !drawing;
    }
  }

  /**
   * Emit trailing particles behind the ghost's tail segment.
   */
  private emitTrailingParticles(
    segments: readonly GridPos[],
    tintColor: number,
    alpha: number,
  ): void {
    if (segments.length === 0) return;

    const tail = segments[segments.length - 1];

    // Only emit particles when the tail position changes
    if (
      this.prevTailPos &&
      this.prevTailPos.col === tail.col &&
      this.prevTailPos.row === tail.row
    ) {
      return;
    }

    this.prevTailPos = { col: tail.col, row: tail.row };

    // Guard: skip if particle texture is missing (e.g. in tests without Boot)
    if (!this.scene.textures?.exists?.(TEXTURE_KEYS.PARTICLE)) return;

    const tailPixel = gridToPixel(tail);
    const emitter = this.scene.add.particles(
      tailPixel.x,
      tailPixel.y,
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
        tint: tintColor,
        emitting: false,
      },
    );

    emitter.explode(GHOST_TRAIL_PARTICLE_COUNT, 0, 0);

    // Destroy the emitter after particles expire
    this.scene.time?.delayedCall?.(GHOST_TRAIL_PARTICLE_LIFESPAN + 50, () => {
      emitter.destroy();
    });
  }
}
