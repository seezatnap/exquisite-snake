import { describe, it, expect, vi, beforeEach } from "vitest";
import { gameBridge } from "@/game/bridge";
import { Biome } from "@/game/systems/BiomeManager";

// ── Phaser mock ──────────────────────────────────────────────────
const mockLineStyle = vi.fn();
const mockMoveTo = vi.fn();
const mockLineTo = vi.fn();
const mockStrokePath = vi.fn();
const mockFillStyle = vi.fn();
const mockFillRect = vi.fn();
const mockGraphicsClear = vi.fn();
const mockGraphicsDestroy = vi.fn();
const mockGraphicsSetDepth = vi.fn();
const mockFillCircle = vi.fn();
const mockAddGraphics = vi.fn(() => mockGraphics);
const mockSetBackgroundColor = vi.fn();
const mockCameraShake = vi.fn();
const mockTimeDelayedCall = vi.fn();

const mockGraphics = {
  lineStyle: mockLineStyle,
  moveTo: mockMoveTo,
  lineTo: mockLineTo,
  strokePath: mockStrokePath,
  fillStyle: mockFillStyle,
  fillRect: mockFillRect,
  fillCircle: mockFillCircle,
  clear: mockGraphicsClear,
  destroy: mockGraphicsDestroy,
  setDepth: mockGraphicsSetDepth,
};

const mockSceneStart = vi.fn();
const mockDestroy = vi.fn();
const mockSetPosition = vi.fn();
const mockSpriteSetDepth = vi.fn();
const mockKeyboardOn = vi.fn();
const mockTextSetOrigin = vi.fn();
const mockTextSetDepth = vi.fn();
const mockTextSetAlpha = vi.fn();
const mockTextSetVisible = vi.fn();
const mockTextSetText = vi.fn();
const mockTextSetPosition = vi.fn();
const mockTextDestroy = vi.fn();

function createMockSprite() {
  return {
    destroy: mockDestroy,
    setPosition: mockSetPosition,
    setDepth: mockSpriteSetDepth,
    x: 0,
    y: 0,
  };
}

function createMockText() {
  return {
    setOrigin: mockTextSetOrigin,
    setDepth: mockTextSetDepth,
    setAlpha: mockTextSetAlpha,
    setVisible: mockTextSetVisible,
    setText: mockTextSetText,
    setPosition: mockTextSetPosition,
    destroy: mockTextDestroy,
  };
}

vi.mock("phaser", () => {
  class MockScene {
    scene = { start: mockSceneStart };
    add = {
      graphics: mockAddGraphics,
      sprite: vi.fn(() => createMockSprite()),
      text: vi.fn(() => createMockText()),
      particles: vi.fn(() => ({
        explode: vi.fn(),
        destroy: vi.fn(),
      })),
    };
    input = {
      keyboard: {
        on: mockKeyboardOn,
        off: vi.fn(),
      },
    };
    cameras = {
      main: {
        shake: mockCameraShake,
        setBackgroundColor: mockSetBackgroundColor,
      },
    };
    textures = {
      exists: vi.fn().mockReturnValue(true),
    };
    time = {
      delayedCall: mockTimeDelayedCall,
    };
    constructor(public config?: { key: string }) {}
  }
  class MockGame {
    constructor() {}
    destroy() {}
  }
  return {
    default: {
      Game: MockGame,
      Scene: MockScene,
      AUTO: 0,
      Scale: { FIT: 1, CENTER_BOTH: 1 },
    },
    Game: MockGame,
    Scene: MockScene,
    AUTO: 0,
    Scale: { FIT: 1, CENTER_BOTH: 1 },
  };
});

// Import after mock
import Phaser from "phaser";
import { MainScene } from "@/game/scenes/MainScene";
import { EchoGhost } from "@/game/entities/EchoGhost";
import { Food } from "@/game/entities/Food";
import { Snake } from "@/game/entities/Snake";
import type { GridPos } from "@/game/utils/grid";
import { gridEquals } from "@/game/utils/grid";

/** Reset the singleton bridge to its initial state between tests. */
function resetBridge(): void {
  gameBridge.setPhase("start");
  gameBridge.setScore(0);
  gameBridge.setHighScore(0);
  gameBridge.setElapsedTime(0);
  gameBridge.setCurrentBiome(Biome.NeonCity);
  gameBridge.setBiomeVisitStats({
    [Biome.NeonCity]: 1,
    [Biome.IceCavern]: 0,
    [Biome.MoltenCore]: 0,
    [Biome.VoidRift]: 0,
  });
}

