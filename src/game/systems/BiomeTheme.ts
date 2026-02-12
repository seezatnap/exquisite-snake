// ── Per-biome visual theme definitions ─────────────────────────
import { Biome } from "./BiomeManager";

/**
 * Visual palette for a single biome.
 *
 * All colour values are Phaser-compatible 0xRRGGBB integers
 * (except `backgroundCss` which is a CSS hex string for the
 * Phaser game config / camera background).
 */
export interface BiomeThemeColors {
  /** Canvas / camera clear colour (0xRRGGBB). */
  readonly background: number;
  /** CSS hex string for Phaser camera background. */
  readonly backgroundCss: string;
  /** Grid-line colour (drawn at low alpha). */
  readonly gridLine: number;
  /** Grid-line draw alpha. */
  readonly gridAlpha: number;
  /** Snake head fill. */
  readonly snakeHead: number;
  /** Snake body fill. */
  readonly snakeBody: number;
  /** Food fill. */
  readonly food: number;
  /** Particle burst fill. */
  readonly particle: number;
}

/** Full visual theme for one biome. */
export interface BiomeTheme {
  readonly biome: Biome;
  readonly colors: BiomeThemeColors;
}

// ── Theme definitions ──────────────────────────────────────────

const NEON_CITY_THEME: BiomeTheme = {
  biome: Biome.NeonCity,
  colors: {
    background: 0x0a0a0a,
    backgroundCss: "#0a0a0a",
    gridLine: 0x00f0ff,
    gridAlpha: 0.08,
    snakeHead: 0x00f0ff,
    snakeBody: 0x00c8d4,
    food: 0xff2d78,
    particle: 0xff2d78,
  },
};

const ICE_CAVERN_THEME: BiomeTheme = {
  biome: Biome.IceCavern,
  colors: {
    background: 0x0a1628,
    backgroundCss: "#0a1628",
    gridLine: 0x4fc3f7,
    gridAlpha: 0.1,
    snakeHead: 0x81d4fa,
    snakeBody: 0x4fc3f7,
    food: 0xe1f5fe,
    particle: 0xb3e5fc,
  },
};

const MOLTEN_CORE_THEME: BiomeTheme = {
  biome: Biome.MoltenCore,
  colors: {
    background: 0x1a0800,
    backgroundCss: "#1a0800",
    gridLine: 0xff6600,
    gridAlpha: 0.1,
    snakeHead: 0xff9800,
    snakeBody: 0xe65100,
    food: 0xffeb3b,
    particle: 0xff6600,
  },
};

const VOID_RIFT_THEME: BiomeTheme = {
  biome: Biome.VoidRift,
  colors: {
    background: 0x08001a,
    backgroundCss: "#08001a",
    gridLine: 0xb026ff,
    gridAlpha: 0.1,
    snakeHead: 0xce93d8,
    snakeBody: 0xab47bc,
    food: 0xe040fb,
    particle: 0xb026ff,
  },
};

/** Lookup table: Biome → BiomeTheme. */
export const BIOME_THEMES: Readonly<Record<Biome, BiomeTheme>> = {
  [Biome.NeonCity]: NEON_CITY_THEME,
  [Biome.IceCavern]: ICE_CAVERN_THEME,
  [Biome.MoltenCore]: MOLTEN_CORE_THEME,
  [Biome.VoidRift]: VOID_RIFT_THEME,
} as const;

/**
 * Get the visual theme for a given biome.
 */
export function getBiomeTheme(biome: Biome): BiomeTheme {
  return BIOME_THEMES[biome];
}
