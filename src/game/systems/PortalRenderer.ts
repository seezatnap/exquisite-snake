import Phaser from "phaser";
import { TILE_SIZE, RENDER_DEPTH } from "../config";
import { gridToPixel } from "../utils/grid";
import type { PortalPair, PortalLifecycleState } from "../entities/Portal";

// ── Visual configuration ───────────────────────────────────────

/** Number of spiral arms in the vortex effect. */
export const VORTEX_ARM_COUNT = 4;

/** Number of line segments per spiral arm. */
export const VORTEX_ARM_SEGMENTS = 16;

/** Maximum vortex radius relative to tile size. */
export const VORTEX_MAX_RADIUS_FACTOR = 0.48;

/** Base rotation speed in radians per second. */
export const VORTEX_SPIN_SPEED = Math.PI * 1.5;

/** Number of concentric glow rings around each portal end. */
export const GLOW_RING_COUNT = 3;

/** Portal end A primary color (cyan). */
export const PORTAL_COLOR_A = 0x00f0ff;

/** Portal end B primary color (magenta/pink). */
export const PORTAL_COLOR_B = 0xff2daa;

/** Core glow color (white-ish). */
export const PORTAL_CORE_COLOR = 0xffffff;

// ── Lifecycle callbacks ────────────────────────────────────────

/**
 * Callback invoked when a portal pair enters the `spawning` state
 * (i.e. first rendered). Receives the pair and the Phaser scene.
 */
export type PortalSpawnCallback = (
  pair: PortalPair,
  scene: Phaser.Scene,
) => void;

/**
 * Callback invoked when a portal pair enters the `collapsed` state
 * (i.e. fully despawned). Receives the pair ID and the Phaser scene.
 */
export type PortalDespawnCallback = (
  pairId: string,
  scene: Phaser.Scene,
) => void;

// ── PortalRenderer ─────────────────────────────────────────────

/**
 * Renders all active portal pairs with a swirling vortex animation.
 *
 * Each portal end gets:
 * - A set of rotating spiral arms
 * - Concentric glow rings
 * - A bright inner core
 *
 * During `spawning`, the vortex scales and fades in (progress 0 → 1).
 * During `collapsing`, the vortex scales and fades out (progress 0 → 1, reversed).
 * During `active`, full size and opacity.
 *
 * The renderer owns a single Phaser Graphics object, redrawn each frame.
 */
export class PortalRenderer {
  /** The Phaser Graphics object used for portal drawing. */
  private graphics: Phaser.GameObjects.Graphics | null = null;

  /** Running spin angle in radians, accumulated over time. */
  private spinAngle = 0;

  /** Set of pair IDs we have already notified onSpawn for. */
  private spawnedPairIds = new Set<string>();

  /** Callback fired once per pair when it first appears. */
  private onSpawnCallback: PortalSpawnCallback | null = null;

  /** Callback fired once per pair when it fully collapses. */
  private onDespawnCallback: PortalDespawnCallback | null = null;

  // ── Lifecycle hook registration ─────────────────────────────

  /** Register a callback for portal spawn events. */
  onPortalSpawn(cb: PortalSpawnCallback): void {
    this.onSpawnCallback = cb;
  }

  /** Register a callback for portal despawn events. */
  onPortalDespawn(cb: PortalDespawnCallback): void {
    this.onDespawnCallback = cb;
  }

  // ── Frame update ────────────────────────────────────────────

  /**
   * Update portal visuals for the current frame.
   *
   * @param scene - The Phaser scene (used for graphics factory).
   * @param delta - Frame delta in ms.
   * @param pairs - All active (non-removed) portal pairs from the PortalManager.
   */
  update(
    scene: Phaser.Scene,
    delta: number,
    pairs: readonly PortalPair[],
  ): void {
    const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    this.spinAngle =
      (this.spinAngle + (safeDelta / 1_000) * VORTEX_SPIN_SPEED) %
      (Math.PI * 2);

    // Fire spawn hooks for newly appearing pairs
    this.processSpawnHooks(pairs, scene);

    // If no pairs to draw, clear and exit
    if (pairs.length === 0) {
      this.clearGraphics();
      return;
    }

    this.ensureGraphics(scene);
    const gfx = this.graphics;
    if (!gfx) return;

    gfx.clear?.();

    for (const pair of pairs) {
      const state = pair.getState();
      if (state === "collapsed") continue;

      const visibility = this.getVisibility(pair);
      if (visibility <= 0) continue;

      const [posA, posB] = pair.getPositions();
      const pixelA = gridToPixel(posA);
      const pixelB = gridToPixel(posB);

      this.drawPortalEnd(gfx, pixelA.x, pixelA.y, PORTAL_COLOR_A, visibility, 0);
      this.drawPortalEnd(gfx, pixelB.x, pixelB.y, PORTAL_COLOR_B, visibility, Math.PI);
    }
  }

  /**
   * Notify the renderer that pairs have been removed (collapsed).
   * Fires the despawn callback and cleans up tracked state.
   */
  notifyCollapsed(collapsedPairs: readonly PortalPair[], scene: Phaser.Scene): void {
    for (const pair of collapsedPairs) {
      const id = pair.id;
      if (this.spawnedPairIds.has(id)) {
        this.spawnedPairIds.delete(id);
        this.onDespawnCallback?.(id, scene);
      }
    }
  }

  /** Reset all visual state (e.g. on game over or scene shutdown). */
  reset(): void {
    this.spinAngle = 0;
    this.spawnedPairIds.clear();
    this.destroyGraphics();
  }

