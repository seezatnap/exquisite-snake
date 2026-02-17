import { describe, it, expect, vi, beforeEach } from "vitest";
import { gameBridge } from "@/game/bridge";
import { Biome } from "@/game/systems/BiomeManager";
import {
  EMERGENCY_COLLISION_IMMUNITY_MS,
  EMERGENCY_FLASH_DEPTH,
} from "@/game/systems/effects";

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
import { MainScene } from "@/game/scenes/MainScene";

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

/**
 * Helper: create a scene, start playing, spawn a portal, traverse it,
 * then collapse the portal mid-transit. Returns the scene so callers
 * can assert on emergency teleport safety state.
 */
function setupCollapseMidTransit(): MainScene {
  const scene = createSceneWithFastPortals({
    spawnIntervalMs: 1,
    rng: () => 0.5,
  });
  scene.enterPhase("playing");

  const snake = scene.getSnake()!;
  const pm = scene.getPortalManager();

  // Prevent snake from stepping during portal setup
  snake.getTicker().setInterval(1_000_000);

  // Spawn portal
  scene.update(0, 2);
  // Let spawning finish (500ms spawn animation)
  scene.update(0, 500);

  const pairs = pm.getActivePairs();
  const pair = pairs[0];
  const [posA] = pair.getPositions();

  // Position snake head one tile before portal A
  const prePortalPos = { col: posA.col - 1, row: posA.row };
  snake.teleportHead(prePortalPos);
  snake.getTicker().setInterval(100);

  // Step onto portal — head traverses to paired exit
  scene.update(0, 100);
  expect(snake.getPortalTransit()).not.toBeNull();

  // Prevent further stepping while we collapse the portal
  snake.getTicker().setInterval(1_000_000);

  // Force collapse mid-transit
  pair.beginCollapse();
  scene.update(0, 500);

  return scene;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetBridge();
});

// ── Emergency collision immunity ────────────────────────────────

describe("Emergency teleport – collision immunity", () => {
  it("activates collision immunity after collapse-mid-transit", () => {
    const scene = setupCollapseMidTransit();
    expect(scene.getEmergencyCollisionImmunityMs()).toBeGreaterThan(0);
    expect(scene.getEmergencyCollisionImmunityMs()).toBeLessThanOrEqual(
      EMERGENCY_COLLISION_IMMUNITY_MS,
    );
  });

  it("collision immunity counts down over time", () => {
    const scene = setupCollapseMidTransit();
    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    const initialImmunity = scene.getEmergencyCollisionImmunityMs();
    expect(initialImmunity).toBeGreaterThan(0);

    // Advance 200ms
    scene.update(0, 200);
    const afterPartial = scene.getEmergencyCollisionImmunityMs();
    expect(afterPartial).toBeLessThan(initialImmunity);
    expect(afterPartial).toBeGreaterThan(0);
  });

  it("collision immunity expires after ~500ms", () => {
    const scene = setupCollapseMidTransit();
    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    // Advance enough time to fully expire immunity
    scene.update(0, EMERGENCY_COLLISION_IMMUNITY_MS + 50);
    expect(scene.getEmergencyCollisionImmunityMs()).toBe(0);
  });

  it("snake survives self-collision during immunity window", () => {
    const scene = setupCollapseMidTransit();
    const snake = scene.getSnake()!;

    // The snake was force-teleported: all segments at exit position.
    // Moving now would cause self-collision without immunity.
    snake.getTicker().setInterval(100);

    // Step immediately while immunity is active — should survive
    scene.update(0, 100);
    expect(scene.getPhase()).toBe("playing");
  });

  it("collisions are checked normally after immunity expires", () => {
    // Use a scene with a longer spawn interval to avoid interference
    const scene = createSceneWithFastPortals({
      spawnIntervalMs: 1_000_000,
      rng: () => 0.5,
    });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    // Without immunity, steering the snake to a wall should end the game.
    // Position the snake heading right at the right wall edge.
    // The default direction is "right", so when the snake steps it will
    // move out of bounds.
    snake.teleportHead({ col: 39, row: 15 });
    snake.getTicker().setInterval(100);

    // Verify no immunity
    expect(scene.getEmergencyCollisionImmunityMs()).toBe(0);

    scene.update(0, 100);
    // Wall collision should end the game
    expect(scene.getPhase()).toBe("gameOver");
  });

  it("immunity is reset on new run start", () => {
    const scene = setupCollapseMidTransit();
    expect(scene.getEmergencyCollisionImmunityMs()).toBeGreaterThan(0);

    // Start a new run — immunity should be cleared
    scene.enterPhase("playing");
    expect(scene.getEmergencyCollisionImmunityMs()).toBe(0);
  });

  it("no immunity is set when portal collapses without active transit", () => {
    const scene = createSceneWithFastPortals({
      spawnIntervalMs: 1,
      rng: () => 0.5,
    });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    // Spawn portal
    scene.update(0, 2);
    scene.update(0, 500);

    // Don't traverse — just let it collapse
    scene.update(0, 7500);
    scene.update(0, 500);

    expect(scene.getEmergencyCollisionImmunityMs()).toBe(0);
  });
});

