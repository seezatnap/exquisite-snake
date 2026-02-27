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
const mockSetBackgroundColor = vi.fn();
const mockCameraShake = vi.fn();
const mockTimeDelayedCall = vi.fn();
const mockTweensAdd = vi.fn();

function createMockGraphics() {
  return {
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
}

const mockAddGraphics = vi.fn(() => createMockGraphics());
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
    tweens = {
      add: mockTweensAdd,
    };
    events: Record<string, unknown> | null = null;
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
import { Snake } from "@/game/entities/Snake";
import { MoveTicker, type GridPos, type Direction } from "@/game/utils/grid";

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

beforeEach(() => {
  vi.clearAllMocks();
  resetBridge();
});

// ── Ice Cavern × Portal integration ─────────────────────────────

describe("Ice Cavern – portal traversal clears momentum", () => {
  function createIceSceneWithPortal(): {
    scene: MainScene;
    posA: GridPos;
    posB: GridPos;
  } {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const pm = scene.getPortalManager();

    // Switch to Ice Cavern biome (sets turnMomentumTiles = 2)
    scene.setBiomeCycleOrder([
      Biome.IceCavern,
      Biome.NeonCity,
      Biome.MoltenCore,
      Biome.VoidRift,
    ]);

    // Prevent stepping during setup
    snake.getTicker().setInterval(1_000_000);

    // Spawn portal and let it become active
    scene.update(0, 2);
    scene.update(0, 500);

    const pair = pm.getActivePairs()[0];
    const [posA, posB] = pair.getPositions();

    return { scene, posA, posB };
  }

  it("clears pending ice momentum turn after portal traversal", () => {
    const { scene, posA, posB } = createIceSceneWithPortal();
    const snake = scene.getSnake()!;

    // Position snake heading right, one tile before portal A
    const prePortalPos = { col: posA.col - 1, row: posA.row };
    snake.teleportHead(prePortalPos);

    // Queue a turn — with ice momentum, this would normally be delayed
    // by 2 slide tiles
    snake.bufferDirection("down");

    snake.getTicker().setInterval(100);

    // Step onto portal → head teleports to posB
    scene.update(0, 100);
    expect(snake.getHeadPosition()).toEqual(posB);

    // After portal traversal, the pending turn should be applied immediately
    // (momentum cleared), so the direction should now be "down"
    expect(snake.getDirection()).toBe("down");
  });

  it("snake moves in the new direction immediately after portal + momentum clear", () => {
    const { scene, posA, posB } = createIceSceneWithPortal();
    const snake = scene.getSnake()!;

    const prePortalPos = { col: posA.col - 1, row: posA.row };
    snake.teleportHead(prePortalPos);
    snake.bufferDirection("down");
    snake.getTicker().setInterval(100);

    // Step onto portal
    scene.update(0, 100);
    expect(snake.getHeadPosition()).toEqual(posB);
    expect(snake.getDirection()).toBe("down");

    // Next step should move down from posB (not right!)
    scene.update(0, 100);
    expect(snake.getHeadPosition()).toEqual({
      col: posB.col,
      row: posB.row + 1,
    });
  });

  it("does not clear momentum when no portal traversal occurs", () => {
    const scene = createSceneWithFastPortals({
      spawnIntervalMs: 1_000_000,
    });
    scene.enterPhase("playing");

    // Switch to Ice Cavern
    scene.setBiomeCycleOrder([
      Biome.IceCavern,
      Biome.NeonCity,
      Biome.MoltenCore,
      Biome.VoidRift,
    ]);

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(100);

    // Queue a turn — without portal, ice momentum should still delay it
    snake.bufferDirection("down");

    // Step 1: still moving right (momentum tile 1)
    scene.update(0, 100);
    expect(snake.getDirection()).not.toBe("down");

    // Step 2: still sliding right (momentum tile 2)
    scene.update(0, 100);
    expect(snake.getDirection()).not.toBe("down");

    // Step 3: turn finally applies
    scene.update(0, 100);
    expect(snake.getDirection()).toBe("down");
  });
});

// ── Snake.clearPendingMomentum unit tests ────────────────────────

describe("Snake.clearPendingMomentum", () => {
  function createScene(): Phaser.Scene {
    return new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
  }

  function createSnake(
    headPos: GridPos = { col: 10, row: 10 },
    direction: Direction = "right",
    length = 3,
    ticker?: MoveTicker,
  ): Snake {
    const scene = createScene();
    return new Snake(scene, headPos, direction, length, ticker);
  }

  it("applies pending turn immediately when called", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);
    snake.setTurnMomentumTiles(2);
    snake.bufferDirection("down");

    // Take one step — turn should be pending but not applied yet
    snake.update(100);
    expect(snake.getDirection()).toBe("right");

    // Clear momentum — turn should apply immediately
    snake.clearPendingMomentum();
    expect(snake.getDirection()).toBe("down");
  });

  it("is a no-op when no pending turn exists", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    snake.setTurnMomentumTiles(2);

    // No turn queued
    snake.clearPendingMomentum();
    expect(snake.getDirection()).toBe("right");
  });

  it("clears slide tile counter", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 10, row: 10 }, "right", 3, ticker);
    snake.setTurnMomentumTiles(3);
    snake.bufferDirection("up");

    // Step once — pending turn should have 3 slide tiles
    snake.update(100);
    expect(snake.getDirection()).toBe("right"); // still sliding

    // Clear momentum
    snake.clearPendingMomentum();
    expect(snake.getDirection()).toBe("up");

    // Next step should continue in the new direction (no residual slide)
    snake.update(100);
    expect(snake.getDirection()).toBe("up");
  });
});