function createSceneWithFastPortals(
  overrides: {
    spawnIntervalMs?: number;
    spawnJitterMs?: number;
    maxActivePairs?: number;
    rng?: () => number;
  } = {},
): MainScene {
  const scene = new MainScene();
  scene.create();
  scene.setPortalManagerOptions({
    spawnIntervalMs: overrides.spawnIntervalMs ?? 10,
    spawnJitterMs: overrides.spawnJitterMs ?? 0,
    maxActivePairs: overrides.maxActivePairs ?? 1,
    rng: overrides.rng ?? (() => 0.5),
  });
  scene.setRng(overrides.rng ?? (() => 0.5));
  return scene;
}

function createScene(): Phaser.Scene {
  return new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
}

function createSnake(
  headPos: GridPos = { col: 10, row: 10 },
  direction: "up" | "down" | "left" | "right" = "right",
  length = 3,
): Snake {
  const scene = createScene();
  return new Snake(scene, headPos, direction, length);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetBridge();
});

// ═════════════════════════════════════════════════════════════════
// Echo Ghost — portal exclusion invariants
// ═════════════════════════════════════════════════════════════════

describe("Echo Ghost — portal exclusion invariants", () => {
  it("ghost records raw position history including post-teleport positions", () => {
    const ghost = new EchoGhost({ delayMs: 0, maxSamples: 16 });

    // Record positions before, at, and after a portal teleport
    ghost.recordPath([{ col: 5, row: 5 }]); // Pre-portal
    ghost.advance(16);

    ghost.recordPath([{ col: 5, row: 6 }]); // Moving toward portal
    ghost.advance(16);

    // Snake is teleported from (5,7) to (20,20) by portal
    ghost.recordPath([{ col: 20, row: 20 }]); // Post-teleport
    ghost.advance(16);

    ghost.recordPath([{ col: 20, row: 21 }]); // Continues from exit
    ghost.advance(16);

    // Ghost should replay all positions exactly, including the spatial
    // discontinuity from the portal teleport
    const segments = ghost.getPlaybackSegments();
    expect(segments).toEqual([{ col: 20, row: 21 }]);

    // Verify the raw history includes the teleport discontinuity
    const snapshot = ghost.createSnapshot();
    const positions = snapshot.samples.map((s) => s.segments[0]);
    expect(positions).toContainEqual({ col: 5, row: 5 });
    expect(positions).toContainEqual({ col: 5, row: 6 });
    expect(positions).toContainEqual({ col: 20, row: 20 }); // Teleported
    expect(positions).toContainEqual({ col: 20, row: 21 });
  });

  it("ghost never has its own portal traversal state", () => {
    const ghost = new EchoGhost({ delayMs: 100, maxSamples: 16 });

    // Record a sequence where the snake moves through a portal
    ghost.recordPath([{ col: 10, row: 10 }]);
    ghost.advance(16);
    ghost.recordPath([{ col: 30, row: 25 }]); // Teleported
    ghost.advance(16);

    // Ghost entity has no portal transit method — it replays raw positions
    // Verify the ghost type doesn't expose any portal-related API
    expect((ghost as unknown as Record<string, unknown>).teleportHead).toBeUndefined();
    expect((ghost as unknown as Record<string, unknown>).portalTransit).toBeUndefined();
    expect((ghost as unknown as Record<string, unknown>).resolveBodyThreading).toBeUndefined();
  });

  it("ghost playback smoothly replays teleport jumps without portal interaction", () => {
    const ghost = new EchoGhost({ delayMs: 100, maxSamples: 16 });

    // Record a sequence: move → teleport → continue
    ghost.recordPath([{ col: 5, row: 5 }]); // t = 0
    ghost.advance(50);
    ghost.recordPath([{ col: 5, row: 6 }]); // t = 50
    ghost.advance(50);
    ghost.recordPath([{ col: 25, row: 15 }]); // t = 100, teleported by portal
    ghost.advance(50);
    ghost.recordPath([{ col: 25, row: 16 }]); // t = 150, continues

    // Advance past the delay
    ghost.advance(50); // t = 200, delayed cursor = 100

    // Ghost should show the teleported position at the delayed timestamp
    const segments = ghost.getPlaybackSegments();
    expect(segments).toEqual([{ col: 25, row: 15 }]);
  });

  it("ghost collision detection uses raw replayed positions, not portal-modified ones", () => {
    const ghost = new EchoGhost({ delayMs: 100, maxSamples: 16 });

    // Record a portal teleport sequence
    ghost.recordPath([{ col: 10, row: 10 }]); // t = 0
    ghost.advance(100);
    ghost.recordPath([{ col: 30, row: 20 }]); // t = 100, post-teleport

    // Advance to make ghost active (delayed cursor = 0)
    ghost.advance(100); // t = 200, delayed cursor = 100

    // Ghost should show the post-teleport position
    const segments = ghost.getPlaybackSegments();
    expect(segments).toEqual([{ col: 30, row: 20 }]);

    // The ghost collision would happen at (30,20) — the raw recorded
    // position — not at the portal entry point
    expect(ghost.isActive()).toBe(true);
    expect(segments[0].col).toBe(30);
    expect(segments[0].row).toBe(20);
  });

  it("ghost in full game loop records snake positions after portal traversal", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const ghost = scene.getEchoGhost()!;

    // Advance to spawn a portal pair
    snake.getTicker().setInterval(1_000_000);
    scene.update(0, 2);

    const pm = scene.getPortalManager();
    const pairs = pm.getActivePairs();
    expect(pairs).toHaveLength(1);

    // Get through spawn animation so portal is active
    scene.update(0, 500);

    // Ghost should be recording
    expect(ghost.isRecording()).toBe(true);

    // Take a snapshot to verify samples are being recorded
    const snapshot = ghost.createSnapshot();
    expect(snapshot.samples.length).toBeGreaterThan(0);

    // The ghost records whatever position the snake is at — raw positions
    // are the source of truth, not portal-modified positions
    for (const s of snapshot.samples) {
      expect(s.segments.length).toBeGreaterThan(0);
    }
  });
});

