import Phaser from "phaser";
import { DEPTH, TEXTURE_KEYS } from "../config";
import { GRAVITY_CENTER } from "../systems/BiomeMechanics";
import { gridToPixel } from "../utils/grid";

// ── Vortex visual configuration ──────────────────────────────────

/** Number of concentric ring layers in the vortex. */
export const VORTEX_RING_COUNT = 3;

/** Rotation speed of the vortex rings in radians per second. */
export const VORTEX_ROTATION_SPEED = 1.5;

/** Base alpha for the outermost ring (inner rings are brighter). */
export const VORTEX_ALPHA_BASE = 0.25;

/** Alpha increment per ring moving inward. */
export const VORTEX_ALPHA_STEP = 0.15;

/** Pulse period for the vortex breathing effect in ms. */
export const VORTEX_PULSE_PERIOD_MS = 2_000;

/** Minimum scale multiplier during the pulse. */
export const VORTEX_PULSE_SCALE_MIN = 0.92;

/** Maximum scale multiplier during the pulse. */
export const VORTEX_PULSE_SCALE_MAX = 1.08;

/** Size of each ring sprite in pixels. */
export const VORTEX_RING_SIZE = 80;

/** Scale step per ring (inner rings are smaller). */
export const VORTEX_RING_SCALE_STEP = 0.3;

// ── VoidVortex ──────────────────────────────────────────────────

/**
 * Purely visual vortex effect rendered at the arena center during the
 * Void Rift biome. Consists of concentric spinning rings that pulse
 * in size, providing a visual indicator of the gravity well location.
 *
 * The vortex has no gameplay effect — the actual gravity mechanic is
 * handled by {@link GravityWellManager}.
 */
export class VoidVortex {
  /** The Phaser scene this vortex belongs to. */
  private scene: Phaser.Scene | null = null;

  /** Ring sprite objects, from outermost (index 0) to innermost. */
  private rings: Phaser.GameObjects.Sprite[] = [];

  /** Elapsed time in ms for animation (rotation + pulse). */
  private elapsed = 0;

  /** Whether the vortex is currently visible and animating. */
  private active = false;

  /** Pixel coordinates of the vortex center. */
  private readonly centerX: number;
  private readonly centerY: number;

  constructor() {
    const center = gridToPixel(GRAVITY_CENTER);
    this.centerX = center.x;
    this.centerY = center.y;
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  /**
   * Bind the vortex to a Phaser scene and create ring sprites.
   * Must be called once (e.g. during `create()` or `startRun()`).
   */
  init(scene: Phaser.Scene): void {
    this.scene = scene;
    this.createRings();
    this.setVisible(false);
  }

  /**
   * Show the vortex and begin animating.
   */
  show(): void {
    this.active = true;
    this.elapsed = 0;
    this.setVisible(true);
  }

  /**
   * Hide the vortex and stop animating.
   */
  hide(): void {
    this.active = false;
    this.setVisible(false);
  }

  /** Whether the vortex is currently visible. */
  isActive(): boolean {
    return this.active;
  }

  // ── Animation ──────────────────────────────────────────────────

  /**
   * Advance the vortex animation by `deltaMs` milliseconds.
   * Call every frame from the scene's `update()`.
   */
  update(deltaMs: number): void {
    if (!this.active || this.rings.length === 0) return;

    this.elapsed += deltaMs;

    // Pulse: breathing scale effect
    const pulseT =
      (Math.sin((this.elapsed / VORTEX_PULSE_PERIOD_MS) * Math.PI * 2) + 1) / 2;
    const pulseMult =
      VORTEX_PULSE_SCALE_MIN +
      pulseT * (VORTEX_PULSE_SCALE_MAX - VORTEX_PULSE_SCALE_MIN);

    const rotationRad = (this.elapsed / 1000) * VORTEX_ROTATION_SPEED;

    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];
      // Each ring rotates in alternating directions for visual depth
      const dir = i % 2 === 0 ? 1 : -1;
      ring.setRotation(rotationRad * dir * (1 + i * 0.3));

      // Scale: outer rings are larger, all pulse together
      const baseScale = 1 - i * VORTEX_RING_SCALE_STEP;
      ring.setScale(baseScale * pulseMult);
    }
  }

  // ── State queries ──────────────────────────────────────────────

  /** Get the number of ring sprites. */
  getRingCount(): number {
    return this.rings.length;
  }

  /** Get the elapsed animation time in ms. */
  getElapsed(): number {
    return this.elapsed;
  }

  // ── Cleanup ────────────────────────────────────────────────────

  /** Destroy all ring sprites and reset state. */
  destroy(): void {
    for (const ring of this.rings) {
      ring.destroy();
    }
    this.rings = [];
    this.active = false;
    this.elapsed = 0;
    this.scene = null;
  }

  // ── Private helpers ────────────────────────────────────────────

  /** Create the concentric ring sprites. */
  private createRings(): void {
    if (!this.scene) return;

    for (let i = 0; i < VORTEX_RING_COUNT; i++) {
      const sprite = this.scene.add.sprite(
        this.centerX,
        this.centerY,
        TEXTURE_KEYS.VOID_VORTEX,
      );
      sprite.setDepth(DEPTH.MECHANIC_VISUALS);
      const alpha = VORTEX_ALPHA_BASE + i * VORTEX_ALPHA_STEP;
      sprite.setAlpha(alpha);
      const scale = 1 - i * VORTEX_RING_SCALE_STEP;
      sprite.setScale(scale);
      this.rings.push(sprite);
    }
  }

  /** Set visibility on all ring sprites. */
  private setVisible(visible: boolean): void {
    for (const ring of this.rings) {
      ring.setVisible(visible);
    }
  }
}