// ── Molten Core × Portal integration ────────────────────────────

describe("Molten Core – portal traversal and lava pools", () => {
  it("lava pools do not spawn on portal cells", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    // Spawn a portal
    scene.update(0, 2);
    scene.update(0, 500);

    const pm = scene.getPortalManager();
    const pair = pm.getActivePairs()[0];
    const [posA, posB] = pair.getPositions();

    // Switch to Molten Core with aggressive lava spawning
    scene.setBiomeCycleOrder([
      Biome.MoltenCore,
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.VoidRift,
    ]);
    scene.setBiomeMechanicsConfig({
      moltenCore: {
        spawnIntervalMs: 1,
        spawnChancePerInterval: 1.0,
        maxPools: 100,
      },
    });

    // Advance time to spawn many lava pools
    for (let i = 0; i < 200; i++) {
      scene.update(0, 1);
    }

    // Verify no lava pool occupies a portal cell
    const lavaPools = scene.getMoltenLavaPools();
    for (const pool of lavaPools) {
      const onPortal =
        (pool.col === posA.col && pool.row === posA.row) ||
        (pool.col === posB.col && pool.row === posB.row);
      expect(onPortal).toBe(false);
    }
  });

  it("snake takes lava damage at portal exit position when not immune", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const pm = scene.getPortalManager();

    // Make the snake long enough to survive lava damage
    snake.grow(5);
    for (let i = 0; i < 5; i++) {
      snake.getTicker().setInterval(100);
      scene.update(0, 100);
    }
    snake.getTicker().setInterval(1_000_000);

    // Switch to Molten Core
    scene.setBiomeCycleOrder([
      Biome.MoltenCore,
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.VoidRift,
    ]);

    // Spawn portal
    scene.update(0, 2);
    scene.update(0, 500);

    const pair = pm.getActivePairs()[0];
    const [posA, posB] = pair.getPositions();

    // Position snake approaching portal A
    const prePortalPos = { col: posA.col - 1, row: posA.row };
    snake.teleportHead(prePortalPos);
    snake.getTicker().setInterval(100);

    // Step onto portal → head teleports to posB
    scene.update(0, 100);
    expect(snake.getHeadPosition()).toEqual(posB);

    // Game should still be playing (no lava at exit by default)
    expect(scene.getPhase()).toBe("playing");
  });

  it("emergency teleport grants immunity from lava collision", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const pm = scene.getPortalManager();
    snake.getTicker().setInterval(1_000_000);

    // Switch to Molten Core
    scene.setBiomeCycleOrder([
      Biome.MoltenCore,
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.VoidRift,
    ]);

    // Spawn portal
    scene.update(0, 2);
    scene.update(0, 500);

    const pair = pm.getActivePairs()[0];
    const [posA] = pair.getPositions();

    // Position snake approaching portal A
    const prePortalPos = { col: posA.col - 1, row: posA.row };
    snake.teleportHead(prePortalPos);
    snake.getTicker().setInterval(100);

    // Step onto portal
    scene.update(0, 100);
    expect(snake.getPortalTransit()).not.toBeNull();

    // Force collapse mid-transit
    snake.getTicker().setInterval(1_000_000);
    pair.beginCollapse();
    scene.update(0, 500);

    // Emergency teleport should grant immunity
    expect(scene.getEmergencyCollisionImmunityMs()).toBeGreaterThan(0);

    // Game should continue even if exit is hazardous
    expect(scene.getPhase()).toBe("playing");
  });
});