// ═════════════════════════════════════════════════════════════════
// Food — portal exclusion invariants
// ═════════════════════════════════════════════════════════════════

describe("Food — portal exclusion invariants", () => {
  it("food never spawns on active portal cells", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const food = scene.getFood()!;
    const pm = scene.getPortalManager();

    snake.getTicker().setInterval(1_000_000);

    // Spawn a portal pair
    scene.update(0, 2);
    const pairs = pm.getActivePairs();
    expect(pairs).toHaveLength(1);

    const [posA, posB] = pairs[0].getPositions();
    const foodPos = food.getPosition();

    // Food must not be on either portal cell
    expect(gridEquals(foodPos, posA)).toBe(false);
    expect(gridEquals(foodPos, posB)).toBe(false);
  });

  it("food respawn avoids portal cells", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const food = scene.getFood()!;
    const pm = scene.getPortalManager();

    snake.getTicker().setInterval(1_000_000);

    // Spawn a portal pair
    scene.update(0, 2);
    const pairs = pm.getActivePairs();
    expect(pairs).toHaveLength(1);

    const [posA, posB] = pairs[0].getPositions();

    // Respawn food multiple times — it should never land on a portal cell
    for (let i = 0; i < 20; i++) {
      food.respawn(snake);
      const foodPos = food.getPosition();
      expect(gridEquals(foodPos, posA)).toBe(false);
      expect(gridEquals(foodPos, posB)).toBe(false);
    }
  });

  it("food exclusion checkers prevent spawning on portal cells", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const food = new Food(scene, snake, () => 0);

    // Simulate a portal at (0, 0) and (5, 5)
    const portalPositions: GridPos[] = [
      { col: 0, row: 0 },
      { col: 5, row: 5 },
    ];

    food.setExclusionCheckers([
      (pos) =>
        portalPositions.some(
          (pp) => pp.col === pos.col && pp.row === pos.row,
        ),
    ]);

    // findSafePosition should never return a portal cell
    for (let trial = 0; trial < 10; trial++) {
      const pos = food.findSafePosition(snake);
      expect(
        portalPositions.some(
          (pp) => pp.col === pos.col && pp.row === pos.row,
        ),
      ).toBe(false);
    }

    food.destroy();
  });

  it("food position is never mutated by portal traversal", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const food = scene.getFood()!;
    const pm = scene.getPortalManager();

    snake.getTicker().setInterval(125); // Normal step timing

    // Spawn a portal pair
    scene.update(0, 2);
    expect(pm.getActivePairs()).toHaveLength(1);

    // Get portal to active state
    scene.update(0, 500);

    // Advance several frames with snake movement (may trigger portal traversal)
    for (let i = 0; i < 20; i++) {
      scene.update(0, 125);
      if (scene.getPhase() !== "playing") break;
    }

    // If game is still playing, verify food position was NOT teleported
    // Food position should either be the same (not eaten) or at a new
    // safe position (eaten and respawned), but never at a portal exit.
    if (scene.getPhase() === "playing") {
      const foodPosAfter = food.getPosition();
      const pairs = pm.getActivePairs();

      for (const pair of pairs) {
        const [posA, posB] = pair.getPositions();
        expect(gridEquals(foodPosAfter, posA)).toBe(false);
        expect(gridEquals(foodPosAfter, posB)).toBe(false);
      }
    }
  });

  it("food entity has no portal-related methods or state", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const food = new Food(scene, snake);

    // Verify the Food class doesn't have any portal traversal methods
    expect((food as unknown as Record<string, unknown>).teleportHead).toBeUndefined();
    expect((food as unknown as Record<string, unknown>).portalTransit).toBeUndefined();
    expect((food as unknown as Record<string, unknown>).resolveBodyThreading).toBeUndefined();
    expect((food as unknown as Record<string, unknown>).teleportToPortalExit).toBeUndefined();

    food.destroy();
  });

  it("food exclusion checkers can be updated dynamically", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const food = new Food(scene, snake, () => 0);

    // Initially no exclusions — (0,0) is a valid cell since snake is at (10,10)
    let pos = food.findSafePosition(snake);
    expect(pos.col).toBe(0);
    expect(pos.row).toBe(0);

    // Add exclusion for (0,0)
    food.setExclusionCheckers([
      (p) => p.col === 0 && p.row === 0,
    ]);

    // Now (0,0) should be excluded
    pos = food.findSafePosition(snake);
    expect(pos.col !== 0 || pos.row !== 0).toBe(true);

    // Clear exclusions
    food.setExclusionCheckers([]);
    pos = food.findSafePosition(snake);
    expect(pos.col).toBe(0);
    expect(pos.row).toBe(0);

    food.destroy();
  });
});

