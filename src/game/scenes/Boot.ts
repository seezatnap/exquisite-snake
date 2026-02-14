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

    // ── Ghost body: dashed outline rect (cyan) ────────────────────
    if (!this.textures.exists(TEXTURE_KEYS.GHOST_BODY)) {
      const ghostGfx = this.make.graphics({ x: 0, y: 0 }, false);
      const inset = 2;
      const w = size - inset * 2;
      const dashLen = 3;
      const gapLen = 3;
      ghostGfx.lineStyle(1, COLORS.GHOST_BODY, 1);

      // Draw dashed rectangle: top, right, bottom, left edges
      this.drawDashedLine(ghostGfx, inset, inset, inset + w, inset, dashLen, gapLen);
      this.drawDashedLine(ghostGfx, inset + w, inset, inset + w, inset + w, dashLen, gapLen);
      this.drawDashedLine(ghostGfx, inset + w, inset + w, inset, inset + w, dashLen, gapLen);
      this.drawDashedLine(ghostGfx, inset, inset + w, inset, inset, dashLen, gapLen);

      ghostGfx.generateTexture(TEXTURE_KEYS.GHOST_BODY, size, size);
      ghostGfx.destroy();
    }

    // ── Ghost particle: small cyan dot for trailing particles ─────
    if (!this.textures.exists(TEXTURE_KEYS.GHOST_PARTICLE)) {
      const gpSize = 4;
      const gpGfx = this.make.graphics({ x: 0, y: 0 }, false);
      gpGfx.fillStyle(COLORS.GHOST_PARTICLE, 1);
      gpGfx.fillCircle(gpSize / 2, gpSize / 2, gpSize / 2);
      gpGfx.generateTexture(TEXTURE_KEYS.GHOST_PARTICLE, gpSize, gpSize);
      gpGfx.destroy();
    }
  }

  /** Draw a dashed line between two points on a Graphics object. */
  private drawDashedLine(
    gfx: Phaser.GameObjects.Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    dashLength: number,
    gapLength: number,
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const totalLength = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / totalLength;
    const uy = dy / totalLength;

    let drawn = 0;
    let drawing = true; // true = dash, false = gap

    while (drawn < totalLength) {
      const segLen = Math.min(
        drawing ? dashLength : gapLength,
        totalLength - drawn,
      );
      const startX = x1 + ux * drawn;
      const startY = y1 + uy * drawn;

      if (drawing) {
        gfx.beginPath();
        gfx.moveTo(startX, startY);
        gfx.lineTo(startX + ux * segLen, startY + uy * segLen);
        gfx.strokePath();
      }

      drawn += segLen;
      drawing = !drawing;
    }
  }
}