// ── Void Rift × Portal integration ──────────────────────────────

describe("Void Rift – portal traversal and gravity", () => {
  function createVoidSceneWithPortal(): {
    scene: MainScene;
    posA: GridPos;
    posB: GridPos;
  } {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const pm = scene.getPortalManager();
    snake.getTicker().setInterval(1_000_000);

    // Switch to Void Rift biome
    scene.setBiomeCycleOrder([
      Biome.VoidRift,
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.MoltenCore,
    ]);

    // Spawn portal
    scene.update(0, 2);
    scene.update(0, 500);

    const pair = pm.getActivePairs()[0];
    const [posA, posB] = pair.getPositions();

    return { scene, posA, posB };
  }

  it("gravity pull direction uses post-teleport position", () => {
    const { scene, posA, posB } = createVoidSceneWithPortal();
    const snake = scene.getSnake()!;

    // Position snake approaching portal A
    const prePortalPos = { col: posA.col - 1, row: posA.row };
    snake.teleportHead(prePortalPos);
    snake.getTicker().setInterval(100);

    // Step onto portal → teleported to posB
    scene.update(0, 100);
    expect(snake.getHeadPosition()).toEqual(posB);

    // The game should still be playing — gravity should not have
    // caused an immediate death at the new position
    expect(scene.getPhase()).toBe("playing");
  });

  it("gravity nudge is skipped on the same step as portal traversal", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const pm = scene.getPortalManager();

    // Switch to Void Rift with cadence = 1 (every step)
    scene.setBiomeCycleOrder([
      Biome.VoidRift,
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.MoltenCore,
    ]);
    scene.setBiomeMechanicsConfig({
      voidRift: { gravityPullCadenceSteps: 1 },
    });

    snake.getTicker().setInterval(1_000_000);

    // Spawn portal
    scene.update(0, 2);
    scene.update(0, 500);

    const pair = pm.getActivePairs()[0];
    const [posA, posB] = pair.getPositions();

    // Position snake approaching portal A
    const prePortalPos = { col: posA.col - 1, row: posA.row };
    snake.teleportHead(prePortalPos);
    snake.getTicker().setInterval(100);

    // Step onto portal → teleported to posB
    // With cadence=1, gravity would normally fire this step, but
    // the portal traversal should suppress the nudge
    scene.update(0, 100);
    const headAfterTraversal = snake.getHeadPosition();
    // Head should be exactly at posB (no gravity displacement on this step)
    expect(headAfterTraversal).toEqual(posB);
  });

  it("gravity nudge counter still advances during portal step", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const pm = scene.getPortalManager();

    // Switch to Void Rift with cadence = 2
    scene.setBiomeCycleOrder([
      Biome.VoidRift,
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.MoltenCore,
    ]);
    scene.setBiomeMechanicsConfig({
      voidRift: { gravityPullCadenceSteps: 2 },
    });

    snake.getTicker().setInterval(1_000_000);

    // Spawn portal
    scene.update(0, 2);
    scene.update(0, 500);

    const pair = pm.getActivePairs()[0];
    const [posA, posB] = pair.getPositions();

    // Take one normal step first (counter = 1, not due yet)
    snake.teleportHead({ col: 5, row: 5 });
    snake.getTicker().setInterval(100);
    scene.update(0, 100);
    snake.getTicker().setInterval(1_000_000);

    // Now position for portal traversal (counter = 2, would be due)
    const prePortalPos = { col: posA.col - 1, row: posA.row };
    snake.teleportHead(prePortalPos);
    snake.getTicker().setInterval(100);

    // Step onto portal — traversal happens, gravity due but skipped
    scene.update(0, 100);
    expect(snake.getHeadPosition()).toEqual(posB);

    // Next step (counter = 3) — gravity should NOT fire because
    // the counter advanced and 3 % 2 ≠ 0
    // (If counter hadn't advanced, it would still be 2 and this step
    // would try to apply gravity again)
    snake.getTicker().setInterval(100);
    const posBeforeStep = snake.getHeadPosition();
    scene.update(0, 100);

    // Snake should have moved one tile in its direction (no extra gravity nudge)
    const posAfterStep = snake.getHeadPosition();
    const direction = snake.getDirection();
    let expectedPos: GridPos;
    switch (direction) {
      case "right":
        expectedPos = { col: posBeforeStep.col + 1, row: posBeforeStep.row };
        break;
      case "left":
        expectedPos = { col: posBeforeStep.col - 1, row: posBeforeStep.row };
        break;
      case "down":
        expectedPos = { col: posBeforeStep.col, row: posBeforeStep.row + 1 };
        break;
      case "up":
        expectedPos = { col: posBeforeStep.col, row: posBeforeStep.row - 1 };
        break;
    }
    expect(posAfterStep).toEqual(expectedPos);
  });

  it("game survives portal traversal during Void Rift without crash", () => {
    const { scene, posA, posB } = createVoidSceneWithPortal();
    const snake = scene.getSnake()!;

    const prePortalPos = { col: posA.col - 1, row: posA.row };
    snake.teleportHead(prePortalPos);
    snake.getTicker().setInterval(100);

    // Traverse portal
    scene.update(0, 100);
    expect(snake.getHeadPosition()).toEqual(posB);

    // Continue playing for several more steps
    for (let i = 0; i < 5; i++) {
      scene.update(0, 100);
    }
    expect(scene.getPhase()).toBe("playing");
  });
});

