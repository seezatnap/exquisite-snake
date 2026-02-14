import { describe, it, expect } from "vitest";
import {
  BiomeManager,
  BIOME_CONFIGS,
  BIOME_ORDER,
  BIOME_SHIFT_INTERVAL_MS,
  BIOME_TRANSITION_MS,
  lerpColor,
  colorToRGB,
  rgbToColor,
} from "@/game/systems/BiomeManager";

// ── Color utilities ──────────────────────────────────────────────

describe("color utilities", () => {
  describe("colorToRGB", () => {
    it("extracts RGB from cyan (0x00f0ff)", () => {
      const { r, g, b } = colorToRGB(0x00f0ff);
      expect(r).toBe(0x00);
      expect(g).toBe(0xf0);
      expect(b).toBe(0xff);
    });

    it("extracts RGB from white (0xffffff)", () => {
      const { r, g, b } = colorToRGB(0xffffff);
      expect(r).toBe(255);
      expect(g).toBe(255);
      expect(b).toBe(255);
    });

    it("extracts RGB from black (0x000000)", () => {
      const { r, g, b } = colorToRGB(0x000000);
      expect(r).toBe(0);
      expect(g).toBe(0);
      expect(b).toBe(0);
    });
  });

  describe("rgbToColor", () => {
    it("packs cyan components to 0x00f0ff", () => {
      expect(rgbToColor(0x00, 0xf0, 0xff)).toBe(0x00f0ff);
    });

    it("round-trips through colorToRGB", () => {
      const original = 0xb026ff;
      const { r, g, b } = colorToRGB(original);
      expect(rgbToColor(r, g, b)).toBe(original);
    });
  });

  describe("lerpColor", () => {
    it("returns from-color at t=0", () => {
      expect(lerpColor(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
    });

    it("returns to-color at t=1", () => {
      expect(lerpColor(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
    });

    it("returns midpoint at t=0.5", () => {
      // Red (255,0,0) → Blue (0,0,255) at t=0.5 → (128,0,128)
      const mid = lerpColor(0xff0000, 0x0000ff, 0.5);
      const { r, g, b } = colorToRGB(mid);
      expect(r).toBe(128);
      expect(g).toBe(0);
      expect(b).toBe(128);
    });

    it("clamps t below 0", () => {
      expect(lerpColor(0xff0000, 0x0000ff, -1)).toBe(0xff0000);
    });

    it("clamps t above 1", () => {
      expect(lerpColor(0xff0000, 0x0000ff, 2)).toBe(0x0000ff);
    });
  });
});

// ── BiomeManager ──────────────────────────────────────────────────

describe("BiomeManager", () => {
  describe("initial state", () => {
    it("starts at the first biome (neon)", () => {
      const mgr = new BiomeManager();
      expect(mgr.getCurrentBiome()).toBe("neon");
    });

    it("is not transitioning initially", () => {
      const mgr = new BiomeManager();
      expect(mgr.isTransitioning()).toBe(false);
    });

    it("returns neon ghost tint initially", () => {
      const mgr = new BiomeManager();
      expect(mgr.getGhostTint()).toBe(BIOME_CONFIGS.neon.ghostTint);
    });

    it("returns neon particle tint initially", () => {
      const mgr = new BiomeManager();
      expect(mgr.getParticleTint()).toBe(BIOME_CONFIGS.neon.particleTint);
    });
  });

  describe("biome cycling", () => {
    it("shifts to the next biome after BIOME_SHIFT_INTERVAL_MS", () => {
      const mgr = new BiomeManager();
      mgr.update(BIOME_SHIFT_INTERVAL_MS);
      expect(mgr.getCurrentBiome()).toBe(BIOME_ORDER[1]);
    });

    it("cycles through all biomes in order", () => {
      const mgr = new BiomeManager();
      for (let i = 0; i < BIOME_ORDER.length; i++) {
        expect(mgr.getCurrentBiome()).toBe(BIOME_ORDER[i]);
        mgr.update(BIOME_SHIFT_INTERVAL_MS);
      }
      // Should wrap back to the first biome
      expect(mgr.getCurrentBiome()).toBe(BIOME_ORDER[0]);
    });

    it("does not shift before interval elapses", () => {
      const mgr = new BiomeManager();
      mgr.update(BIOME_SHIFT_INTERVAL_MS - 1);
      expect(mgr.getCurrentBiome()).toBe("neon");
    });
  });

  describe("smooth transitions", () => {
    it("enters transitioning state when biome shifts", () => {
      const mgr = new BiomeManager();
      mgr.update(BIOME_SHIFT_INTERVAL_MS);
      expect(mgr.isTransitioning()).toBe(true);
    });

    it("transition progress starts at 0", () => {
      const mgr = new BiomeManager();
      mgr.update(BIOME_SHIFT_INTERVAL_MS);
      // Transition just started — progress should be near 0
      expect(mgr.getTransitionProgress()).toBeCloseTo(0, 1);
    });

    it("transition progress increases over time", () => {
      const mgr = new BiomeManager();
      mgr.update(BIOME_SHIFT_INTERVAL_MS);
      mgr.update(BIOME_TRANSITION_MS / 2);
      const progress = mgr.getTransitionProgress();
      expect(progress).toBeGreaterThan(0.3);
      expect(progress).toBeLessThan(0.7);
    });

    it("transition completes after BIOME_TRANSITION_MS", () => {
      const mgr = new BiomeManager();
      mgr.update(BIOME_SHIFT_INTERVAL_MS);
      mgr.update(BIOME_TRANSITION_MS);
      expect(mgr.isTransitioning()).toBe(false);
      expect(mgr.getTransitionProgress()).toBe(1);
    });

    it("ghost tint interpolates during transition", () => {
      const mgr = new BiomeManager();
      const neonTint = BIOME_CONFIGS.neon.ghostTint;
      const toxicTint = BIOME_CONFIGS.toxic.ghostTint;

      mgr.update(BIOME_SHIFT_INTERVAL_MS);
      mgr.update(BIOME_TRANSITION_MS / 2);

      const currentTint = mgr.getGhostTint();
      // Should be neither the old nor new tint (it's mid-transition)
      expect(currentTint).not.toBe(neonTint);
      expect(currentTint).not.toBe(toxicTint);
    });

    it("ghost tint matches new biome after transition completes", () => {
      const mgr = new BiomeManager();
      mgr.update(BIOME_SHIFT_INTERVAL_MS);
      mgr.update(BIOME_TRANSITION_MS);

      expect(mgr.getGhostTint()).toBe(BIOME_CONFIGS.toxic.ghostTint);
    });

    it("particle tint interpolates during transition", () => {
      const mgr = new BiomeManager();
      const neonTint = BIOME_CONFIGS.neon.particleTint;
      const toxicTint = BIOME_CONFIGS.toxic.particleTint;

      mgr.update(BIOME_SHIFT_INTERVAL_MS);
      mgr.update(BIOME_TRANSITION_MS / 2);

      const currentTint = mgr.getParticleTint();
      expect(currentTint).not.toBe(neonTint);
      expect(currentTint).not.toBe(toxicTint);
    });
  });

  describe("reset", () => {
    it("resets back to the initial biome", () => {
      const mgr = new BiomeManager();
      mgr.update(BIOME_SHIFT_INTERVAL_MS * 2);
      mgr.reset();
      expect(mgr.getCurrentBiome()).toBe("neon");
    });

    it("clears transition state on reset", () => {
      const mgr = new BiomeManager();
      mgr.update(BIOME_SHIFT_INTERVAL_MS);
      expect(mgr.isTransitioning()).toBe(true);
      mgr.reset();
      expect(mgr.isTransitioning()).toBe(false);
    });

    it("returns initial ghost tint after reset", () => {
      const mgr = new BiomeManager();
      mgr.update(BIOME_SHIFT_INTERVAL_MS);
      mgr.reset();
      expect(mgr.getGhostTint()).toBe(BIOME_CONFIGS.neon.ghostTint);
    });
  });
});

// ── Biome config sanity checks ───────────────────────────────────

describe("biome configuration", () => {
  it("has at least 2 biomes defined", () => {
    expect(BIOME_ORDER.length).toBeGreaterThanOrEqual(2);
  });

  it("all biome order entries have matching configs", () => {
    for (const biome of BIOME_ORDER) {
      expect(BIOME_CONFIGS[biome]).toBeDefined();
      expect(BIOME_CONFIGS[biome].ghostTint).toBeTypeOf("number");
      expect(BIOME_CONFIGS[biome].particleTint).toBeTypeOf("number");
      expect(BIOME_CONFIGS[biome].name).toBeTypeOf("string");
    }
  });

  it("shift interval is positive", () => {
    expect(BIOME_SHIFT_INTERVAL_MS).toBeGreaterThan(0);
  });

  it("transition duration is positive and shorter than shift interval", () => {
    expect(BIOME_TRANSITION_MS).toBeGreaterThan(0);
    expect(BIOME_TRANSITION_MS).toBeLessThan(BIOME_SHIFT_INTERVAL_MS);
  });
});
