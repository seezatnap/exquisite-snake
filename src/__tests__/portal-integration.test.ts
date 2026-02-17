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
import { MainScene } from "@/game/scenes/MainScene";
import { PortalManager } from "@/game/systems/PortalManager";

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

/**
 * Helper: create a scene with a fast portal spawn interval configured
 * before the run starts, so the PortalManager picks it up from startRun().
 */
function createSceneWithFastPortals(
  overrides: {
    spawnIntervalMs?: number;
    spawnJitterMs?: number;
    maxActivePairs?: number;
    rng?: () => number;
    lifespanMs?: number;
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

// ── PortalManager integration into MainScene ─────────────────────

describe("MainScene – PortalManager integration", () => {
  it("exposes a PortalManager via getPortalManager()", () => {
    const scene = new MainScene();
    scene.create();

    const pm = scene.getPortalManager();
    expect(pm).toBeInstanceOf(PortalManager);
  });

  it("starts the PortalManager when entering 'playing'", () => {
    const scene = new MainScene();
    scene.create();

    const pm = scene.getPortalManager();
    expect(pm.isRunning()).toBe(false);

    scene.enterPhase("playing");
    expect(scene.getPortalManager().isRunning()).toBe(true);
  });

  it("stops the PortalManager when endRun is called", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    scene.endRun();
    expect(scene.getPortalManager().isRunning()).toBe(false);
  });

  it("resets the PortalManager on shutdown", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    scene.shutdown();
    expect(scene.getPortalManager().isRunning()).toBe(false);
    expect(scene.getPortalManager().getActivePairs()).toHaveLength(0);
  });

  it("restarts the PortalManager on replay (second enterPhase playing)", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.endRun();

    expect(scene.getPortalManager().isRunning()).toBe(false);

    scene.enterPhase("playing");
    expect(scene.getPortalManager().isRunning()).toBe(true);
    expect(scene.getPortalManager().getActivePairs()).toHaveLength(0);
  });

  it("propagates the scene RNG to PortalManager on startRun", () => {
    const scene = new MainScene();
    scene.create();

    const customRng = () => 0.42;
    scene.setRng(customRng);
    scene.enterPhase("playing");

    expect(scene.getPortalManager().getRng()).toBe(customRng);
  });

  it("propagates RNG changes to PortalManager via setRng", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const newRng = () => 0.99;
    scene.setRng(newRng);

    expect(scene.getPortalManager().getRng()).toBe(newRng);
  });
});

describe("MainScene – portal update order", () => {
  it("advances portal spawn timer each update frame while playing", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 100 });
    scene.enterPhase("playing");

    const pm = scene.getPortalManager();
    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000); // prevent snake step

    scene.update(0, 50);
    expect(pm.getSpawnTimerMs()).toBeGreaterThan(0);
  });

  it("spawns portal pairs after the spawn interval elapses", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 10 });
    scene.enterPhase("playing");

    const pm = scene.getPortalManager();
    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    // Advance past spawn interval to trigger portal spawn
    scene.update(0, 11);

    expect(pm.getActivePairs()).toHaveLength(1);
    const pair = pm.getActivePairs()[0];
    expect(pair.getState()).toBe("spawning");
  });

  it("portal state transitions through spawning → active → collapsing → collapsed", () => {
    // Use a very long spawn interval so no second portal spawns during the test.
    const scene = createSceneWithFastPortals({
      spawnIntervalMs: 100_000,
    });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    // Replace the PM with a short spawn interval to test lifecycle transitions.
    scene.setPortalManagerOptions({
      spawnIntervalMs: 2,
      spawnJitterMs: 0,
      maxActivePairs: 1,
      rng: () => 0.5,
    });
    scene.setRng(() => 0.5);

    // The PM isn't running yet since we replaced it. Start it.
    const pm2 = scene.getPortalManager();
    pm2.setOccupancyCheckers([]);
    pm2.startRun();

    // Spawn a portal pair. The PM ticks existing pairs first, then spawns.
    // So the pair is created after the tick and doesn't receive this delta.
    pm2.update(3);
    expect(pm2.getActivePairs()).toHaveLength(1);
    const pair = pm2.getActivePairs()[0];
    expect(pair.getState()).toBe("spawning");
    // pair.totalElapsedMs = 0 (it was created during spawn, not ticked yet)

    // Advance through spawn animation (500ms)
    pm2.update(500);
    // pair.totalElapsedMs = 500, stateElapsedMs = 500 → transitions to active
    expect(pair.getState()).toBe("active");

    // Portal lifespan is 8000ms total. pair.totalElapsedMs is currently 500.
    // Need 7500 more ms for totalElapsedMs to reach 8000.
    pm2.update(7500);
    // pair.totalElapsedMs = 500 + 7500 = 8000 >= lifespanMs(8000) → collapsing
    expect(pair.getState()).toBe("collapsing");

    // Advance through collapse animation (500ms)
    pm2.update(500);
    expect(pair.isCollapsed()).toBe(true);
  });
});