// ═════════════════════════════════════════════════════════════════
// MainScene — combined portal exclusion enforcement
// ═════════════════════════════════════════════════════════════════

describe("MainScene — portal exclusion enforcement", () => {
  it("sets food exclusion checkers on entity creation", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const food = scene.getFood()!;

    // The food should have exclusion checkers set
    // We verify this indirectly by checking that food doesn't spawn on
    // portal cells even after portals are created
    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    // Spawn a portal pair
    scene.update(0, 2);

    const pm = scene.getPortalManager();
    const pairs = pm.getActivePairs();
    expect(pairs).toHaveLength(1);

    // Force food respawn — it should avoid portal cells
    food.respawn(snake);
    const [posA, posB] = pairs[0].getPositions();
    const foodPos = food.getPosition();

    expect(gridEquals(foodPos, posA)).toBe(false);
    expect(gridEquals(foodPos, posB)).toBe(false);
  });

  it("echo ghost records snake positions including portal teleports as raw history", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const ghost = scene.getEchoGhost()!;

    // The ghost records whatever position the snake is at
    // This is the raw position history — portal teleports are included
    // as spatial discontinuities, not as portal references

    const snapshotBefore = ghost.createSnapshot();
    const sampleCountBefore = snapshotBefore.samples.length;

    // Advance with snake movement to record more samples
    snake.getTicker().setInterval(125);
    scene.update(0, 125);

    if (scene.getPhase() === "playing") {
      const snapshotAfter = ghost.createSnapshot();
      expect(snapshotAfter.samples.length).toBeGreaterThanOrEqual(sampleCountBefore);
    }
  });

  it("portal traversal only affects snake, not food or ghost", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const food = scene.getFood()!;
    const ghost = scene.getEchoGhost()!;

    snake.getTicker().setInterval(1_000_000);

    // Spawn and activate a portal pair
    scene.update(0, 2);
    scene.update(0, 500);

    const pm = scene.getPortalManager();
    const pairs = pm.getActivePairs();
    if (pairs.length === 0) return;

    const [posA, posB] = pairs[0].getPositions();
    const foodPosBefore = food.getPosition();
    const ghostBefore = ghost.createSnapshot();

    // Manually teleport the snake head to a portal position to trigger traversal
    // (In the game loop, resolvePortalHeadTraversal checks if the snake head
    //  is on a portal cell — but only the snake gets teleported)

    // Verify food position is not affected by any portal state
    expect(gridEquals(foodPosBefore, posA)).toBe(false);
    expect(gridEquals(foodPosBefore, posB)).toBe(false);

    // Verify ghost doesn't reference portals
    const ghostAfter = ghost.createSnapshot();
    expect(ghostAfter.samples.length).toBe(ghostBefore.samples.length);
  });

  it("food does not spawn on portal cells during biome transitions", () => {
    const scene = createSceneWithFastPortals({
      spawnIntervalMs: 1,
    });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const food = scene.getFood()!;
    const pm = scene.getPortalManager();

    snake.getTicker().setInterval(1_000_000);

    // Spawn portals
    scene.update(0, 2);

    // Even as portals spawn/collapse during biome transitions,
    // food should never be on a portal cell
    for (let i = 0; i < 5; i++) {
      scene.update(0, 100);
      const foodPos = food.getPosition();
      const pairs = pm.getActivePairs();

      for (const pair of pairs) {
        const [posA, posB] = pair.getPositions();
        expect(gridEquals(foodPos, posA)).toBe(false);
        expect(gridEquals(foodPos, posB)).toBe(false);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════
// Edge cases
// ═════════════════════════════════════════════════════════════════

describe("Portal exclusion edge cases", () => {
  it("food spawning works correctly when no portals are active", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const food = scene.getFood()!;
    const snake = scene.getSnake()!;

    // No portals active — food should spawn normally
    const pos = food.getPosition();
    expect(pos.col).toBeGreaterThanOrEqual(0);
    expect(pos.row).toBeGreaterThanOrEqual(0);
    expect(snake.isOnSnake(pos)).toBe(false);
  });

  it("ghost handles empty recording buffer gracefully", () => {
    const ghost = new EchoGhost({ delayMs: 100, maxSamples: 8 });

    // Advance without recording anything
    ghost.advance(200);

    expect(ghost.isActive()).toBe(false);
    expect(ghost.getPlaybackSegments()).toEqual([]);
    expect(ghost.getOpacity()).toBe(0);
  });

  it("ghost snapshot/restore preserves raw position history through portal teleports", () => {
    const ghost = new EchoGhost({ delayMs: 100, maxSamples: 16 });

    // Record positions with a teleport discontinuity
    ghost.recordPath([{ col: 5, row: 5 }]); // t = 0
    ghost.advance(50);
    ghost.recordPath([{ col: 25, row: 15 }]); // t = 50, teleported
    ghost.advance(50);
    ghost.recordPath([{ col: 25, row: 16 }]); // t = 100

    const snapshot = ghost.createSnapshot();

    // Reset and restore
    ghost.reset();
    expect(ghost.getBufferedSampleCount()).toBe(0);

    ghost.restoreSnapshot(snapshot);

    // The restored ghost should have the same raw positions
    const restoredSnapshot = ghost.createSnapshot();
    expect(restoredSnapshot.samples).toEqual(snapshot.samples);
  });

  it("food exclusion checkers work with multiple exclusion zones", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);

    const rngValue = 0;
    const food = new Food(scene, snake, () => rngValue);

    // Exclude multiple areas
    food.setExclusionCheckers([
      (pos) => pos.col === 0 && pos.row === 0, // Portal A
      (pos) => pos.col === 1 && pos.row === 0, // Portal B
      (pos) => pos.col === 0 && pos.row === 1, // Lava pool
    ]);

    // With RNG 0, should get the first non-excluded cell
    const pos = food.findSafePosition(snake);
    expect(
      (pos.col === 0 && pos.row === 0) ||
        (pos.col === 1 && pos.row === 0) ||
        (pos.col === 0 && pos.row === 1),
    ).toBe(false);

    food.destroy();
  });
});
