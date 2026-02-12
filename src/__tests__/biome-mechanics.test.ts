import { describe, it, expect } from "vitest";
import {
  DEFAULT_BIOME_MECHANICS_CONFIG,
  cloneBiomeMechanicsConfig,
  mergeBiomeMechanicsConfig,
  sampleBiomeRandom,
} from "@/game/systems/biomeMechanics";

describe("shared biome mechanics config", () => {
  it("exposes the default balancing constants for Ice, Molten, and Void", () => {
    expect(DEFAULT_BIOME_MECHANICS_CONFIG).toEqual({
      iceCavern: { turnMomentumTiles: 2 },
      moltenCore: {
        spawnIntervalMs: 1_500,
        spawnChancePerInterval: 0.35,
        maxPools: 10,
        burnTailSegments: 3,
      },
      voidRift: { gravityPullCadenceSteps: 3 },
    });
  });

  it("merges config patches with clamping and keeps the source object immutable", () => {
    const base = cloneBiomeMechanicsConfig(DEFAULT_BIOME_MECHANICS_CONFIG);
    const merged = mergeBiomeMechanicsConfig(base, {
      iceCavern: { turnMomentumTiles: -3 },
      moltenCore: {
        spawnIntervalMs: Number.NaN,
        spawnChancePerInterval: 4,
        maxPools: -8,
        burnTailSegments: 0,
      },
      voidRift: { gravityPullCadenceSteps: 0 },
    });

    expect(merged).toEqual({
      iceCavern: { turnMomentumTiles: 0 },
      moltenCore: {
        spawnIntervalMs: 1_500,
        spawnChancePerInterval: 1,
        maxPools: 0,
        burnTailSegments: 1,
      },
      voidRift: { gravityPullCadenceSteps: 1 },
    });
    expect(base).toEqual(DEFAULT_BIOME_MECHANICS_CONFIG);
  });
});

describe("biome random hook sampling", () => {
  it("clamps invalid RNG outputs to the [0,1) range", () => {
    expect(sampleBiomeRandom(() => Number.NaN)).toBe(0);
    expect(sampleBiomeRandom(() => Number.NEGATIVE_INFINITY)).toBe(0);
    expect(sampleBiomeRandom(() => -1)).toBe(0);
    expect(sampleBiomeRandom(() => 0.42)).toBe(0.42);

    const clampedUpper = sampleBiomeRandom(() => 2);
    expect(clampedUpper).toBeGreaterThanOrEqual(0);
    expect(clampedUpper).toBeLessThan(1);
  });
});
