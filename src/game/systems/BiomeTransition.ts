import Phaser from "phaser";
import { ARENA_WIDTH, ARENA_HEIGHT } from "../config";

// ── Transition configuration ────────────────────────────────────

/** Total duration of the dissolve transition (ms). */
export const TRANSITION_DURATION_MS = 600;

/**
 * Fraction of the transition at which peak opacity is reached and the
 * theme swap occurs. The first half fades the overlay in, the second
 * half fades it out.
 */
export const TRANSITION_MIDPOINT = 0.5;

/** Peak alpha of the dissolve overlay (0–1). */
export const TRANSITION_PEAK_ALPHA = 0.55;

/** Duration of the transition screen-shake (ms). */
export const TRANSITION_SHAKE_DURATION = 120;

/**
 * Screen-shake intensity during biome transition.
 * Slightly less than the death shake to differentiate the two.
 */
export const TRANSITION_SHAKE_INTENSITY = 0.005;

/** Depth for the transition overlay — above everything. */
const OVERLAY_DEPTH = 1000;

// ── BiomeTransition ─────────────────────────────────────────────

/**
 * Manages biome-to-biome visual transition effects.
 *
 * **Dissolve effect:** A full-screen colour overlay fades in to
 * {@link TRANSITION_PEAK_ALPHA}, at which point the palette/tilemap
 * swap callback fires, then the overlay fades back out.
 *
 * **Screen-shake:** A subtle camera shake fires at the midpoint
 * to punctuate the transition.
 *
 * The game loop continues running during the transition — no gameplay
 * desync. The transition is purely visual.
 */
export class BiomeTransition {
  /** Whether a transition is currently in progress. */
  private active = false;

  /** Elapsed time within the current transition (ms). */
  private elapsed = 0;

  /** The overlay Graphics object (created on first use, reused). */
  private overlay: Phaser.GameObjects.Graphics | null = null;

  /** The Phaser scene that owns this transition. */
  private scene: Phaser.Scene | null = null;

  /** Callback to fire at the midpoint to swap palette/tilemap. */
  private swapCallback: (() => void) | null = null;

  /** Whether the midpoint swap has already fired for the current transition. */
  private swapFired = false;

  /** Whether the midpoint shake has already fired. */
  private shakeFired = false;

  /** Colour used for the dissolve overlay (old biome background). */
  private overlayColor = 0x000000;

  // ── Public API ──────────────────────────────────────────────

  /** Whether a transition is currently playing. */
  isActive(): boolean {
    return this.active;
  }

  /**
   * Bind this transition to a Phaser scene. Must be called once
   * (e.g. in `create()`) before any transitions can play.
   */
  init(scene: Phaser.Scene): void {
    this.scene = scene;
  }

  /**
   * Start a dissolve transition.
   *
   * @param overlayColor The colour to use for the dissolve overlay
   *   (typically the *old* biome's background colour so the dissolve
   *   looks like the old scene fading to a wash before the new one
   *   is revealed).
   * @param onSwap Callback fired at the transition midpoint — this
   *   is where the palette/tilemap swap should happen.
   */
  start(overlayColor: number, onSwap: () => void): void {
    if (!this.scene) return;

    // If a transition is already running, fast-forward it
    if (this.active) {
      this.finishImmediate();
    }

    this.active = true;
    this.elapsed = 0;
    this.swapCallback = onSwap;
    this.swapFired = false;
    this.shakeFired = false;
    this.overlayColor = overlayColor;

    this.ensureOverlay();
    this.overlay!.setAlpha(0);
    this.overlay!.setVisible(true);
  }

  /**
   * Advance the transition by `deltaMs` milliseconds.
   * Call this every frame from the scene's `update()`.
   */
  update(deltaMs: number): void {
    if (!this.active || !this.overlay) return;

    this.elapsed += deltaMs;

    const progress = Math.min(this.elapsed / TRANSITION_DURATION_MS, 1);

    // Midpoint: fire the swap callback and screen-shake
    if (progress >= TRANSITION_MIDPOINT && !this.swapFired) {
      this.swapFired = true;
      this.swapCallback?.();
    }

    if (progress >= TRANSITION_MIDPOINT && !this.shakeFired) {
      this.shakeFired = true;
      this.scene?.cameras?.main?.shake(
        TRANSITION_SHAKE_DURATION,
        TRANSITION_SHAKE_INTENSITY,
        true, // force — allow overlapping with other shakes
      );
    }

    // Compute overlay alpha: ramp up to midpoint, then ramp down
    let alpha: number;
    if (progress < TRANSITION_MIDPOINT) {
      // Fade in: 0 → peak
      alpha = (progress / TRANSITION_MIDPOINT) * TRANSITION_PEAK_ALPHA;
    } else {
      // Fade out: peak → 0
      const fadeOutProgress =
        (progress - TRANSITION_MIDPOINT) / (1 - TRANSITION_MIDPOINT);
      alpha = (1 - fadeOutProgress) * TRANSITION_PEAK_ALPHA;
    }

    this.overlay.setAlpha(alpha);

    // Transition complete
    if (progress >= 1) {
      this.finish();
    }
  }

  /**
   * Immediately complete a running transition, firing the swap
   * callback if it hasn't fired yet and hiding the overlay.
   */
  finishImmediate(): void {
    if (!this.active) return;

    if (!this.swapFired) {
      this.swapFired = true;
      this.swapCallback?.();
    }

    this.finish();
  }

  /**
   * Clean up resources. Call this when the scene shuts down.
   */
  destroy(): void {
    this.active = false;
    this.swapCallback = null;
    if (this.overlay) {
      this.overlay.destroy();
      this.overlay = null;
    }
    this.scene = null;
  }

  // ── Private helpers ─────────────────────────────────────────

  /** End the current transition and hide the overlay. */
  private finish(): void {
    this.active = false;
    this.swapCallback = null;
    if (this.overlay) {
      this.overlay.setAlpha(0);
      this.overlay.setVisible(false);
    }
  }

  /** Create or update the overlay Graphics object. */
  private ensureOverlay(): void {
    if (!this.scene) return;

    if (!this.overlay || !this.overlay.scene) {
      this.overlay = this.scene.add.graphics();
      this.overlay.setDepth(OVERLAY_DEPTH);
    }

    // Redraw with the current overlay colour
    this.overlay.clear();
    this.overlay.fillStyle(this.overlayColor, 1);
    this.overlay.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
  }
}
