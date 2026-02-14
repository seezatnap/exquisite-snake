import type { GridPos } from "../utils/grid";

export enum ParasiteType {
  Magnet = "magnet",
  Shield = "shield",
  Splitter = "splitter",
}

/** Max number of attached parasite segments at any point in a run. */
export const PARASITE_MAX_SEGMENTS = 3;

/** Manhattan radius used by magnet pull checks. */
export const PARASITE_MAGNET_RADIUS_TILES = 2;

/** Per-segment speed bonus applied while magnet segments are attached. */
export const PARASITE_MAGNET_SPEED_BONUS_PER_SEGMENT = 0.1;

/** Spawn cadence for splitter-generated obstacles. */
export const PARASITE_SPLITTER_INTERVAL_MS = 10_000;

/** Shared texture key reserved for parasite pickup rendering. */
export const PARASITE_PICKUP_TEXTURE_KEY = "parasite-pickup";

/** Type-level tint values for rendering parasite pickups/overlays. */
export const PARASITE_COLOR_BY_TYPE: Record<ParasiteType, number> = {
  [ParasiteType.Magnet]: 0xf5c542,
  [ParasiteType.Shield]: 0x4cf5ff,
  [ParasiteType.Splitter]: 0x58f78a,
};

/** Small icon IDs used by HUD/inventory overlays. */
export const PARASITE_ICON_BY_TYPE: Record<ParasiteType, string> = {
  [ParasiteType.Magnet]: "magnet",
  [ParasiteType.Shield]: "shield",
  [ParasiteType.Splitter]: "splitter",
};

export interface ParasitePickupState {
  id: string;
  type: ParasiteType;
  position: GridPos;
  spawnedAtMs: number;
}

export interface ParasiteSegmentState {
  id: string;
  type: ParasiteType;
  attachedAtMs: number;
  sourcePickupId: string | null;
}

export interface ParasiteObstacleState {
  id: string;
  position: GridPos;
  spawnedAtMs: number;
  sourceSegmentId: string | null;
}

export interface ParasiteInventoryState {
  maxSegments: number;
  segments: ParasiteSegmentState[];
}

export interface ParasiteEchoGhostPolicy {
  ignoresPickups: boolean;
  ignoresObstacles: boolean;
  ignoresParasiteEffects: boolean;
}

/**
 * Echo ghost remains isolated from parasite mechanics:
 * - no pickup/obstacle collision
 * - no magnet/shield/splitter effect application
 */
export const PARASITE_ECHO_GHOST_POLICY: ParasiteEchoGhostPolicy = Object.freeze(
  {
    ignoresPickups: true,
    ignoresObstacles: true,
    ignoresParasiteEffects: true,
  },
);

export interface ParasiteSnapshot extends ParasitePickupState {
  consumed: boolean;
}

let parasiteIdSequence = 0;

function createParasiteId(): string {
  parasiteIdSequence += 1;
  return `parasite-${parasiteIdSequence}`;
}

/**
 * Scaffold pickup entity used by ParasiteManager.
 *
 * Rendering/spawn cadence behavior is intentionally deferred to later tasks.
 */
export class Parasite {
  private readonly id: string;
  private readonly type: ParasiteType;
  private readonly spawnedAtMs: number;
  private position: GridPos;
  private consumed = false;

  constructor(
    type: ParasiteType,
    position: GridPos,
    spawnedAtMs: number = 0,
    id: string = createParasiteId(),
  ) {
    this.id = id;
    this.type = type;
    this.position = { ...position };
    this.spawnedAtMs = Math.max(0, Math.floor(spawnedAtMs));
  }

  getId(): string {
    return this.id;
  }

  getType(): ParasiteType {
    return this.type;
  }

  getPosition(): GridPos {
    return { ...this.position };
  }

  setPosition(nextPosition: GridPos): void {
    this.position = { ...nextPosition };
  }

  getSpawnedAtMs(): number {
    return this.spawnedAtMs;
  }

  isConsumed(): boolean {
    return this.consumed;
  }

  markConsumed(): void {
    this.consumed = true;
  }

  toPickupState(): ParasitePickupState {
    return {
      id: this.id,
      type: this.type,
      position: this.getPosition(),
      spawnedAtMs: this.spawnedAtMs,
    };
  }

  toSnapshot(): ParasiteSnapshot {
    return {
      ...this.toPickupState(),
      consumed: this.consumed,
    };
  }
}

/**
 * Test helper for deterministic entity IDs.
 * No gameplay code should call this.
 */
export function resetParasiteIdSequenceForTests(): void {
  parasiteIdSequence = 0;
}