describe("MainScene – portal occupancy integration", () => {
  it("sets occupancy checkers that exclude snake and food positions", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const food = scene.getFood()!;
    const pm = scene.getPortalManager();

    snake.getTicker().setInterval(1_000_000);

    // Advance to spawn a portal pair
    scene.update(0, 2);
    const pairs = pm.getActivePairs();
    expect(pairs).toHaveLength(1);

    // Verify the portal doesn't overlap snake or food
    const [posA, posB] = pairs[0].getPositions();
    expect(snake.isOnSnake(posA)).toBe(false);
    expect(snake.isOnSnake(posB)).toBe(false);

    const foodPos = food.getPosition();
    const portalOverlapsFood =
      (posA.col === foodPos.col && posA.row === foodPos.row) ||
      (posB.col === foodPos.col && posB.row === foodPos.row);
    expect(portalOverlapsFood).toBe(false);
  });

  it("lava pools do not spawn on portal cells", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.setMoltenLavaConfig({
      spawnIntervalMs: 1,
      spawnChancePerInterval: 1,
      maxPools: 50,
    });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    // Get to Molten Core biome
    scene.update(0, 45_000); // Neon -> Ice
    scene.update(0, 45_000); // Ice -> Molten (portals collapse on transition)

    // Spawn new portals
    scene.update(0, 2);

    const pm = scene.getPortalManager();
    const pairs = pm.getActivePairs();

    if (pairs.length > 0) {
      const [posA, posB] = pairs[0].getPositions();
      const lavaPools = scene.getMoltenLavaPools();

      for (const pool of lavaPools) {
        expect(
          pool.col === posA.col && pool.row === posA.row,
        ).toBe(false);
        expect(
          pool.col === posB.col && pool.row === posB.row,
        ).toBe(false);
      }
    }
  });

  it("isPortalCell returns true for cells occupied by active portals", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const pm = scene.getPortalManager();
    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    scene.update(0, 2);
    expect(pm.getActivePairs()).toHaveLength(1);

    const [posA, posB] = pm.getActivePairs()[0].getPositions();
    expect(pm.isPortalCell(posA)).toBe(true);
    expect(pm.isPortalCell(posB)).toBe(true);
    expect(pm.isPortalCell({ col: -1, row: -1 })).toBe(false);
  });
});

describe("MainScene – portal collapse on biome transition", () => {
  it("collapses all active portals when a biome transition occurs", () => {
    // We need a portal to be alive at the biome transition boundary.
    // The biome transitions at 45s. Portal lifespan is 8s. So spawn one
    // right before transition by using a large spawn interval (44.9s),
    // ensuring the portal spawns near 44.9s and is still active at 45s.
    const scene = new MainScene();
    scene.create();
    scene.setPortalManagerOptions({
      spawnIntervalMs: 44_900,
      spawnJitterMs: 0,
      maxActivePairs: 1,
      rng: () => 0.5,
    });
    scene.setRng(() => 0.5);
    scene.enterPhase("playing");

    const pm = scene.getPortalManager();
    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    // Advance to just past portal spawn (~44.9s), before biome transition (45s)
    scene.update(0, 44_901);
    expect(pm.getActivePairs()).toHaveLength(1);
    const pair = pm.getActivePairs()[0];
    expect(pair.getState()).toBe("spawning");

    // The biome transition fires at 45s. During the same update tick:
    // 1. updateBiomeState calls collapseAll() → pair enters "collapsing"
    // 2. updatePortals calls pm.update(99) which ticks the pair 99ms
    //    — collapse animation is 500ms, so 99ms is not enough to finish
    scene.update(0, 99);
    // After this frame, the portal should be collapsing (forced by biome transition)
    // but not yet collapsed (99ms < 500ms collapseDurationMs)
    expect(pair.getState()).toBe("collapsing");
  });

  it("uses collapseAll to force all portals into collapsing state", () => {
    // Use a long spawn interval so no extra portals spawn after collapse
    const scene = new MainScene();
    scene.create();
    scene.setPortalManagerOptions({
      spawnIntervalMs: 50_000,
      spawnJitterMs: 0,
      maxActivePairs: 1,
      rng: () => 0.5,
    });
    scene.setRng(() => 0.5);
    const pm = scene.getPortalManager();
    pm.setOccupancyCheckers([]);
    pm.startRun();

    // Spawn a pair (need to advance past 50s spawn interval)
    pm.update(50_001);
    expect(pm.getActivePairs()).toHaveLength(1);

    // Get to active (500ms spawn animation)
    pm.update(500);
    expect(pm.getActivePairs()[0].getState()).toBe("active");

    // Force collapse
    pm.collapseAll();
    expect(pm.getActivePairs()[0].getState()).toBe("collapsing");

    // After collapse animation (500ms), pair is removed.
    // No new pair spawns because spawnInterval is 50s and timer hasn't accumulated enough.
    pm.update(600);
    expect(pm.getActivePairs()).toHaveLength(0);
  });
});

