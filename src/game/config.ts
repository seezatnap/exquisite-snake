import Phaser from "phaser";
import { Boot } from "./scenes/Boot";

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
} as const;

// ── Texture Keys (used by Boot preload and gameplay scenes) ──────
export const TEXTURE_KEYS = {
  SNAKE_HEAD: "snake-head",
  SNAKE_BODY: "snake-body",
  FOOD: "food",
  PARTICLE: "particle",
} as const;

// ── Game Configuration Factory ───────────────────────────────────
export function createGameConfig(
  parent: HTMLElement
): Phaser.Types.Core.GameConfig {
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
    scene: [Boot],
  };
}
