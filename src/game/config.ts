import * as Phaser from "phaser";
import { BootScene } from "./scenes/Boot";

export const SCENE_KEYS = {
  BOOT: "Boot",
  MAIN: "MainScene",
} as const;

export const ARENA_WIDTH = 960;
export const ARENA_HEIGHT = 720;
export const TILE_SIZE = 24;
export const GRID_COLS = ARENA_WIDTH / TILE_SIZE;
export const GRID_ROWS = ARENA_HEIGHT / TILE_SIZE;

export const COLORS = {
  BACKGROUND: 0x040712,
  SURFACE: 0x0a1120,
  NEON_CYAN: 0x2ef0ff,
  NEON_PINK: 0xff4fd8,
  SNAKE_HEAD: 0x2ef0ff,
  SNAKE_BODY: 0x1dc7d6,
  FOOD: 0xff4fd8,
  PARTICLE: 0xff4fd8,
} as const;

export const TEXTURE_KEYS = {
  SNAKE_HEAD: "snake-head",
  SNAKE_BODY: "snake-body",
  FOOD: "food",
  FOOD_GLOW: "food-glow",
  PARTICLE: "particle-spark",
  UI_FRAME: "ui-frame",
} as const;

const MAIN_SCENE_PLACEHOLDER = { key: SCENE_KEYS.MAIN };

export const GAME_CONFIG: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: ARENA_WIDTH,
  height: ARENA_HEIGHT,
  backgroundColor: `#${COLORS.BACKGROUND.toString(16).padStart(6, "0")}`,
  pixelArt: false,
  antialias: true,
  roundPixels: false,
  fps: {
    target: 60,
    forceSetTimeOut: false,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    expandParent: true,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: {
        x: 0,
        y: 0,
      },
      debug: false,
    },
  },
  scene: [BootScene, MAIN_SCENE_PLACEHOLDER],
};