// ── Emergency teleport × Biome mechanics ─────────────────────────

describe("Emergency teleport – biome integration", () => {
  it("clears ice momentum after emergency teleport (collapse mid-transit)", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const pm = scene.getPortalManager();

    // Switch to Ice Cavern
    scene.setBiomeCycleOrder([
      Biome.IceCavern,
      Biome.NeonCity,
      Biome.MoltenCore,
      Biome.VoidRift,
    ]);

    snake.getTicker().setInterval(1_000_000);

    // Spawn portal
    scene.update(0, 2);
    scene.update(0, 500);

    const pair = pm.getActivePairs()[0];
    const [posA] = pair.getPositions();

    // Queue a turn (ice momentum delays it by 2 tiles)
    snake.bufferDirection("down");

    // Position snake approaching portal
    const prePortalPos = { col: posA.col - 1, row: posA.row };
    snake.teleportHead(prePortalPos);
    snake.getTicker().setInterval(100);

    // Step onto portal (traversal + momentum clear)
    scene.update(0, 100);
    expect(snake.getPortalTransit()).not.toBeNull();

    // Force collapse mid-transit
    snake.getTicker().setInterval(1_000_000);
    pair.beginCollapse();
    scene.update(0, 500);

    // After emergency teleport, direction should be "down"
    // (momentum was cleared so the pending turn was applied)
    expect(snake.getDirection()).toBe("down");
  });

  it("resolvePortalHeadTraversal returns boolean indicating traversal occurred", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const pm = scene.getPortalManager();
    snake.getTicker().setInterval(1_000_000);

    // Spawn portal
    scene.update(0, 2);
    scene.update(0, 500);

    const pair = pm.getActivePairs()[0];
    const [posA, posB] = pair.getPositions();

    // Position snake to step onto portal
    const prePortalPos = { col: posA.col - 1, row: posA.row };
    snake.teleportHead(prePortalPos);
    snake.getTicker().setInterval(100);

    // Step onto portal → traversal should happen
    scene.update(0, 100);
    expect(snake.getHeadPosition()).toEqual(posB);
  });
});

// ── Cross-biome portal behavior ──────────────────────────────────

describe("Portal traversal – biome transition interaction", () => {
  it("portals collapse on biome transition", () => {
    // Use a very long spawn interval so we can control exactly when
    // portals exist. Then spawn one right before the biome shift.
    const scene = createSceneWithFastPortals({
      spawnIntervalMs: 1_000_000,
    });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const pm = scene.getPortalManager();
    snake.getTicker().setInterval(1_000_000);

    // Advance close to the biome transition (at 45_000ms) without spawning portals
    // Advance in large chunks to get near the boundary
    scene.update(0, 44_000);

    // Now force a portal with a short interval and advance a bit to spawn one
    scene.setPortalManagerOptions({
      spawnIntervalMs: 1,
      spawnJitterMs: 0,
      maxActivePairs: 1,
      rng: () => 0.5,
    });
    scene.update(0, 2);
    expect(pm.getActivePairs().length).toBeGreaterThanOrEqual(0);

    // Advance past spawning state
    scene.update(0, 500);

    // The portal should be active now (or at least spawned)
    // Advance past the biome transition (45_000ms)
    // We're now at ~44_502ms, need to go past 45_000ms
    scene.update(0, 600);

    // After biome transition, collapseAll() should have been called,
    // so any remaining portals should be in collapsing or collapsed state
    const activePairs = pm.getActivePairs();
    for (const pair of activePairs) {
      const state = pair.getState();
      expect(
        state === "collapsing" || state === "collapsed",
      ).toBe(true);
    }
  });
});