// ── Flash VFX ───────────────────────────────────────────────────

describe("Emergency teleport – flash VFX", () => {
  it("creates a flash graphics overlay on collapse-mid-transit", () => {
    mockAddGraphics.mockClear();
    setupCollapseMidTransit();

    // The flash VFX creates a new graphics object via scene.add.graphics()
    // We check that at least one graphics object was created with
    // setDepth(EMERGENCY_FLASH_DEPTH) and fillRect was called
    const setDepthCalls = mockAddGraphics.mock.results
      .map((r) => r.value)
      .filter((g) => {
        const depthCalls = g.setDepth.mock.calls;
        return depthCalls.some(
          (call: unknown[]) => call[0] === EMERGENCY_FLASH_DEPTH,
        );
      });

    expect(setDepthCalls.length).toBeGreaterThan(0);
  });

  it("triggers camera shake on collapse-mid-transit", () => {
    mockCameraShake.mockClear();
    setupCollapseMidTransit();

    // Camera shake should have been called (force flag = true for emergency flash)
    expect(mockCameraShake).toHaveBeenCalled();
  });

  it("no flash VFX when portal collapses without active transit", () => {
    const scene = createSceneWithFastPortals({
      spawnIntervalMs: 1,
      rng: () => 0.5,
    });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    // Spawn portal
    scene.update(0, 2);
    scene.update(0, 500);

    // Clear mocks to isolate collapse-without-transit
    mockAddGraphics.mockClear();
    mockCameraShake.mockClear();

    // Collapse without transit
    scene.update(0, 7500);
    scene.update(0, 500);

    // No flash graphics with EMERGENCY_FLASH_DEPTH should have been created
    const emergencyFlashGraphics = mockAddGraphics.mock.results
      .map((r) => r.value)
      .filter((g) => {
        const depthCalls = g.setDepth.mock.calls;
        return depthCalls.some(
          (call: unknown[]) => call[0] === EMERGENCY_FLASH_DEPTH,
        );
      });

    expect(emergencyFlashGraphics.length).toBe(0);
  });
});

// ── Collision immunity integration with game mechanics ──────────

describe("Emergency teleport – mechanics integration", () => {
  it("game continues normally after immunity expires", () => {
    const scene = setupCollapseMidTransit();
    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    // Wait for immunity to expire
    scene.update(0, EMERGENCY_COLLISION_IMMUNITY_MS + 50);

    // Move the snake to a safe position
    snake.teleportHead({ col: 15, row: 15 });
    snake.getTicker().setInterval(100);

    // Take a step — should move normally
    const headBefore = snake.getHeadPosition();
    scene.update(0, 100);
    const headAfter = snake.getHeadPosition();

    expect(headAfter).not.toEqual(headBefore);
    expect(scene.getPhase()).toBe("playing");
  });

  it("EMERGENCY_COLLISION_IMMUNITY_MS is 500", () => {
    // Spec requires ~0.5 seconds of collision immunity
    expect(EMERGENCY_COLLISION_IMMUNITY_MS).toBe(500);
  });
});