  /** Destroy the graphics object entirely. */
  destroy(): void {
    this.reset();
  }

  /** Get the current spin angle (useful for tests). */
  getSpinAngle(): number {
    return this.spinAngle;
  }

  // ── Internal drawing ────────────────────────────────────────

  /**
   * Compute the visibility factor [0, 1] for a portal pair
   * based on its lifecycle state and progress.
   *
   * - spawning:   progress 0→1 (fade in)
   * - active:     1
   * - collapsing: progress 0→1 mapped to 1→0 (fade out)
   * - collapsed:  0
   */
  private getVisibility(pair: PortalPair): number {
    const state: PortalLifecycleState = pair.getState();
    const progress = pair.getStateProgress();

    switch (state) {
      case "spawning":
        return progress;
      case "active":
        return 1;
      case "collapsing":
        return 1 - progress;
      case "collapsed":
        return 0;
    }
  }

  /**
   * Draw a single portal end with swirling vortex + glow rings + core.
   *
   * @param gfx        - Phaser graphics object
   * @param cx         - Center X in pixels
   * @param cy         - Center Y in pixels
   * @param color      - Primary color for this end
   * @param visibility - 0 (invisible) to 1 (fully visible)
   * @param phaseOffset - Rotation offset to distinguish end A from B
   */
  private drawPortalEnd(
    gfx: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    color: number,
    visibility: number,
    phaseOffset: number,
  ): void {
    const maxRadius = TILE_SIZE * VORTEX_MAX_RADIUS_FACTOR;
    const radius = maxRadius * visibility;
    const alpha = visibility;

    // 1. Glow rings (outermost layer)
    this.drawGlowRings(gfx, cx, cy, color, radius, alpha);

    // 2. Spiral arms
    this.drawSpiralArms(gfx, cx, cy, color, radius, alpha, phaseOffset);

    // 3. Inner core
    this.drawCore(gfx, cx, cy, color, radius, alpha);
  }

  /**
   * Draw concentric glow rings around a portal end.
   */
  private drawGlowRings(
    gfx: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    color: number,
    radius: number,
    alpha: number,
  ): void {
    for (let i = 0; i < GLOW_RING_COUNT; i++) {
      const ringT = (i + 1) / GLOW_RING_COUNT;
      const ringRadius = radius * (0.5 + ringT * 0.5);
      const ringAlpha = alpha * (0.15 - i * 0.03);
      if (ringAlpha <= 0) continue;

      gfx.lineStyle?.(2 - i * 0.5, color, ringAlpha);
      gfx.strokeCircle?.(cx, cy, ringRadius);
    }
  }

  /**
   * Draw swirling spiral arms radiating from center.
   */
  private drawSpiralArms(
    gfx: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    color: number,
    radius: number,
    alpha: number,
    phaseOffset: number,
  ): void {
    const armAlpha = alpha * 0.55;
    if (armAlpha <= 0) return;

    gfx.lineStyle?.(1.5, color, armAlpha);

    for (let arm = 0; arm < VORTEX_ARM_COUNT; arm++) {
      const armBaseAngle =
        this.spinAngle + phaseOffset + (arm * Math.PI * 2) / VORTEX_ARM_COUNT;

      for (let seg = 0; seg <= VORTEX_ARM_SEGMENTS; seg++) {
        const t = seg / VORTEX_ARM_SEGMENTS;
        // Spiral: radius increases with t, angle increases with t (logarithmic spiral feel)
        const segRadius = radius * t;
        const spiralTwist = t * Math.PI * 1.5;
        const angle = armBaseAngle + spiralTwist;

        const x = cx + Math.cos(angle) * segRadius;
        const y = cy + Math.sin(angle) * segRadius;

        if (seg === 0) {
          gfx.moveTo?.(x, y);
        } else {
          gfx.lineTo?.(x, y);
        }
      }
    }

    gfx.strokePath?.();
  }

  /**
   * Draw the bright inner core of a portal end.
   */
  private drawCore(
    gfx: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    color: number,
    radius: number,
    alpha: number,
  ): void {
    // Outer core with portal color
    const coreRadius = radius * 0.3;
    gfx.fillStyle?.(color, alpha * 0.6);
    gfx.fillCircle?.(cx, cy, coreRadius);

    // Inner bright center
    const innerRadius = coreRadius * 0.5;
    gfx.fillStyle?.(PORTAL_CORE_COLOR, alpha * 0.7);
    gfx.fillCircle?.(cx, cy, innerRadius);
  }

  // ── Lifecycle hook processing ───────────────────────────────

  private processSpawnHooks(
    pairs: readonly PortalPair[],
    scene: Phaser.Scene,
  ): void {
    for (const pair of pairs) {
      if (!this.spawnedPairIds.has(pair.id)) {
        this.spawnedPairIds.add(pair.id);
        this.onSpawnCallback?.(pair, scene);
      }
    }
  }

  // ── Graphics management ─────────────────────────────────────

  private ensureGraphics(scene: Phaser.Scene): void {
    if (this.graphics) return;

    const addFactory = scene.add as unknown as {
      graphics?: () => Phaser.GameObjects.Graphics;
    };
    if (typeof addFactory.graphics !== "function") return;

    this.graphics = addFactory.graphics();
    this.graphics.setDepth?.(RENDER_DEPTH.PORTAL);
  }

  private clearGraphics(): void {
    this.graphics?.clear?.();
  }

  private destroyGraphics(): void {
    this.graphics?.destroy?.();
    this.graphics = null;
  }
}
