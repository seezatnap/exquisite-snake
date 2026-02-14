/**
 * BiomeManager — tracks the current biome and provides tint colors
 * for biome-aware rendering (ghost trail, particles, etc.).
 *
 * Biomes cycle based on elapsed game time, shifting every
 * `BIOME_SHIFT_INTERVAL_MS` milliseconds. When the biome changes,
 * color transitions are smoothly interpolated over
 * `BIOME_TRANSITION_MS` milliseconds.
 */

// ── Biome Definitions ──────────────────────────────────────────

/** Identifier for each biome zone. */
export type BiomeType = "neon" | "toxic" | "void" | "ember";

/** Visual configuration for a single biome. */
export interface BiomeConfig {
  /** Display name for the biome. */
  name: string;
  /** Ghost body/trail tint color (Phaser integer). */
  ghostTint: number;
  /** Ghost trailing particle tint color (Phaser integer). */
  particleTint: number;
}

/** All biome definitions, keyed by type. */
export const BIOME_CONFIGS: Record<BiomeType, BiomeConfig> = {
  neon: {
    name: "Neon",
    ghostTint: 0x00f0ff,    // cyan (default)
    particleTint: 0x00f0ff,
  },
  toxic: {
    name: "Toxic",
    ghostTint: 0x39ff14,    // neon green
    particleTint: 0x39ff14,
  },
  void: {
    name: "Void",
    ghostTint: 0xb026ff,    // neon purple
    particleTint: 0xb026ff,
  },
  ember: {
    name: "Ember",
    ghostTint: 0xff6600,    // neon orange
    particleTint: 0xff6600,
  },
} as const;

/** Ordered list of biomes for cycling. */
export const BIOME_ORDER: readonly BiomeType[] = [
  "neon",
  "toxic",
  "void",
  "ember",
];

/** How long each biome lasts before shifting (ms). */
export const BIOME_SHIFT_INTERVAL_MS = 30_000;

/** Smooth transition duration when biome changes (ms). */
export const BIOME_TRANSITION_MS = 1_500;

// ── Color Interpolation ────────────────────────────────────────

/** Extract RGB components from a 0xRRGGBB integer. */
export function colorToRGB(color: number): { r: number; g: number; b: number } {
  return {
    r: (color >> 16) & 0xff,
    g: (color >> 8) & 0xff,
    b: color & 0xff,
  };
}

/** Pack RGB components into a 0xRRGGBB integer. */
export function rgbToColor(r: number, g: number, b: number): number {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

/**
 * Linearly interpolate between two packed colors.
 * `t` is clamped to [0, 1].
 */
export function lerpColor(from: number, to: number, t: number): number {
  const ct = Math.max(0, Math.min(1, t));
  const a = colorToRGB(from);
  const b = colorToRGB(to);
  return rgbToColor(
    Math.round(a.r + (b.r - a.r) * ct),
    Math.round(a.g + (b.g - a.g) * ct),
    Math.round(a.b + (b.b - a.b) * ct),
  );
}

// ── BiomeManager ──────────────────────────────────────────────

export class BiomeManager {
  private currentIndex = 0;
  private elapsedInBiome = 0;
  private transitionElapsed = 0;
  private transitioning = false;
  private previousIndex = 0;

  /** Update the biome state based on elapsed delta (ms). */
  update(deltaMs: number): void {
    this.elapsedInBiome += deltaMs;

    if (this.transitioning) {
      this.transitionElapsed += deltaMs;
      if (this.transitionElapsed >= BIOME_TRANSITION_MS) {
        this.transitioning = false;
        this.transitionElapsed = 0;
      }
    }

    if (this.elapsedInBiome >= BIOME_SHIFT_INTERVAL_MS) {
      this.elapsedInBiome -= BIOME_SHIFT_INTERVAL_MS;
      this.previousIndex = this.currentIndex;
      this.currentIndex = (this.currentIndex + 1) % BIOME_ORDER.length;
      this.transitioning = true;
      this.transitionElapsed = 0;
    }
  }

  /** Current biome type (target biome during transitions). */
  getCurrentBiome(): BiomeType {
    return BIOME_ORDER[this.currentIndex];
  }

  /** Whether a biome transition is currently in progress. */
  isTransitioning(): boolean {
    return this.transitioning;
  }

  /** Transition progress from 0 (start) to 1 (complete). */
  getTransitionProgress(): number {
    if (!this.transitioning) return 1;
    return Math.min(1, this.transitionElapsed / BIOME_TRANSITION_MS);
  }

  /**
   * Get the effective ghost body tint color, interpolating during
   * biome transitions for a smooth visual handoff.
   */
  getGhostTint(): number {
    const currentConfig = BIOME_CONFIGS[BIOME_ORDER[this.currentIndex]];

    if (!this.transitioning) {
      return currentConfig.ghostTint;
    }

    const previousConfig = BIOME_CONFIGS[BIOME_ORDER[this.previousIndex]];
    return lerpColor(
      previousConfig.ghostTint,
      currentConfig.ghostTint,
      this.getTransitionProgress(),
    );
  }

  /**
   * Get the effective ghost particle tint color, interpolating during
   * biome transitions.
   */
  getParticleTint(): number {
    const currentConfig = BIOME_CONFIGS[BIOME_ORDER[this.currentIndex]];

    if (!this.transitioning) {
      return currentConfig.particleTint;
    }

    const previousConfig = BIOME_CONFIGS[BIOME_ORDER[this.previousIndex]];
    return lerpColor(
      previousConfig.particleTint,
      currentConfig.particleTint,
      this.getTransitionProgress(),
    );
  }

  /** Reset biome state (for new game runs). */
  reset(): void {
    this.currentIndex = 0;
    this.elapsedInBiome = 0;
    this.transitionElapsed = 0;
    this.transitioning = false;
    this.previousIndex = 0;
  }
}
