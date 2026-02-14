import Phaser from "phaser";
import { TEXTURE_KEYS } from "../config";
import { gridToPixel, type GridPos } from "../utils/grid";
import type { EchoGhost } from "../entities/EchoGhost";

// ── Constants ────────────────────────────────────────────────────

/** Base opacity for ghost segments (40% per spec). */
export const GHOST_BASE_ALPHA = 0.4;

/** Number of trailing particles emitted per tail segment per frame. */
export const GHOST_TRAIL_PARTICLE_COUNT = 1;

/** Lifespan of trailing particles in ms. */
export const GHOST_TRAIL_PARTICLE_LIFESPAN = 300;

/** Speed range for trailing particles (px/s). */
export const GHOST_TRAIL_PARTICLE_SPEED_MIN = 10;
export const GHOST_TRAIL_PARTICLE_SPEED_MAX = 40;

// ── EchoGhostRenderer ──────────────────────────────────────────

/**
 * Renders the echo ghost as a translucent hazard with dashed-outline
 * segments and trailing particles.
 *
 * - Each ghost segment uses the `ghost-body` texture (dashed outline).
 * - All sprites are drawn at 40% base opacity, further modulated by
 *   the ghost's lifecycle opacity (fading out when buffer drains).
 * - A persistent particle emitter on the tail segment produces a
 *   trailing particle effect.
 *
 * The renderer owns all Phaser display objects and must be destroyed
 * when the run ends.
 */
export class EchoGhostRenderer {
  private scene: Phaser.Scene;
  private sprites: Phaser.GameObjects.Sprite[] = [];
  private trailEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Update the visual representation of the ghost trail.
   *
   * Call once per frame (not just per tick) so opacity transitions
   * appear smooth. The method reconciles the sprite pool with the
   * current ghost trail length and positions sprites at the correct
   * pixel coordinates.
   */
  update(ghost: EchoGhost): void {
    const trail = ghost.getGhostTrail();
    const lifecycleOpacity = ghost.getOpacity();

    // If no trail or fully invisible, hide everything
    if (!trail || lifecycleOpacity <= 0) {
      this.hideAll();
      return;
    }

    const effectiveAlpha = GHOST_BASE_ALPHA * lifecycleOpacity;

    // Reconcile sprite pool with trail length
    this.ensureSpriteCount(trail.length);

    // Position and show sprites (bounded by available sprites)
    const visibleCount = Math.min(trail.length, this.sprites.length);
    for (let i = 0; i < visibleCount; i++) {
      const pos = gridToPixel(trail[i]);
      this.sprites[i].setPosition(pos.x, pos.y);
      this.sprites[i].setAlpha(effectiveAlpha);
      this.sprites[i].setVisible(true);
    }

    // Hide excess sprites
    for (let i = trail.length; i < this.sprites.length; i++) {
      this.sprites[i].setVisible(false);
    }

    // Update trailing particles on the tail segment
    this.updateTrailParticles(trail, effectiveAlpha);
  }

  /** Create or remove sprites to match the desired count. */
  private ensureSpriteCount(needed: number): void {
    // Add sprites if we need more
    while (this.sprites.length < needed) {
      if (!this.scene.textures.exists(TEXTURE_KEYS.GHOST_BODY)) break;
      const sprite = this.scene.add.sprite(0, 0, TEXTURE_KEYS.GHOST_BODY);
      sprite.setVisible(false);
      this.sprites.push(sprite);
    }
  }

  /** Hide all sprites and stop the trail emitter. */
  private hideAll(): void {
    for (const sprite of this.sprites) {
      sprite.setVisible(false);
    }
    if (this.trailEmitter) {
      this.trailEmitter.stop();
    }
  }

  /** Manage the trailing particle emitter on the ghost's tail. */
  private updateTrailParticles(
    trail: readonly GridPos[],
    alpha: number,
  ): void {
    if (!this.scene.textures.exists(TEXTURE_KEYS.GHOST_PARTICLE)) return;

    const tail = trail[trail.length - 1];
    const tailPos = gridToPixel(tail);

    if (!this.trailEmitter) {
      this.trailEmitter = this.scene.add.particles(
        tailPos.x,
        tailPos.y,
        TEXTURE_KEYS.GHOST_PARTICLE,
        {
          speed: {
            min: GHOST_TRAIL_PARTICLE_SPEED_MIN,
            max: GHOST_TRAIL_PARTICLE_SPEED_MAX,
          },
          angle: { min: 0, max: 360 },
          lifespan: GHOST_TRAIL_PARTICLE_LIFESPAN,
          quantity: GHOST_TRAIL_PARTICLE_COUNT,
          scale: { start: 1, end: 0 },
          alpha: { start: alpha, end: 0 },
          frequency: 50,
        },
      );
    } else {
      this.trailEmitter.setPosition(tailPos.x, tailPos.y);
      this.trailEmitter.particleAlpha = alpha;
      if (!this.trailEmitter.emitting) {
        this.trailEmitter.start();
      }
    }
  }

  /** Remove all sprites and emitters from the scene. */
  destroy(): void {
    for (const sprite of this.sprites) {
      sprite.destroy();
    }
    this.sprites = [];

    if (this.trailEmitter) {
      this.trailEmitter.destroy();
      this.trailEmitter = null;
    }
  }

  /** Get current sprite count (for testing). */
  getSpriteCount(): number {
    return this.sprites.length;
  }

  /** Get visible sprite count (for testing). */
  getVisibleSpriteCount(): number {
    return this.sprites.filter((s) => s.visible).length;
  }

  /** Get the trail emitter (for testing). */
  getTrailEmitter(): Phaser.GameObjects.Particles.ParticleEmitter | null {
    return this.trailEmitter;
  }
}
