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

const BIOME_ID_SET = new Set<Biome>(Object.values(Biome));

function isValidCycleOrder(order: readonly Biome[]): boolean {
  if (order.length !== BIOME_CYCLE_ORDER.length) {
    return false;
  }
  const unique = new Set(order);
  if (unique.size !== BIOME_CYCLE_ORDER.length) {
    return false;
  }
  for (const biome of order) {
    if (!BIOME_ID_SET.has(biome)) {
      return false;
    }
  }
  return true;
}

export function normalizeBiomeCycleOrder(
  order: readonly Biome[] | null | undefined,
): readonly Biome[] {
  if (!order || !isValidCycleOrder(order)) {
    return [...BIOME_CYCLE_ORDER];
  }
  return [...order];
}

export function parseBiomeCycleOrder(
  rawOrder: string | null | undefined,
): readonly Biome[] | null {
  if (typeof rawOrder !== "string" || rawOrder.trim().length === 0) {
    return null;
  }

  const tokens = rawOrder
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
  if (tokens.length !== BIOME_CYCLE_ORDER.length) {
    return null;
  }

  const parsedOrder: Biome[] = [];
  for (const token of tokens) {
    if (!BIOME_ID_SET.has(token as Biome)) {
      return null;
    }
    parsedOrder.push(token as Biome);
  }

  if (!isValidCycleOrder(parsedOrder)) {
    return null;
  }

  return parsedOrder;
}

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
  private cycleOrder: readonly Biome[];

  constructor(
    private readonly intervalMs: number = BIOME_ROTATION_INTERVAL_MS,
    cycleOrder: readonly Biome[] = BIOME_CYCLE_ORDER,
  ) {
    this.cycleOrder = normalizeBiomeCycleOrder(cycleOrder);
    this.resetRun();
  }

  /** Start a fresh run from the first configured biome with clean timer/stats. */
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
   * The first configured biome counts as visited once at run start.
   */
  resetRun(): void {
    this.running = false;
    this.cycleIndex = 0;
    this.elapsedInBiomeMs = 0;
    this.visitStats = createEmptyVisitStats();
    this.visitStats[this.getCurrentBiome()] = 1;
  }

  /**
   * Configure biome cycle order for subsequent runs and reset run state.
   * Invalid orders are ignored in favor of the canonical default order.
   */
  setCycleOrder(order: readonly Biome[]): void {
    this.cycleOrder = normalizeBiomeCycleOrder(order);
    this.resetRun();
  }

  /** Current active cycle order used by this manager instance. */
  getCycleOrder(): readonly Biome[] {
    return [...this.cycleOrder];
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
    return this.cycleOrder[this.cycleIndex];
  }

  /** Next biome in the active cycle order (wrapping at the end). */
  getNextBiome(): Biome {
    const nextIndex = (this.cycleIndex + 1) % this.cycleOrder.length;
    return this.cycleOrder[nextIndex];
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
    this.cycleIndex = (this.cycleIndex + 1) % this.cycleOrder.length;
    const to = this.getCurrentBiome();
    this.visitStats[to] += 1;

    return { from, to };
  }
}
