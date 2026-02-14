// ── Re-export Phase 2 biome definitions ────────────────────────
//
// The canonical Biome enum, cycle, duration, and BiomeManager live
// in BiomeManager.ts (Phase 2). Phase 3 re-exports them so that
// downstream consumers can continue importing from BiomeTheme.ts.
//

export {
  Biome,
  BIOME_CYCLE,
  BIOME_DURATION_MS,
  BiomeManager,
  type BiomeChangeListener,
  type BiomeConfig,
  BIOME_CONFIGS,
  type BiomeVisitStats,
} from "./BiomeManager";

import { Biome, BiomeManager } from "./BiomeManager";

// ── Per-biome ghost visual palette (Phase 3) ───────────────────

/**
 * Ghost-specific visual palette for a single biome.
 * All colour values are Phaser-compatible 0xRRGGBB integers.
 */
export interface BiomeThemeColors {
  /** Snake body fill (used for ghost fill + outline). */
  readonly snakeBody: number;
  /** Particle burst fill (used for ghost trailing particles). */
  readonly particle: number;
}

/** Lookup table: Biome → BiomeThemeColors. */
export const BIOME_COLORS: Readonly<Record<Biome, BiomeThemeColors>> = {
  [Biome.NeonCity]: {
    snakeBody: 0x00c8d4,
    particle: 0xff2d78,
  },
  [Biome.IceCavern]: {
    snakeBody: 0x4fc3f7,
    particle: 0xb3e5fc,
  },
  [Biome.MoltenCore]: {
    snakeBody: 0xe65100,
    particle: 0xff6600,
  },
  [Biome.VoidRift]: {
    snakeBody: 0xab47bc,
    particle: 0xb026ff,
  },
} as const;

/**
 * Get biome theme colors for a given biome.
 */
export function getBiomeColors(biome: Biome): BiomeThemeColors {
  return BIOME_COLORS[biome];
}

// ── Color interpolation (Phase 3) ──────────────────────────────

/**
 * Linearly interpolate between two 0xRRGGBB color values.
 * @param a    Start color.
 * @param b    End color.
 * @param t    Interpolation factor [0, 1]. 0 = a, 1 = b.
 * @returns    Interpolated 0xRRGGBB color.
 */
export function lerpColor(a: number, b: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * clamped);
  const g = Math.round(ag + (bg - ag) * clamped);
  const blue = Math.round(ab + (bb - ab) * clamped);
  return (r << 16) | (g << 8) | blue;
}

// ── BiomeColorProvider (Phase 3) ───────────────────────────────

/**
 * Interface consumed by GhostRenderer to query current biome colors.
 * Decouples rendering from the biome manager implementation.
 */
export interface BiomeColorProvider {
  /** Get the ghost fill/outline color for the current frame. */
  getGhostBodyColor(): number;
  /** Get the ghost trailing particle tint for the current frame. */
  getGhostParticleColor(): number;
}

// ── Transition crossfade (Phase 3) ─────────────────────────────

/** Duration of the color crossfade when biomes change (ms). */
export const BIOME_TRANSITION_DURATION_MS = 600;

/**
 * Wraps the Phase 2 BiomeManager to add smooth color crossfade
 * transitions for ghost rendering via the BiomeColorProvider interface.
 *
 * Delegates all core biome-cycling behaviour (timer, rotation,
 * visit stats, event listeners) to the underlying BiomeManager.
 *
 * - Smooth color crossfade over 600ms when biomes change.
 */
export class BiomeColorManager implements BiomeColorProvider {
  private manager: BiomeManager;

  /** Transition state for smooth color crossfade. */
  private transitionProgress = 1; // 1 = fully settled, <1 = transitioning
  private previousBiome: Biome | null = null;

  constructor(manager?: BiomeManager) {
    this.manager = manager ?? new BiomeManager();

    // Listen for biome changes to trigger crossfade
    this.manager.onChange((newBiome, prev) => {
      this.previousBiome = prev;
      this.transitionProgress = 0;
    });
  }

  /** Access the underlying BiomeManager. */
  getBiomeManager(): BiomeManager {
    return this.manager;
  }

  /** The currently active biome. */
  getCurrentBiome(): Biome {
    return this.manager.getCurrentBiome();
  }

  /** Whether the manager is actively running. */
  isRunning(): boolean {
    return this.manager.isRunning();
  }

  /** Whether a biome transition crossfade is currently in progress. */
  isTransitioning(): boolean {
    return this.transitionProgress < 1;
  }

  /** Current transition progress [0, 1]. 1 = settled, 0 = just started. */
  getTransitionProgress(): number {
    return this.transitionProgress;
  }

  /** Subscribe to biome-change events. */
  onChange(listener: (newBiome: Biome, previousBiome: Biome | null) => void): void {
    this.manager.onChange(listener);
  }

  /** Unsubscribe from biome-change events. */
  offChange(listener: (newBiome: Biome, previousBiome: Biome | null) => void): void {
    this.manager.offChange(listener);
  }

  /**
   * Start a new run. Resets state and begins from the first biome.
   */
  start(): void {
    this.transitionProgress = 1;
    this.previousBiome = null;
    this.manager.start();
  }

  /**
   * Advance the biome timer by `deltaMs` milliseconds.
   * Call this every frame from the game loop.
   *
   * Returns the current biome after the update.
   */
  update(deltaMs: number): Biome {
    // Advance transition crossfade
    if (this.transitionProgress < 1) {
      this.transitionProgress = Math.min(
        1,
        this.transitionProgress + deltaMs / BIOME_TRANSITION_DURATION_MS,
      );
    }

    return this.manager.update(deltaMs);
  }

  /**
   * Stop the timer and reset all state for a fresh run.
   */
  reset(): void {
    this.transitionProgress = 1;
    this.previousBiome = null;
    this.manager.reset();
  }

  // ── BiomeColorProvider implementation ──────────────────────────

  getGhostBodyColor(): number {
    const current = getBiomeColors(this.getCurrentBiome());
    if (this.transitionProgress >= 1 || !this.previousBiome) {
      return current.snakeBody;
    }
    const prev = getBiomeColors(this.previousBiome);
    return lerpColor(prev.snakeBody, current.snakeBody, this.transitionProgress);
  }

  getGhostParticleColor(): number {
    const current = getBiomeColors(this.getCurrentBiome());
    if (this.transitionProgress >= 1 || !this.previousBiome) {
      return current.particle;
    }
    const prev = getBiomeColors(this.previousBiome);
    return lerpColor(prev.particle, current.particle, this.transitionProgress);
  }
}
