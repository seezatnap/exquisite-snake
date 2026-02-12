import * as Phaser from "phaser";
import { COLORS, SCENE_KEYS, TEXTURE_KEYS, TILE_SIZE } from "../config";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SCENE_KEYS.BOOT });
  }

  preload(): void {
    this.load.setPath("assets");
  }

  create(): void {
    this.createPrimitiveTextures();
    this.scene.start(SCENE_KEYS.MAIN);
  }

  private createPrimitiveTextures(): void {
    this.makeTexture(TEXTURE_KEYS.SNAKE_HEAD, TILE_SIZE, TILE_SIZE, (graphics) => {
      graphics.fillStyle(COLORS.SNAKE_HEAD, 1);
      graphics.fillRoundedRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2, 5);
    });

    this.makeTexture(TEXTURE_KEYS.SNAKE_BODY, TILE_SIZE, TILE_SIZE, (graphics) => {
      graphics.fillStyle(COLORS.SNAKE_BODY, 1);
      graphics.fillRoundedRect(2, 2, TILE_SIZE - 4, TILE_SIZE - 4, 4);
    });

    this.makeTexture(TEXTURE_KEYS.FOOD, TILE_SIZE, TILE_SIZE, (graphics) => {
      const center = TILE_SIZE / 2;
      graphics.fillStyle(COLORS.FOOD, 1);
      graphics.fillCircle(center, center, center - 3);
    });

    this.makeTexture(TEXTURE_KEYS.FOOD_GLOW, TILE_SIZE, TILE_SIZE, (graphics) => {
      const center = TILE_SIZE / 2;
      graphics.fillStyle(COLORS.FOOD, 0.16);
      graphics.fillCircle(center, center, center - 1);
    });

    this.makeTexture(TEXTURE_KEYS.PARTICLE, 8, 8, (graphics) => {
      graphics.fillStyle(COLORS.PARTICLE, 1);
      graphics.fillCircle(4, 4, 3);
    });

    this.makeTexture(TEXTURE_KEYS.UI_FRAME, 12, 12, (graphics) => {
      graphics.lineStyle(1, COLORS.NEON_CYAN, 1);
      graphics.strokeRect(0.5, 0.5, 11, 11);
      graphics.fillStyle(COLORS.NEON_PINK, 0.4);
      graphics.fillRect(1.5, 1.5, 9, 2);
    });
  }

  private makeTexture(
    key: string,
    width: number,
    height: number,
    draw: (graphics: Phaser.GameObjects.Graphics) => void,
  ): void {
    if (this.textures.exists(key)) {
      return;
    }

    const graphics = this.make.graphics({ x: 0, y: 0 }, false);
    draw(graphics);
    graphics.generateTexture(key, width, height);
    graphics.destroy();
  }
}