describe("MainScene – portal determinism", () => {
  it("same RNG produces the same portal spawn positions across replays", () => {
    const makeRng = () => {
      let i = 0;
      return () => {
        i++;
        return (i * 0.37) % 1;
      };
    };

    const scene = new MainScene();
    scene.create();
    scene.setPortalManagerOptions({
      spawnIntervalMs: 10,
      spawnJitterMs: 0,
      maxActivePairs: 1,
    });

    // First run
    scene.setRng(makeRng());
    scene.enterPhase("playing");
    const snake1 = scene.getSnake()!;
    snake1.getTicker().setInterval(1_000_000);
    scene.update(0, 11);
    const firstPositions = scene.getPortalManager().getActivePairs()[0]?.getPositions();
    scene.endRun();

    // Second run with same RNG sequence
    scene.setRng(makeRng());
    scene.enterPhase("playing");
    const snake2 = scene.getSnake()!;
    snake2.getTicker().setInterval(1_000_000);
    scene.update(0, 11);
    const secondPositions = scene.getPortalManager().getActivePairs()[0]?.getPositions();

    expect(firstPositions).toBeDefined();
    expect(secondPositions).toBeDefined();
    expect(firstPositions).toEqual(secondPositions);
  });

  it("PortalManager does not advance when game phase is not playing", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });

    // Phase is 'start', no update processing
    scene.update(0, 100);
    const pm = scene.getPortalManager();
    expect(pm.getSpawnTimerMs()).toBe(0);
    expect(pm.getActivePairs()).toHaveLength(0);
  });

  it("PortalManager does not advance after game over", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);
    scene.update(0, 2);
    expect(scene.getPortalManager().getActivePairs()).toHaveLength(1);

    scene.endRun();
    const timerBefore = scene.getPortalManager().getSpawnTimerMs();

    scene.update(0, 100);
    expect(scene.getPortalManager().getSpawnTimerMs()).toBe(timerBefore);
  });
});

describe("MainScene – setPortalManagerOptions", () => {
  it("allows reconfiguring the PortalManager before a run", () => {
    const scene = new MainScene();
    scene.create();
    scene.setPortalManagerOptions({
      spawnIntervalMs: 5,
      spawnJitterMs: 0,
      maxActivePairs: 2,
      rng: () => 0.5,
    });
    scene.setRng(() => 0.5);
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    // Advance past the short 5ms spawn interval
    scene.update(0, 6);
    expect(scene.getPortalManager().getActivePairs()).toHaveLength(1);

    // Advance again to spawn a second pair
    scene.update(0, 6);
    expect(scene.getPortalManager().getActivePairs()).toHaveLength(2);
  });
});

describe("MainScene – portal update integration order", () => {
  it("portal state changes are settled before collision checks on step frames", () => {
    // Verify the deterministic order: portals update → snake moves → collisions
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const pm = scene.getPortalManager();
    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(100);

    // Advance to spawn a portal and get past spawn animation
    scene.update(0, 2);
    scene.update(0, 500);

    // Now advance with a snake step — the portal should already be updated
    // before the collision check runs
    const pair = pm.getActivePairs()[0];
    const stateBefore = pair.getState();
    expect(stateBefore).toBe("active");

    scene.update(0, 100);
    // Game should still be playing (the portal is just on the field)
    expect(scene.getPhase()).toBe("playing");
  });

  it("portals spawn on empty cells avoiding all existing occupancy", () => {
    const scene = createSceneWithFastPortals({
      spawnIntervalMs: 1,
      maxActivePairs: 5,
    });
    scene.enterPhase("playing");

    const pm = scene.getPortalManager();
    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    // Spawn multiple portal pairs
    for (let i = 0; i < 5; i++) {
      scene.update(0, 2);
    }

    const pairs = pm.getActivePairs();
    // All portal positions should be unique
    const allPositions: { col: number; row: number }[] = [];
    for (const pair of pairs) {
      const [a, b] = pair.getPositions();
      allPositions.push(a, b);
    }

    const posKeys = allPositions.map((p) => `${p.col}:${p.row}`);
    const uniqueKeys = new Set(posKeys);
    expect(uniqueKeys.size).toBe(posKeys.length);
  });
});
