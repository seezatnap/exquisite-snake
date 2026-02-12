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

// ── Per-biome visual / mechanic configuration ───────────────────

export interface BiomeConfig {
  readonly name: string;
  readonly description: string;
}

export const BIOME_CONFIGS: Readonly<Record<Biome, BiomeConfig>> = {
  [Biome.NeonCity]: {
    name: "Neon City",
    description: "Default — no modifier",
  },
  [Biome.IceCavern]: {
    name: "Ice Cavern",
    description: "Snake slides 2 extra tiles before stopping when turning",
  },
  [Biome.MoltenCore]: {
    name: "Molten Core",
    description: "Random lava pools spawn; touching one burns off 3 tail segments",
  },
  [Biome.VoidRift]: {
    name: "Void Rift",
    description: "Gravity wells pull the snake toward the center of the arena",
  },
} as const;

// ── Biome-visit stats ───────────────────────────────────────────

export interface BiomeVisitStats {
  /** Number of times each biome was entered during the run. */
  readonly visits: Readonly<Record<Biome, number>>;
  /** Set of unique biomes visited during the run. */
  readonly uniqueCount: number;
}

// ── Event types ─────────────────────────────────────────────────

export type BiomeChangeListener = (
  newBiome: Biome,
  previousBiome: Biome | null,
) => void;

// ── BiomeManager ────────────────────────────────────────────────

/**
 * Manages timed biome rotation for a single game run.
 *
 * - Timer-based cycling every 45 seconds.
 * - Deterministic order: Neon City → Ice Cavern → Molten Core → Void Rift → repeat.
 * - Tracks per-run biome-visit stats for the Game Over screen.
 * - Clean start/reset behaviour: call `start()` to begin, `reset()` between runs.
 */
export class BiomeManager {
  private currentIndex = 0;
  private elapsedMs = 0;
  private running = false;
  private visits: Record<Biome, number> = {
    [Biome.NeonCity]: 0,
    [Biome.IceCavern]: 0,
    [Biome.MoltenCore]: 0,
    [Biome.VoidRift]: 0,
  };
  private listeners: Set<BiomeChangeListener> = new Set();

  /** The currently active biome. */
  getCurrentBiome(): Biome {
    return BIOME_CYCLE[this.currentIndex];
  }

  /** How many ms remain before the next biome transition. */
  getTimeRemaining(): number {
    return Math.max(0, BIOME_DURATION_MS - this.elapsedMs);
  }

  /** Whether the manager is actively running. */
  isRunning(): boolean {
    return this.running;
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
   * Start a new run. Resets state and marks the first biome as visited.
   * Does nothing if already running — call `reset()` first.
   */
  start(): void {
    if (this.running) return;
    this.resetInternal();
    this.running = true;
    this.visits[this.getCurrentBiome()] = 1;
  }

  /**
   * Advance the biome timer by `deltaMs` milliseconds.
   * Call this every frame from the game loop while the game is playing.
   *
   * Returns the current biome after the update.
   */
  update(deltaMs: number): Biome {
    if (!this.running) return this.getCurrentBiome();

    this.elapsedMs += deltaMs;

    while (this.elapsedMs >= BIOME_DURATION_MS) {
      this.elapsedMs -= BIOME_DURATION_MS;
      const previousBiome = this.getCurrentBiome();
      this.currentIndex = (this.currentIndex + 1) % BIOME_CYCLE.length;
      const newBiome = this.getCurrentBiome();
      this.visits[newBiome] += 1;
      this.emitChange(newBiome, previousBiome);
    }

    return this.getCurrentBiome();
  }

  /**
   * Snapshot of biome-visit stats for the current (or last) run.
   */
  getVisitStats(): BiomeVisitStats {
    const visits = { ...this.visits } as Readonly<Record<Biome, number>>;
    const uniqueCount = Object.values(this.visits).filter((v) => v > 0).length;
    return { visits, uniqueCount };
  }

  /**
   * Stop the timer and reset all state for a fresh run.
   */
  reset(): void {
    this.running = false;
    this.resetInternal();
  }

  // ── Private helpers ─────────────────────────────────────────

  private resetInternal(): void {
    this.currentIndex = 0;
    this.elapsedMs = 0;
    this.visits = {
      [Biome.NeonCity]: 0,
      [Biome.IceCavern]: 0,
      [Biome.MoltenCore]: 0,
      [Biome.VoidRift]: 0,
    };
  }

  private emitChange(
    newBiome: Biome,
    previousBiome: Biome | null,
  ): void {
    this.listeners.forEach((fn) => fn(newBiome, previousBiome));
  }
}
