import Phaser from "phaser";
import { TILE_SIZE, RENDER_DEPTH } from "../config";
import { gridToPixel, type GridPos } from "../utils/grid";
import type { PortalTransitState } from "../entities/Snake";
import { PORTAL_COLOR_A, PORTAL_COLOR_B } from "./PortalRenderer";

// ── Visual configuration ───────────────────────────────────────

/** Render depth for split-snake effects (just below the snake sprites). */
export const SPLIT_SNAKE_RENDER_DEPTH = RENDER_DEPTH.SNAKE - 1;

/** Alpha of the glow around segments on the entry side. */
export const ENTRY_SIDE_GLOW_ALPHA = 0.35;

/** Alpha of the glow around segments on the exit side. */
export const EXIT_SIDE_GLOW_ALPHA = 0.35;

/** Glow radius factor relative to tile size for entry/exit segments. */
export const SEGMENT_GLOW_RADIUS_FACTOR = 0.55;

/** Alpha of the connecting trail line between entry and exit groups. */
export const TRAIL_LINE_ALPHA = 0.2;

/** Width of the connecting trail line in pixels. */
export const TRAIL_LINE_WIDTH = 2;

/** Pulse speed in radians per second for the segment glow. */
export const GLOW_PULSE_SPEED = Math.PI * 3;

/** Minimum pulse alpha multiplier (glow pulses between this and 1). */
export const GLOW_PULSE_MIN = 0.5;

/** Alpha of the portal-end marker drawn at entry/exit portals during transit. */
export const PORTAL_MARKER_ALPHA = 0.4;

/** Radius factor for portal-end markers relative to tile size. */
export const PORTAL_MARKER_RADIUS_FACTOR = 0.45;

// ── SplitSnakeRenderer ─────────────────────────────────────────

/**
 * Information about how the snake's segments are divided during
 * a portal transit. Used by the renderer and exposed for testing.
 */
export interface SplitSnakeState {
  /** Whether a split is currently active. */
  active: boolean;

  /** The portal transit that caused the split. */
  transit: PortalTransitState;

  /** Segment indices that are on the exit side (already threaded). */
  exitSideIndices: number[];

  /** Segment indices that are still on the entry side (not yet threaded). */
  entrySideIndices: number[];

  /** Progress factor [0, 1]: 0 = transit just started, 1 = almost complete. */
  progress: number;
}

/**
 * Renders visual effects during portal transit to make the snake's
 * split appearance clear to the player.
 *
 * While a portal transit is active:
 * - Segments on the exit side get a colored glow matching portal end B
 * - Segments on the entry side get a colored glow matching portal end A
 * - A pulsing marker is drawn at the entry and exit portal positions
 * - A faint connecting line is drawn between the two portal ends
 *
 * The renderer owns a single Phaser Graphics object, redrawn each frame.
 */
export class SplitSnakeRenderer {
  /** The Phaser Graphics object used for split-snake effects. */
  private graphics: Phaser.GameObjects.Graphics | null = null;

  /** Running pulse timer in radians, accumulated over time. */
  private pulseAngle = 0;

  // ── Frame update ────────────────────────────────────────────

  /**
   * Update split-snake visuals for the current frame.
   *
   * @param scene    - The Phaser scene (used for graphics factory).
   * @param delta    - Frame delta in ms.
   * @param segments - The snake's current segment positions (head first).
   * @param transit  - The active portal transit state, or null if no transit.
   */
  update(
    scene: Phaser.Scene,
    delta: number,
    segments: readonly GridPos[],
    transit: PortalTransitState | null,
  ): void {
    const safeDelta = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    this.pulseAngle =
      (this.pulseAngle + (safeDelta / 1_000) * GLOW_PULSE_SPEED) %
      (Math.PI * 2);

    if (!transit || segments.length < 2) {
      this.clearGraphics();
      return;
    }

    this.ensureGraphics(scene);
    const gfx = this.graphics;
    if (!gfx) return;

    gfx.clear?.();

    const splitState = computeSplitState(segments, transit);
    if (!splitState.active) {
      return;
    }

    const pulseMultiplier =
      GLOW_PULSE_MIN +
      (1 - GLOW_PULSE_MIN) * (0.5 + 0.5 * Math.sin(this.pulseAngle));

    // Draw connecting trail between entry and exit portals
    this.drawConnectingTrail(gfx, transit.entryPos, transit.exitPos, pulseMultiplier);

    // Draw portal-end markers at entry and exit positions
    this.drawPortalMarker(gfx, transit.entryPos, PORTAL_COLOR_A, pulseMultiplier);
    this.drawPortalMarker(gfx, transit.exitPos, PORTAL_COLOR_B, pulseMultiplier);

    // Draw glow on entry-side segments
    for (const idx of splitState.entrySideIndices) {
      if (idx < segments.length) {
        this.drawSegmentGlow(
          gfx,
          segments[idx],
          PORTAL_COLOR_A,
          ENTRY_SIDE_GLOW_ALPHA * pulseMultiplier,
        );
      }
    }

    // Draw glow on exit-side segments
    for (const idx of splitState.exitSideIndices) {
      if (idx < segments.length) {
        this.drawSegmentGlow(
          gfx,
          segments[idx],
          PORTAL_COLOR_B,
          EXIT_SIDE_GLOW_ALPHA * pulseMultiplier,
        );
      }
    }
  }

