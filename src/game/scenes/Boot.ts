import Phaser from "phaser";
import { TILE_SIZE, COLORS, TEXTURE_KEYS, biomeTextureKey } from "../config";
import { BIOME_CYCLE } from "../systems/BiomeManager";
import { BIOME_THEMES } from "../systems/BiomeTheme";

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
    this.generateBiomeTextures();
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

    // ── Lava pool: orange filled circle for Molten Core biome ───
    if (!this.textures.exists(TEXTURE_KEYS.LAVA_POOL)) {
      const lavaGfx = this.make.graphics({ x: 0, y: 0 }, false);
      lavaGfx.fillStyle(COLORS.LAVA_POOL, 0.85);
      lavaGfx.fillCircle(half, half, half - 1);
      lavaGfx.generateTexture(TEXTURE_KEYS.LAVA_POOL, size, size);
      lavaGfx.destroy();
    }
  }

  /**
   * Generate per-biome texture variants for snake head, body, food,
   * and particle so biome transitions can swap textures instantly.
   */
  private generateBiomeTextures(): void {
    const size = TILE_SIZE;
    const half = size / 2;
    const particleSize = 6;

    for (const biome of BIOME_CYCLE) {
      const theme = BIOME_THEMES[biome];
      const c = theme.colors;

      // Snake head for this biome
      const headKey = biomeTextureKey(TEXTURE_KEYS.SNAKE_HEAD, biome);
      if (!this.textures.exists(headKey)) {
        const gfx = this.make.graphics({ x: 0, y: 0 }, false);
        gfx.fillStyle(c.snakeHead, 1);
        gfx.fillRoundedRect(1, 1, size - 2, size - 2, 4);
        gfx.generateTexture(headKey, size, size);
        gfx.destroy();
      }

      // Snake body for this biome
      const bodyKey = biomeTextureKey(TEXTURE_KEYS.SNAKE_BODY, biome);
      if (!this.textures.exists(bodyKey)) {
        const gfx = this.make.graphics({ x: 0, y: 0 }, false);
        gfx.fillStyle(c.snakeBody, 1);
        gfx.fillRoundedRect(2, 2, size - 4, size - 4, 3);
        gfx.generateTexture(bodyKey, size, size);
        gfx.destroy();
      }

      // Food for this biome
      const foodKey = biomeTextureKey(TEXTURE_KEYS.FOOD, biome);
      if (!this.textures.exists(foodKey)) {
        const gfx = this.make.graphics({ x: 0, y: 0 }, false);
        gfx.fillStyle(c.food, 1);
        gfx.fillCircle(half, half, half - 2);
        gfx.generateTexture(foodKey, size, size);
        gfx.destroy();
      }

      // Particle for this biome
      const pKey = biomeTextureKey(TEXTURE_KEYS.PARTICLE, biome);
      if (!this.textures.exists(pKey)) {
        const gfx = this.make.graphics({ x: 0, y: 0 }, false);
        gfx.fillStyle(c.particle, 1);
        gfx.fillCircle(particleSize / 2, particleSize / 2, particleSize / 2);
        gfx.generateTexture(pKey, particleSize, particleSize);
        gfx.destroy();
      }
    }
  }
}
