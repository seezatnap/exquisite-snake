import { ARENA_WIDTH, ARENA_HEIGHT, TILE_SIZE } from "../config";

// ── Types ─────────────────────────────────────────────────────────

/** Pixel dimensions for canvas display. */
export interface CanvasSize {
  width: number;
  height: number;
}

// ── Constants ─────────────────────────────────────────────────────

/** The arena's design aspect ratio (width / height). */
export const ARENA_ASPECT_RATIO = ARENA_WIDTH / ARENA_HEIGHT;

/**
 * Minimum display size — the canvas will not be scaled below this
 * so the game remains playable on small screens.
 */
export const MIN_CANVAS_WIDTH = 280;
export const MIN_CANVAS_HEIGHT = MIN_CANVAS_WIDTH / ARENA_ASPECT_RATIO;

/** Padding (in CSS pixels) reserved around the canvas for UI chrome. */
export const CANVAS_PADDING = 16;

// ── Sizing logic ──────────────────────────────────────────────────

/**
 * Compute the largest canvas size that fits within the given container
 * dimensions while preserving the arena aspect ratio.
 *
 * The result is snapped down to the nearest multiple of `TILE_SIZE` on
 * each axis so grid lines remain crisp and tiles map to whole-pixel
 * boundaries.  A minimum size floor prevents the game from becoming
 * unusably tiny.
 *
 * @param containerWidth  Available width in CSS pixels
 * @param containerHeight Available height in CSS pixels
 * @returns Canvas display dimensions (width, height)
 */
export function computeCanvasSize(
  containerWidth: number,
  containerHeight: number,
): CanvasSize {
  // Clamp inputs to at least 1 to avoid division-by-zero / negative sizes
  const cw = Math.max(1, containerWidth);
  const ch = Math.max(1, containerHeight);

  let width: number;
  let height: number;

  // Fit to the most-constrained axis
  if (cw / ch > ARENA_ASPECT_RATIO) {
    // Container is wider than the arena ratio → height is the constraint
    height = ch;
    width = height * ARENA_ASPECT_RATIO;
  } else {
    // Container is taller or exact → width is the constraint
    width = cw;
    height = width / ARENA_ASPECT_RATIO;
  }

  // Snap to tile-size multiples for crisp grid rendering
  width = Math.floor(width / TILE_SIZE) * TILE_SIZE;
  height = Math.floor(height / TILE_SIZE) * TILE_SIZE;

  // Enforce minimum playable size
  width = Math.max(width, MIN_CANVAS_WIDTH);
  height = Math.max(height, MIN_CANVAS_HEIGHT);

  return { width, height };
}

/**
 * Compute the available container size for the game canvas, given the
 * full viewport dimensions and padding.
 *
 * @param viewportWidth  Window inner width
 * @param viewportHeight Window inner height
 * @param padding        Pixel padding on each side (default: CANVAS_PADDING)
 */
export function viewportToContainer(
  viewportWidth: number,
  viewportHeight: number,
  padding: number = CANVAS_PADDING,
): CanvasSize {
  return {
    width: Math.max(1, viewportWidth - padding * 2),
    height: Math.max(1, viewportHeight - padding * 2),
  };
}
