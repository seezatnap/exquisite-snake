import Phaser from "phaser";
import { TEXTURE_KEYS } from "../config";

// ── Particle burst configuration ────────────────────────────────

/** Number of particles emitted per food pickup burst. */
export const PARTICLE_COUNT = 12;

/** Minimum speed of a burst particle (px/s). */
export const PARTICLE_SPEED_MIN = 60;

/** Maximum speed of a burst particle (px/s). */
export const PARTICLE_SPEED_MAX = 180;

/** Particle lifespan in ms. */
export const PARTICLE_LIFESPAN = 350;

// ── Screen-shake configuration ──────────────────────────────────

/** Duration of the screen-shake in ms — short to stay readable. */
export const SHAKE_DURATION = 150;

/**
 * Shake intensity (fraction of the camera viewport dimension).
 * 0.008 ≈ ±3–4 px on an 800×600 canvas — subtle but noticeable.
 */
export const SHAKE_INTENSITY = 0.008;

// ── Effect functions ────────────────────────────────────────────

/**
 * Emit a radial particle burst at the given world position.
 *
 * Uses the pre-generated "particle" texture from Boot.ts.
 * Particles fly outward, fade, and self-destruct — no manual cleanup needed.
 */
export function emitFoodParticles(
  scene: Phaser.Scene,
  x: number,
  y: number,
): Phaser.GameObjects.Particles.ParticleEmitter | null {
  // Guard against missing texture (e.g. in tests without Boot)
  if (!scene.textures.exists(TEXTURE_KEYS.PARTICLE)) return null;

  const emitter = scene.add.particles(x, y, TEXTURE_KEYS.PARTICLE, {
    speed: { min: PARTICLE_SPEED_MIN, max: PARTICLE_SPEED_MAX },
    angle: { min: 0, max: 360 },
    lifespan: PARTICLE_LIFESPAN,
    quantity: PARTICLE_COUNT,
    scale: { start: 1, end: 0 },
    alpha: { start: 1, end: 0 },
    emitting: false,
  });

  emitter.explode(PARTICLE_COUNT, 0, 0);

  // Destroy the emitter after particles expire to avoid leaks
  scene.time.delayedCall(PARTICLE_LIFESPAN + 50, () => {
    emitter.destroy();
  });

  return emitter;
}

/** Number of particles emitted per ghost-food burst. */
export const GHOST_FOOD_PARTICLE_COUNT = 8;

/** Ghost-food particle lifespan in ms (slightly longer than regular). */
export const GHOST_FOOD_PARTICLE_LIFESPAN = 400;

/** Ghost-food particle opacity — translucent to match ghost aesthetics. */
export const GHOST_FOOD_PARTICLE_ALPHA = 0.4;

/**
 * Emit a cosmetic ghost-food particle burst at the given world position.
 *
 * Visually similar to `emitFoodParticles` but more subdued: fewer
 * particles, lower opacity, slightly longer lifespan. This burst is
 * purely cosmetic — it has no impact on score or game state.
 */
export function emitGhostFoodParticles(
  scene: Phaser.Scene,
  x: number,
  y: number,
): Phaser.GameObjects.Particles.ParticleEmitter | null {
  if (!scene.textures.exists(TEXTURE_KEYS.PARTICLE)) return null;

  const emitter = scene.add.particles(x, y, TEXTURE_KEYS.PARTICLE, {
    speed: { min: PARTICLE_SPEED_MIN, max: PARTICLE_SPEED_MAX },
    angle: { min: 0, max: 360 },
    lifespan: GHOST_FOOD_PARTICLE_LIFESPAN,
    quantity: GHOST_FOOD_PARTICLE_COUNT,
    scale: { start: 1, end: 0 },
    alpha: { start: GHOST_FOOD_PARTICLE_ALPHA, end: 0 },
    emitting: false,
  });

  emitter.explode(GHOST_FOOD_PARTICLE_COUNT, 0, 0);

  scene.time.delayedCall(GHOST_FOOD_PARTICLE_LIFESPAN + 50, () => {
    emitter.destroy();
  });

  return emitter;
}

/**
 * Trigger a brief, subtle camera shake.
 *
 * Tuned to remain readable and non-disorienting:
 * - 150 ms duration (quick jolt)
 * - 0.8% intensity (~3–4 px displacement on 800×600)
 *
 * If a shake is already in progress, this is a no-op (Phaser ignores
 * overlapping shakes by default unless `force` is set).
 */
export function shakeCamera(scene: Phaser.Scene): void {
  scene.cameras.main?.shake(SHAKE_DURATION, SHAKE_INTENSITY);
}
