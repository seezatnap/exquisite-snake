export interface IceCavernConfig {
  /** Extra tiles the snake slides before a queued turn applies. */
  turnMomentumTiles: number;
}

export interface MoltenLavaConfig {
  /** Milliseconds between spawn attempts while Molten Core is active. */
  spawnIntervalMs: number;
  /** Probability [0,1] that a spawn attempt succeeds. */
  spawnChancePerInterval: number;
  /** Hard cap on concurrent lava pools in the arena. */
  maxPools: number;
  /** Tail segments removed when the snake touches lava. */
  burnTailSegments: number;
}

export interface VoidRiftConfig {
  /** Number of snake steps between gravity pulls toward arena center. */
  gravityPullCadenceSteps: number;
}

export interface BiomeMechanicsConfig {
  iceCavern: IceCavernConfig;
  moltenCore: MoltenLavaConfig;
  voidRift: VoidRiftConfig;
}

export interface BiomeMechanicsConfigPatch {
  iceCavern?: Partial<IceCavernConfig>;
  moltenCore?: Partial<MoltenLavaConfig>;
  voidRift?: Partial<VoidRiftConfig>;
}

export type BiomeRandomFn = () => number;

export const DEFAULT_ICE_CAVERN_CONFIG: IceCavernConfig = {
  turnMomentumTiles: 2,
};

export const DEFAULT_MOLTEN_CORE_CONFIG: MoltenLavaConfig = {
  spawnIntervalMs: 1_500,
  spawnChancePerInterval: 0.35,
  maxPools: 10,
  burnTailSegments: 3,
};

export const DEFAULT_VOID_RIFT_CONFIG: VoidRiftConfig = {
  gravityPullCadenceSteps: 3,
};

export const DEFAULT_BIOME_MECHANICS_CONFIG: BiomeMechanicsConfig = {
  iceCavern: { ...DEFAULT_ICE_CAVERN_CONFIG },
  moltenCore: { ...DEFAULT_MOLTEN_CORE_CONFIG },
  voidRift: { ...DEFAULT_VOID_RIFT_CONFIG },
};

/** Largest representable decimal strictly below 1 for `[0, 1)` clamping. */
const RANDOM_MAX_EXCLUSIVE = 0.9999999999999999;

function toFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function sanitizeInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number = Number.POSITIVE_INFINITY,
): number {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function sanitizeProbability(value: unknown, fallback: number): number {
  const numeric = toFiniteNumber(value);
  if (numeric === null) {
    return fallback;
  }
  return Math.max(0, Math.min(1, numeric));
}

export function cloneBiomeMechanicsConfig(
  config: BiomeMechanicsConfig,
): BiomeMechanicsConfig {
  return {
    iceCavern: { ...config.iceCavern },
    moltenCore: { ...config.moltenCore },
    voidRift: { ...config.voidRift },
  };
}

export function mergeBiomeMechanicsConfig(
  current: BiomeMechanicsConfig,
  patch: BiomeMechanicsConfigPatch,
): BiomeMechanicsConfig {
  const nextIce = {
    turnMomentumTiles: sanitizeInteger(
      patch.iceCavern?.turnMomentumTiles,
      current.iceCavern.turnMomentumTiles,
      0,
    ),
  };

  const nextMolten = {
    spawnIntervalMs: sanitizeInteger(
      patch.moltenCore?.spawnIntervalMs,
      current.moltenCore.spawnIntervalMs,
      1,
    ),
    spawnChancePerInterval: sanitizeProbability(
      patch.moltenCore?.spawnChancePerInterval,
      current.moltenCore.spawnChancePerInterval,
    ),
    maxPools: sanitizeInteger(
      patch.moltenCore?.maxPools,
      current.moltenCore.maxPools,
      0,
    ),
    burnTailSegments: sanitizeInteger(
      patch.moltenCore?.burnTailSegments,
      current.moltenCore.burnTailSegments,
      1,
    ),
  };

  const nextVoid = {
    gravityPullCadenceSteps: sanitizeInteger(
      patch.voidRift?.gravityPullCadenceSteps,
      current.voidRift.gravityPullCadenceSteps,
      1,
    ),
  };

  return {
    iceCavern: nextIce,
    moltenCore: nextMolten,
    voidRift: nextVoid,
  };
}

export function normalizeRandomHook(
  rng: BiomeRandomFn | null | undefined,
  fallback: BiomeRandomFn = Math.random,
): BiomeRandomFn {
  return typeof rng === "function" ? rng : fallback;
}

export function sampleBiomeRandom(rng: BiomeRandomFn): number {
  const sample = toFiniteNumber(rng());
  if (sample === null) {
    return 0;
  }
  if (sample <= 0) {
    return 0;
  }
  if (sample >= 1) {
    return RANDOM_MAX_EXCLUSIVE;
  }
  return sample;
}
