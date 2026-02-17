import Phaser from "phaser";
import { TEXTURE_KEYS, ARENA_WIDTH, ARENA_HEIGHT } from "../config";

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

// ── Emergency teleport flash configuration ─────────────────────

/** Duration of the emergency teleport flash overlay in ms. */
export const EMERGENCY_FLASH_DURATION_MS = 200;

/** Render depth for the emergency flash overlay (above everything). */
export const EMERGENCY_FLASH_DEPTH = 100;

/** Peak alpha of the white flash overlay. */
export const EMERGENCY_FLASH_ALPHA = 0.7;

/** Duration of collision immunity after emergency teleport in ms. */
export const EMERGENCY_COLLISION_IMMUNITY_MS = 500;

// ── Emergency teleport flash VFX ───────────────────────────────

/**
 * Trigger a brief white flash overlay and camera shake for emergency teleport.
 *
 * Creates a full-screen white rectangle that fades out over
 * EMERGENCY_FLASH_DURATION_MS. Also triggers a camera shake for impact.
 * The overlay self-destructs after the animation completes.
 */
export function emitEmergencyTeleportFlash(
  scene: Phaser.Scene,
): Phaser.GameObjects.Graphics | null {
  const addFactory = scene.add as unknown as {
    graphics?: () => Phaser.GameObjects.Graphics;
  };
  if (typeof addFactory.graphics !== "function") return null;

  const gfx = addFactory.graphics();
  gfx.setDepth?.(EMERGENCY_FLASH_DEPTH);
  gfx.fillStyle?.(0xffffff, EMERGENCY_FLASH_ALPHA);
  gfx.fillRect?.(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

  // Camera shake for impact feel
  scene.cameras.main?.shake(SHAKE_DURATION, SHAKE_INTENSITY * 1.5, true);

  // Fade out the overlay using a tween if available, otherwise use a timer
  const tweenFactory = scene.tweens as unknown as {
    add?: (config: Record<string, unknown>) => unknown;
  };

  if (typeof tweenFactory?.add === "function") {
    tweenFactory.add({
      targets: gfx,
      alpha: 0,
      duration: EMERGENCY_FLASH_DURATION_MS,
      onComplete: () => {
        gfx.destroy?.();
      },
    });
  } else {
    // Fallback: destroy after duration using delayed call
    scene.time?.delayedCall?.(EMERGENCY_FLASH_DURATION_MS, () => {
      gfx.destroy?.();
    });
  }

  return gfx;
}
