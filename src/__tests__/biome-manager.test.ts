import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  Biome,
  BIOME_CYCLE,
  BIOME_DURATION_MS,
  BIOME_CONFIGS,
  BiomeManager,
  type BiomeChangeListener,
} from "@/game/systems/BiomeManager";

describe("Biome enum and constants", () => {
  it("defines exactly four biomes", () => {
    const values = Object.values(Biome);
    expect(values).toHaveLength(4);
  });

  it("BIOME_CYCLE follows the spec order", () => {
    expect(BIOME_CYCLE).toEqual([
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.MoltenCore,
      Biome.VoidRift,
    ]);
  });

  it("biome duration is 45 seconds", () => {
    expect(BIOME_DURATION_MS).toBe(45_000);
  });

  it("every biome has a config entry with name and description", () => {
    for (const biome of BIOME_CYCLE) {
      const config = BIOME_CONFIGS[biome];
      expect(config).toBeDefined();
      expect(config.name).toBeTruthy();
      expect(config.description).toBeTruthy();
    }
  });

  it("config names match spec display names", () => {
    expect(BIOME_CONFIGS[Biome.NeonCity].name).toBe("Neon City");
    expect(BIOME_CONFIGS[Biome.IceCavern].name).toBe("Ice Cavern");
    expect(BIOME_CONFIGS[Biome.MoltenCore].name).toBe("Molten Core");
    expect(BIOME_CONFIGS[Biome.VoidRift].name).toBe("Void Rift");
  });
});

