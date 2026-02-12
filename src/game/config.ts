// ── Arena Dimensions ─────────────────────────────────────────────
export const ARENA_WIDTH = 800;
export const ARENA_HEIGHT = 600;
export const TILE_SIZE = 20;
export const GRID_COLS = ARENA_WIDTH / TILE_SIZE;
export const GRID_ROWS = ARENA_HEIGHT / TILE_SIZE;

// ── Neon Color Palette (mirrors CSS theme tokens in globals.css) ─
export const COLORS = {
  BACKGROUND: 0x0a0a0a,
  NEON_PINK: 0xff2d78,
  NEON_CYAN: 0x00f0ff,
  NEON_PURPLE: 0xb026ff,
  SURFACE: 0x111118,
  SURFACE_BRIGHT: 0x1a1a24,
  GRID_LINE: 0x00f0ff, // drawn at low alpha
  SNAKE_HEAD: 0x00f0ff,
  SNAKE_BODY: 0x00c8d4,
  FOOD: 0xff2d78,
  PARTICLE: 0xff2d78,
  LAVA_POOL: 0xff6600,
} as const;

// ── Texture Keys (used by Boot preload and gameplay scenes) ──────
export const TEXTURE_KEYS = {
  SNAKE_HEAD: "snake-head",
  SNAKE_BODY: "snake-body",
  FOOD: "food",
  PARTICLE: "particle",
  LAVA_POOL: "lava-pool",
  VOID_VORTEX: "void-vortex",
} as const;

// ── Render Depth Layers ─────────────────────────────────────────
// Defines z-ordering for all game objects. Higher values render on top.
export const DEPTH = {
  GRID: -1,
  /** Mechanic-linked visuals: lava pools, vortex ring */
  MECHANIC_VISUALS: 1,
  /** Food renders above mechanic visuals */
  FOOD: 5,
  /** Snake body segments */
  SNAKE_BODY: 10,
  /** Snake head renders above body */
  SNAKE_HEAD: 15,
  /** Biome transition overlay — topmost */
  TRANSITION_OVERLAY: 1000,
} as const;

/**
 * Build a biome-specific texture key.
 * E.g. biomeTextureKey("snake-head", "IceCavern") → "snake-head-IceCavern"
 */
export function biomeTextureKey(
  base: string,
  biome: string,
): string {
  return `${base}-${biome}`;
}

// ── Scene class type ─────────────────────────────────────────────
type SceneClass = new (...args: unknown[]) => unknown;

// ── Phaser namespace shape ──────────────────────────────────────
// Declares only the subset of the Phaser namespace used here so
// config.ts never needs a top-level `import Phaser` (which would
// crash during Next.js SSR because Phaser requires browser globals).
interface PhaserLike {
  AUTO: number;
  Scale: { FIT: number; CENTER_BOTH: number };
}

// ── Game Configuration Factory ───────────────────────────────────
export function createGameConfig(
  parent: HTMLElement,
  Phaser: PhaserLike,
  scenes: SceneClass[],
): Record<string, unknown> {
  return {
    type: Phaser.AUTO,
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
    parent,
    backgroundColor: "#0a0a0a",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scene: scenes,
  };
}
