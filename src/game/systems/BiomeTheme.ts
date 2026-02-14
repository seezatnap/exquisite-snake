// ── Biome Definitions ───────────────────────────────────────────

/** The four biomes in deterministic cycle order. */
export enum Biome {
  NeonCity = "NeonCity",
  IceCavern = "IceCavern",
  MoltenCore = "MoltenCore",
  VoidRift = "VoidRift",
}

/** Ordered cycle — the canonical rotation sequence. */
export const BIOME_CYCLE: readonly Biome[] = [
  Biome.NeonCity,
  Biome.IceCavern,
  Biome.MoltenCore,
  Biome.VoidRift,
] as const;

/** Duration each biome lasts before transitioning (ms). */
export const BIOME_DURATION_MS = 45_000;

// ── Per-biome visual theme definitions ─────────────────────────

/**
 * Visual palette for a single biome.
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

// ── Color interpolation ────────────────────────────────────────

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

// ── BiomeColorProvider ─────────────────────────────────────────

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

// ── BiomeManager ───────────────────────────────────────────────

/** Duration of the color crossfade when biomes change (ms). */
export const BIOME_TRANSITION_DURATION_MS = 600;

/** Listener callback for biome changes. */
export type BiomeChangeListener = (
  newBiome: Biome,
  previousBiome: Biome | null,
) => void;

/**
 * Manages timed biome rotation and provides smoothly-interpolated
 * ghost colors via the BiomeColorProvider interface.
 *
 * - Timer-based cycling every 45 seconds.
 * - Deterministic order: Neon City → Ice Cavern → Molten Core → Void Rift → repeat.
 * - Smooth color crossfade over 600ms when biomes change.
 */
export class BiomeManager implements BiomeColorProvider {
  private currentIndex = 0;
  private elapsedMs = 0;
  private running = false;

  /** Transition state for smooth color crossfade. */
  private transitionProgress = 1; // 1 = fully settled, <1 = transitioning
  private previousBiome: Biome | null = null;
  private listeners: Set<BiomeChangeListener> = new Set();

  /** The currently active biome. */
  getCurrentBiome(): Biome {
    return BIOME_CYCLE[this.currentIndex];
  }

  /** Whether the manager is actively running. */
  isRunning(): boolean {
    return this.running;
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
  onChange(listener: BiomeChangeListener): void {
    this.listeners.add(listener);
  }

  /** Unsubscribe from biome-change events. */
  offChange(listener: BiomeChangeListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Start a new run. Resets state and begins from the first biome.
   */
  start(): void {
    if (this.running) return;
    this.resetInternal();
    this.running = true;
  }

  /**
   * Advance the biome timer by `deltaMs` milliseconds.
   * Call this every frame from the game loop.
   *
   * Returns the current biome after the update.
   */
  update(deltaMs: number): Biome {
    if (!this.running) return this.getCurrentBiome();

    this.elapsedMs += deltaMs;

    // Advance transition crossfade
    if (this.transitionProgress < 1) {
      this.transitionProgress = Math.min(
        1,
        this.transitionProgress + deltaMs / BIOME_TRANSITION_DURATION_MS,
      );
    }

    while (this.elapsedMs >= BIOME_DURATION_MS) {
      this.elapsedMs -= BIOME_DURATION_MS;
      this.previousBiome = this.getCurrentBiome();
      this.currentIndex = (this.currentIndex + 1) % BIOME_CYCLE.length;
      this.transitionProgress = 0;
      this.emitChange(this.getCurrentBiome(), this.previousBiome);
    }

    return this.getCurrentBiome();
  }

  /**
   * Stop the timer and reset all state for a fresh run.
   */
  reset(): void {
    this.running = false;
    this.resetInternal();
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

  // ── Private helpers ────────────────────────────────────────────

  private resetInternal(): void {
    this.currentIndex = 0;
    this.elapsedMs = 0;
    this.transitionProgress = 1;
    this.previousBiome = null;
  }

  private emitChange(newBiome: Biome, previousBiome: Biome | null): void {
    this.listeners.forEach((fn) => fn(newBiome, previousBiome));
  }
}