  /** Get the current pulse angle (useful for tests). */
  getPulseAngle(): number {
    return this.pulseAngle;
  }

  /** Reset all visual state. */
  reset(): void {
    this.pulseAngle = 0;
    this.destroyGraphics();
  }

  /** Destroy the graphics object entirely. */
  destroy(): void {
    this.reset();
  }

  // ── Internal drawing ────────────────────────────────────────

  /**
   * Draw a glow circle around a snake segment.
   */
  private drawSegmentGlow(
    gfx: Phaser.GameObjects.Graphics,
    pos: GridPos,
    color: number,
    alpha: number,
  ): void {
    if (alpha <= 0) return;
    const pixel = gridToPixel(pos);
    const radius = TILE_SIZE * SEGMENT_GLOW_RADIUS_FACTOR;
    gfx.fillStyle?.(color, alpha);
    gfx.fillCircle?.(pixel.x, pixel.y, radius);
  }

  /**
   * Draw a pulsing marker at a portal end position.
   */
  private drawPortalMarker(
    gfx: Phaser.GameObjects.Graphics,
    pos: GridPos,
    color: number,
    pulseMultiplier: number,
  ): void {
    const pixel = gridToPixel(pos);
    const radius = TILE_SIZE * PORTAL_MARKER_RADIUS_FACTOR * pulseMultiplier;
    const alpha = PORTAL_MARKER_ALPHA * pulseMultiplier;
    if (alpha <= 0) return;

    gfx.lineStyle?.(2, color, alpha);
    gfx.strokeCircle?.(pixel.x, pixel.y, radius);
  }

  /**
   * Draw a faint connecting line between the entry and exit portal positions.
   */
  private drawConnectingTrail(
    gfx: Phaser.GameObjects.Graphics,
    entryPos: GridPos,
    exitPos: GridPos,
    pulseMultiplier: number,
  ): void {
    const alpha = TRAIL_LINE_ALPHA * pulseMultiplier;
    if (alpha <= 0) return;

    const entryPixel = gridToPixel(entryPos);
    const exitPixel = gridToPixel(exitPos);

    gfx.lineStyle?.(TRAIL_LINE_WIDTH, PORTAL_COLOR_A, alpha);
    gfx.moveTo?.(entryPixel.x, entryPixel.y);
    gfx.lineTo?.(exitPixel.x, exitPixel.y);
    gfx.strokePath?.();
  }

  // ── Graphics management ─────────────────────────────────────

  private ensureGraphics(scene: Phaser.Scene): void {
    if (this.graphics) return;

    const addFactory = scene.add as unknown as {
      graphics?: () => Phaser.GameObjects.Graphics;
    };
    if (typeof addFactory.graphics !== "function") return;

    this.graphics = addFactory.graphics();
    this.graphics.setDepth?.(SPLIT_SNAKE_RENDER_DEPTH);
  }

  private clearGraphics(): void {
    this.graphics?.clear?.();
  }

  private destroyGraphics(): void {
    this.graphics?.destroy?.();
    this.graphics = null;
  }
}

// ── Utility: compute split state ─────────────────────────────

/**
 * Compute the split-snake state given the current segments and transit.
 *
 * Segments on the exit side are those from the head up to (but not
 * including) the first unthreaded segment. Segments on the entry
 * side are the remaining unthreaded tail segments.
 */
export function computeSplitState(
  segments: readonly GridPos[],
  transit: PortalTransitState,
): SplitSnakeState {
  const totalBody = segments.length - 1;
  const remaining = transit.segmentsRemaining;

  if (remaining <= 0 || totalBody <= 0) {
    return {
      active: false,
      transit,
      exitSideIndices: [],
      entrySideIndices: [],
      progress: 1,
    };
  }

  // The threaded (exit side) segments are at the front: indices 0..(total - remaining - 1)
  // The unthreaded (entry side) segments are at the tail: indices (total - remaining)..total
  const firstEntryIdx = segments.length - remaining;
  const exitSideIndices: number[] = [];
  const entrySideIndices: number[] = [];

  for (let i = 0; i < segments.length; i++) {
    if (i < firstEntryIdx) {
      exitSideIndices.push(i);
    } else {
      entrySideIndices.push(i);
    }
  }

  const progress = 1 - remaining / totalBody;

  return {
    active: true,
    transit,
    exitSideIndices,
    entrySideIndices,
    progress,
  };
}
