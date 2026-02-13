// ── Biome definitions ───────────────────────────────────────────

/** Arena biome IDs used across gameplay, HUD, and stats. */
export enum Biome {
  NeonCity = "neon-city",
  IceCavern = "ice-cavern",
  MoltenCore = "molten-core",
  VoidRift = "void-rift",
}

/** Fixed duration of each biome before rotating to the next one. */
export const BIOME_ROTATION_INTERVAL_MS = 45_000;

/** Deterministic biome cycle order for every run. */
export const BIOME_CYCLE_ORDER: readonly Biome[] = [
  Biome.NeonCity,
  Biome.IceCavern,
  Biome.MoltenCore,
  Biome.VoidRift,
] as const;

export interface BiomeConfig {
  id: Biome;
  label: string;
  icon: string;
}

/** Static per-biome display metadata. */
export const BIOME_CONFIG: Record<Biome, BiomeConfig> = {
  [Biome.NeonCity]: {
    id: Biome.NeonCity,
    label: "Neon City",
    icon: "city",
  },
  [Biome.IceCavern]: {
    id: Biome.IceCavern,
    label: "Ice Cavern",
    icon: "snowflake",
  },
  [Biome.MoltenCore]: {
    id: Biome.MoltenCore,
    label: "Molten Core",
    icon: "flame",
  },
  [Biome.VoidRift]: {
    id: Biome.VoidRift,
    label: "Void Rift",
    icon: "vortex",
  },
};

export interface BiomeTransition {
  from: Biome;
  to: Biome;
}

export interface BiomeVisitStats {
  [Biome.NeonCity]: number;
  [Biome.IceCavern]: number;
  [Biome.MoltenCore]: number;
  [Biome.VoidRift]: number;
}

function createEmptyVisitStats(): BiomeVisitStats {
  return {
    [Biome.NeonCity]: 0,
    [Biome.IceCavern]: 0,
    [Biome.MoltenCore]: 0,
    [Biome.VoidRift]: 0,
  };
}

/**
 * Owns per-run biome timing and deterministic biome rotation.
 *
 * Lifecycle expectations:
 * - Call `startRun()` at the beginning of each game run.
 * - Call `update(deltaMs)` while the run is active.
 * - Call `stopRun()` when gameplay pauses/ends.
 * - Call `startRun()` again for a clean restart (it always resets state).
 */
export class BiomeManager {
  private running = false;
  private cycleIndex = 0;
  private elapsedInBiomeMs = 0;
  private visitStats: BiomeVisitStats = createEmptyVisitStats();

  constructor(
    private readonly intervalMs: number = BIOME_ROTATION_INTERVAL_MS,
  ) {
    this.resetRun();
  }

  /** Start a fresh run from Neon City with a clean timer/stats state. */
  startRun(): void {
    this.resetRun();
    this.running = true;
  }

  /** Stop biome progression without mutating current biome/timer/stats. */
  stopRun(): void {
    this.running = false;
  }

  /**
   * Reset to initial run state.
   * Neon City counts as visited once at run start.
   */
  resetRun(): void {
    this.running = false;
    this.cycleIndex = 0;
    this.elapsedInBiomeMs = 0;
    this.visitStats = createEmptyVisitStats();
    this.visitStats[this.getCurrentBiome()] = 1;
  }

  /**
   * Advance the biome timer. Emits one transition record per biome shift.
   * Large deltas are handled deterministically by applying all due shifts.
   */
  update(deltaMs: number): BiomeTransition[] {
    if (!this.running || deltaMs <= 0) {
      return [];
    }

    this.elapsedInBiomeMs += deltaMs;

    const transitions: BiomeTransition[] = [];

    while (this.elapsedInBiomeMs >= this.intervalMs) {
      this.elapsedInBiomeMs -= this.intervalMs;
      transitions.push(this.advanceBiome());
    }

    return transitions;
  }

  /** Current biome for the run. */
  getCurrentBiome(): Biome {
    return BIOME_CYCLE_ORDER[this.cycleIndex];
  }

  /** Milliseconds elapsed in the active biome. */
  getElapsedInBiomeMs(): number {
    return this.elapsedInBiomeMs;
  }

  /** Milliseconds remaining until the next biome transition. */
  getMsUntilNextBiome(): number {
    return this.intervalMs - this.elapsedInBiomeMs;
  }

  /** Whether the manager is currently progressing the timer. */
  isRunning(): boolean {
    return this.running;
  }

  /** Copy of per-biome visit counts for the current run. */
  getVisitStats(): BiomeVisitStats {
    return { ...this.visitStats };
  }

  private advanceBiome(): BiomeTransition {
    const from = this.getCurrentBiome();
    this.cycleIndex = (this.cycleIndex + 1) % BIOME_CYCLE_ORDER.length;
    const to = this.getCurrentBiome();
    this.visitStats[to] += 1;

    return { from, to };
  }
}