describe("BiomeManager", () => {
  let manager: BiomeManager;

  beforeEach(() => {
    manager = new BiomeManager();
  });

  // ── Initial state ──────────────────────────────────────────

  describe("initial state (before start)", () => {
    it("defaults to NeonCity", () => {
      expect(manager.getCurrentBiome()).toBe(Biome.NeonCity);
    });

    it("is not running", () => {
      expect(manager.isRunning()).toBe(false);
    });

    it("has full time remaining", () => {
      expect(manager.getTimeRemaining()).toBe(BIOME_DURATION_MS);
    });

    it("has zero visits", () => {
      const stats = manager.getVisitStats();
      expect(stats.uniqueCount).toBe(0);
      for (const biome of BIOME_CYCLE) {
        expect(stats.visits[biome]).toBe(0);
      }
    });
  });

  // ── start() ────────────────────────────────────────────────

  describe("start()", () => {
    it("sets running to true", () => {
      manager.start();
      expect(manager.isRunning()).toBe(true);
    });

    it("records first biome visit on start", () => {
      manager.start();
      const stats = manager.getVisitStats();
      expect(stats.visits[Biome.NeonCity]).toBe(1);
      expect(stats.uniqueCount).toBe(1);
    });

    it("always starts on NeonCity", () => {
      manager.start();
      expect(manager.getCurrentBiome()).toBe(Biome.NeonCity);
    });

    it("is a no-op if already running", () => {
      manager.start();
      // Advance partway through first biome
      manager.update(10_000);
      // Start again — should not reset the timer
      manager.start();
      expect(manager.getTimeRemaining()).toBe(BIOME_DURATION_MS - 10_000);
    });
  });

  // ── update() — timer advancement ──────────────────────────

  describe("update()", () => {
    beforeEach(() => {
      manager.start();
    });

    it("does nothing if not running", () => {
      const stopped = new BiomeManager();
      stopped.update(50_000);
      expect(stopped.getCurrentBiome()).toBe(Biome.NeonCity);
    });

    it("returns current biome", () => {
      const result = manager.update(1000);
      expect(result).toBe(Biome.NeonCity);
    });

    it("decreases time remaining", () => {
      manager.update(5000);
      expect(manager.getTimeRemaining()).toBe(BIOME_DURATION_MS - 5000);
    });

    it("transitions to IceCavern after 45 seconds", () => {
      manager.update(BIOME_DURATION_MS);
      expect(manager.getCurrentBiome()).toBe(Biome.IceCavern);
    });

    it("transitions to MoltenCore after 90 seconds", () => {
      manager.update(BIOME_DURATION_MS * 2);
      expect(manager.getCurrentBiome()).toBe(Biome.MoltenCore);
    });

    it("transitions to VoidRift after 135 seconds", () => {
      manager.update(BIOME_DURATION_MS * 3);
      expect(manager.getCurrentBiome()).toBe(Biome.VoidRift);
    });

    it("wraps back to NeonCity after a full cycle (180s)", () => {
      manager.update(BIOME_DURATION_MS * 4);
      expect(manager.getCurrentBiome()).toBe(Biome.NeonCity);
    });

    it("handles incremental updates correctly", () => {
      // Advance in small increments totaling exactly one biome duration
      for (let i = 0; i < 45; i++) {
        manager.update(1000);
      }
      expect(manager.getCurrentBiome()).toBe(Biome.IceCavern);
    });

    it("handles large delta spanning multiple biomes", () => {
      // Jump 100 seconds — should be in biome index 2 (MoltenCore)
      // 100s = 2 full periods (90s) + 10s into third
      manager.update(100_000);
      expect(manager.getCurrentBiome()).toBe(Biome.MoltenCore);
      expect(manager.getTimeRemaining()).toBe(BIOME_DURATION_MS - 10_000);
    });

    it("preserves remainder time after transition", () => {
      manager.update(BIOME_DURATION_MS + 5000);
      expect(manager.getCurrentBiome()).toBe(Biome.IceCavern);
      expect(manager.getTimeRemaining()).toBe(BIOME_DURATION_MS - 5000);
    });
  });

  // ── Deterministic cycle order ──────────────────────────────

  describe("deterministic cycle order", () => {
    it("cycles through all four biomes in spec order", () => {
      manager.start();
      const visited: Biome[] = [manager.getCurrentBiome()];

      for (let i = 0; i < 4; i++) {
        manager.update(BIOME_DURATION_MS);
        visited.push(manager.getCurrentBiome());
      }

      expect(visited).toEqual([
        Biome.NeonCity,
        Biome.IceCavern,
        Biome.MoltenCore,
        Biome.VoidRift,
        Biome.NeonCity, // wraps
      ]);
    });

    it("completes multiple full cycles deterministically", () => {
      manager.start();
      const expected = [
        Biome.NeonCity,
        Biome.IceCavern,
        Biome.MoltenCore,
        Biome.VoidRift,
      ];

      for (let cycle = 0; cycle < 3; cycle++) {
        for (let i = 0; i < 4; i++) {
          expect(manager.getCurrentBiome()).toBe(expected[i]);
          manager.update(BIOME_DURATION_MS);
        }
      }
    });
  });

  // ── Biome change events ────────────────────────────────────

  describe("onChange / offChange", () => {
    it("fires listener on biome transition", () => {
      const listener = vi.fn<BiomeChangeListener>();
      manager.onChange(listener);
      manager.start();
      manager.update(BIOME_DURATION_MS);

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith(Biome.IceCavern, Biome.NeonCity);
    });

    it("fires for every transition in a large delta", () => {
      const listener = vi.fn<BiomeChangeListener>();
      manager.onChange(listener);
      manager.start();
      // Jump 3 biomes worth
      manager.update(BIOME_DURATION_MS * 3);

      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener).toHaveBeenNthCalledWith(1, Biome.IceCavern, Biome.NeonCity);
      expect(listener).toHaveBeenNthCalledWith(2, Biome.MoltenCore, Biome.IceCavern);
      expect(listener).toHaveBeenNthCalledWith(3, Biome.VoidRift, Biome.MoltenCore);
    });

    it("does not fire when timer hasn't reached threshold", () => {
      const listener = vi.fn<BiomeChangeListener>();
      manager.onChange(listener);
      manager.start();
      manager.update(BIOME_DURATION_MS - 1);

      expect(listener).not.toHaveBeenCalled();
    });

    it("offChange stops future notifications", () => {
      const listener = vi.fn<BiomeChangeListener>();
      manager.onChange(listener);
      manager.start();
      manager.offChange(listener);
      manager.update(BIOME_DURATION_MS);

      expect(listener).not.toHaveBeenCalled();
    });

    it("supports multiple listeners", () => {
      const a = vi.fn<BiomeChangeListener>();
      const b = vi.fn<BiomeChangeListener>();
      manager.onChange(a);
      manager.onChange(b);
      manager.start();
      manager.update(BIOME_DURATION_MS);

      expect(a).toHaveBeenCalledOnce();
      expect(b).toHaveBeenCalledOnce();
    });
  });

  // ── Visit stats ────────────────────────────────────────────

  describe("getVisitStats()", () => {
    it("tracks visits for each biome entered", () => {
      manager.start();
      manager.update(BIOME_DURATION_MS); // → IceCavern
      manager.update(BIOME_DURATION_MS); // → MoltenCore

      const stats = manager.getVisitStats();
      expect(stats.visits[Biome.NeonCity]).toBe(1);
      expect(stats.visits[Biome.IceCavern]).toBe(1);
      expect(stats.visits[Biome.MoltenCore]).toBe(1);
      expect(stats.visits[Biome.VoidRift]).toBe(0);
      expect(stats.uniqueCount).toBe(3);
    });

    it("increments visits on repeated cycles", () => {
      manager.start();
      // Complete one full cycle + enter NeonCity again
      manager.update(BIOME_DURATION_MS * 4);

      const stats = manager.getVisitStats();
      expect(stats.visits[Biome.NeonCity]).toBe(2); // start + wrap
      expect(stats.visits[Biome.IceCavern]).toBe(1);
      expect(stats.visits[Biome.MoltenCore]).toBe(1);
      expect(stats.visits[Biome.VoidRift]).toBe(1);
      expect(stats.uniqueCount).toBe(4);
    });

    it("returns a snapshot (not a live reference)", () => {
      manager.start();
      const stats1 = manager.getVisitStats();
      manager.update(BIOME_DURATION_MS);
      const stats2 = manager.getVisitStats();

      expect(stats1.visits[Biome.IceCavern]).toBe(0);
      expect(stats2.visits[Biome.IceCavern]).toBe(1);
    });
  });

  // ── reset() ────────────────────────────────────────────────

  describe("reset()", () => {
    it("stops the manager", () => {
      manager.start();
      manager.reset();
      expect(manager.isRunning()).toBe(false);
    });

    it("resets biome to NeonCity", () => {
      manager.start();
      manager.update(BIOME_DURATION_MS * 2); // → MoltenCore
      manager.reset();
      expect(manager.getCurrentBiome()).toBe(Biome.NeonCity);
    });

    it("resets elapsed time", () => {
      manager.start();
      manager.update(20_000);
      manager.reset();
      expect(manager.getTimeRemaining()).toBe(BIOME_DURATION_MS);
    });

    it("resets visit stats", () => {
      manager.start();
      manager.update(BIOME_DURATION_MS * 3);
      manager.reset();

      const stats = manager.getVisitStats();
      expect(stats.uniqueCount).toBe(0);
      for (const biome of BIOME_CYCLE) {
        expect(stats.visits[biome]).toBe(0);
      }
    });

    it("allows a clean restart after reset", () => {
      manager.start();
      manager.update(BIOME_DURATION_MS * 2);
      manager.reset();
      manager.start();

      expect(manager.getCurrentBiome()).toBe(Biome.NeonCity);
      expect(manager.isRunning()).toBe(true);
      expect(manager.getVisitStats().visits[Biome.NeonCity]).toBe(1);
      expect(manager.getVisitStats().uniqueCount).toBe(1);
    });

    it("preserves listeners across reset", () => {
      const listener = vi.fn<BiomeChangeListener>();
      manager.onChange(listener);
      manager.start();
      manager.reset();
      manager.start();
      manager.update(BIOME_DURATION_MS);

      expect(listener).toHaveBeenCalledOnce();
    });
  });

  // ── getTimeRemaining() ─────────────────────────────────────

  describe("getTimeRemaining()", () => {
    it("never returns negative", () => {
      manager.start();
      manager.update(BIOME_DURATION_MS - 1);
      expect(manager.getTimeRemaining()).toBe(1);

      manager.update(1);
      // Just transitioned — should be back to full (or near-full)
      expect(manager.getTimeRemaining()).toBe(BIOME_DURATION_MS);
    });

    it("resets after each transition", () => {
      manager.start();
      manager.update(BIOME_DURATION_MS + 2000);
      expect(manager.getTimeRemaining()).toBe(BIOME_DURATION_MS - 2000);
    });
  });
});
