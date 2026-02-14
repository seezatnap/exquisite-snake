import Phaser from "phaser";
import { TILE_SIZE, COLORS, TEXTURE_KEYS } from "../config";

/**
 * Boot scene — generates all visual-primitive textures at startup so
 * gameplay scenes can reference them by key without loading external files.
 *
 * After texture generation completes, the scene transitions to "MainScene".
 */
export class Boot extends Phaser.Scene {
  constructor() {
    super({ key: "Boot" });
  }

  preload(): void {
    // No external assets to load — everything is generated in create().
  }

  create(): void {
    this.generateTextures();
    this.scene.start("MainScene");
  }

  /** Build small canvas textures for snake, food, and particle effects. */
  private generateTextures(): void {
    const size = TILE_SIZE;
    const half = size / 2;

    // ── Snake head: filled rounded rect in cyan ──────────────────
    if (!this.textures.exists(TEXTURE_KEYS.SNAKE_HEAD)) {
      const headGfx = this.make.graphics({ x: 0, y: 0 }, false);
      headGfx.fillStyle(COLORS.SNAKE_HEAD, 1);
      headGfx.fillRoundedRect(1, 1, size - 2, size - 2, 4);
      headGfx.generateTexture(TEXTURE_KEYS.SNAKE_HEAD, size, size);
      headGfx.destroy();
    }

    // ── Snake body segment: slightly darker cyan, smaller radius ─
    if (!this.textures.exists(TEXTURE_KEYS.SNAKE_BODY)) {
      const bodyGfx = this.make.graphics({ x: 0, y: 0 }, false);
      bodyGfx.fillStyle(COLORS.SNAKE_BODY, 1);
      bodyGfx.fillRoundedRect(2, 2, size - 4, size - 4, 3);
      bodyGfx.generateTexture(TEXTURE_KEYS.SNAKE_BODY, size, size);
      bodyGfx.destroy();
    }

    // ── Food: neon-pink circle ───────────────────────────────────
    if (!this.textures.exists(TEXTURE_KEYS.FOOD)) {
      const foodGfx = this.make.graphics({ x: 0, y: 0 }, false);
      foodGfx.fillStyle(COLORS.FOOD, 1);
      foodGfx.fillCircle(half, half, half - 2);
      foodGfx.generateTexture(TEXTURE_KEYS.FOOD, size, size);
      foodGfx.destroy();
    }

    // ── Parasite pickup: squared glyph with core cutout ─────────
    if (!this.textures.exists(TEXTURE_KEYS.PARASITE_PICKUP)) {
      const parasiteGfx = this.make.graphics({ x: 0, y: 0 }, false);
      parasiteGfx.fillStyle(0xf5c542, 1);
      parasiteGfx.fillRoundedRect(2, 2, size - 4, size - 4, 5);
      parasiteGfx.fillStyle(COLORS.BACKGROUND, 1);
      parasiteGfx.fillCircle(half, half, size * 0.17);
      parasiteGfx.generateTexture(TEXTURE_KEYS.PARASITE_PICKUP, size, size);
      parasiteGfx.destroy();
    }

    // ── Particle: small neon-pink dot for burst effects ──────────
    if (!this.textures.exists(TEXTURE_KEYS.PARTICLE)) {
      const particleSize = 6;
      const particleGfx = this.make.graphics({ x: 0, y: 0 }, false);
      particleGfx.fillStyle(COLORS.PARTICLE, 1);
      particleGfx.fillCircle(
        particleSize / 2,
        particleSize / 2,
        particleSize / 2
      );
      particleGfx.generateTexture(
        TEXTURE_KEYS.PARTICLE,
        particleSize,
        particleSize
      );
      particleGfx.destroy();
    }
  }
}
