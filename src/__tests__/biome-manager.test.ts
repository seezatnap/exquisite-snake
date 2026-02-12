import { describe, it, expect } from "vitest";
import {
  Biome,
  BIOME_CYCLE_ORDER,
  BIOME_ROTATION_INTERVAL_MS,
  BIOME_CONFIG,
  BiomeManager,
} from "@/game/systems/BiomeManager";

describe("BiomeManager constants", () => {
  it("uses a 45 second rotation interval", () => {
    expect(BIOME_ROTATION_INTERVAL_MS).toBe(45_000);
  });

  it("defines the deterministic biome cycle order", () => {
    expect(BIOME_CYCLE_ORDER).toEqual([
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.MoltenCore,
      Biome.VoidRift,
    ]);
  });

  it("exposes config entries for all biomes", () => {
    expect(BIOME_CONFIG[Biome.NeonCity].label).toBe("Neon City");
    expect(BIOME_CONFIG[Biome.IceCavern].label).toBe("Ice Cavern");
    expect(BIOME_CONFIG[Biome.MoltenCore].label).toBe("Molten Core");
    expect(BIOME_CONFIG[Biome.VoidRift].label).toBe("Void Rift");
  });
});

describe("BiomeManager run lifecycle", () => {
  it("initializes in Neon City with clean timer and visit count", () => {
    const manager = new BiomeManager();

    expect(manager.getCurrentBiome()).toBe(Biome.NeonCity);
    expect(manager.getElapsedInBiomeMs()).toBe(0);
    expect(manager.isRunning()).toBe(false);
    expect(manager.getVisitStats()).toEqual({
      [Biome.NeonCity]: 1,
      [Biome.IceCavern]: 0,
      [Biome.MoltenCore]: 0,
      [Biome.VoidRift]: 0,
    });
  });

  it("does not advance while not running", () => {
    const manager = new BiomeManager();

    const transitions = manager.update(BIOME_ROTATION_INTERVAL_MS * 3);

    expect(transitions).toEqual([]);
    expect(manager.getCurrentBiome()).toBe(Biome.NeonCity);
    expect(manager.getElapsedInBiomeMs()).toBe(0);
  });

  it("transitions at exactly 45 seconds", () => {
    const manager = new BiomeManager();
    manager.startRun();

    expect(manager.update(BIOME_ROTATION_INTERVAL_MS - 1)).toEqual([]);
    expect(manager.getCurrentBiome()).toBe(Biome.NeonCity);

    const transitions = manager.update(1);

    expect(transitions).toEqual([
      { from: Biome.NeonCity, to: Biome.IceCavern },
    ]);
    expect(manager.getCurrentBiome()).toBe(Biome.IceCavern);
    expect(manager.getElapsedInBiomeMs()).toBe(0);
  });

  it("cycles in deterministic order and repeats from Void Rift to Neon City", () => {
    const manager = new BiomeManager();
    manager.startRun();

    manager.update(BIOME_ROTATION_INTERVAL_MS); // Neon -> Ice
    manager.update(BIOME_ROTATION_INTERVAL_MS); // Ice -> Molten
    manager.update(BIOME_ROTATION_INTERVAL_MS); // Molten -> Void

    expect(manager.getCurrentBiome()).toBe(Biome.VoidRift);

    const transitions = manager.update(BIOME_ROTATION_INTERVAL_MS); // Void -> Neon

    expect(transitions).toEqual([
      { from: Biome.VoidRift, to: Biome.NeonCity },
    ]);
    expect(manager.getCurrentBiome()).toBe(Biome.NeonCity);
  });

  it("handles large deltas without breaking cycle order", () => {
    const manager = new BiomeManager();
    manager.startRun();

    const transitions = manager.update(BIOME_ROTATION_INTERVAL_MS * 5);

    expect(transitions).toEqual([
      { from: Biome.NeonCity, to: Biome.IceCavern },
      { from: Biome.IceCavern, to: Biome.MoltenCore },
      { from: Biome.MoltenCore, to: Biome.VoidRift },
      { from: Biome.VoidRift, to: Biome.NeonCity },
      { from: Biome.NeonCity, to: Biome.IceCavern },
    ]);
    expect(manager.getCurrentBiome()).toBe(Biome.IceCavern);
    expect(manager.getElapsedInBiomeMs()).toBe(0);
  });

  it("startRun always resets biome state and visit stats for a fresh run", () => {
    const manager = new BiomeManager();
    manager.startRun();
    manager.update(BIOME_ROTATION_INTERVAL_MS * 2 + 1234);

    expect(manager.getCurrentBiome()).toBe(Biome.MoltenCore);
    expect(manager.getElapsedInBiomeMs()).toBe(1234);

    manager.startRun();

    expect(manager.isRunning()).toBe(true);
    expect(manager.getCurrentBiome()).toBe(Biome.NeonCity);
    expect(manager.getElapsedInBiomeMs()).toBe(0);
    expect(manager.getVisitStats()).toEqual({
      [Biome.NeonCity]: 1,
      [Biome.IceCavern]: 0,
      [Biome.MoltenCore]: 0,
      [Biome.VoidRift]: 0,
    });
  });

  it("stopRun pauses progression until restarted", () => {
    const manager = new BiomeManager();
    manager.startRun();
    manager.update(10_000);

    manager.stopRun();
    const pausedTransitions = manager.update(BIOME_ROTATION_INTERVAL_MS);

    expect(pausedTransitions).toEqual([]);
    expect(manager.getCurrentBiome()).toBe(Biome.NeonCity);
    expect(manager.getElapsedInBiomeMs()).toBe(10_000);

    manager.startRun();
    expect(manager.getCurrentBiome()).toBe(Biome.NeonCity);
    expect(manager.getElapsedInBiomeMs()).toBe(0);
  });
});
