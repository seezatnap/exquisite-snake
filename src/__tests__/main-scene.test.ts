import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { gameBridge } from "@/game/bridge";
import { GRID_COLS, GRID_ROWS, RENDER_DEPTH } from "@/game/config";
import {
  PARASITE_MAGNET_SPEED_BONUS_PER_SEGMENT,
  PARASITE_SPLITTER_INTERVAL_MS,
  ParasiteType,
} from "@/game/entities/Parasite";
import { Biome } from "@/game/systems/BiomeManager";
import {
  PARASITE_PICKUP_SPAWN_INTERVAL_MS,
  ParasiteManager,
} from "@/game/systems/ParasiteManager";
import { gridToPixel } from "@/game/utils/grid";

const ROOT = path.resolve(__dirname, "../..");

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
import { Snake } from "@/game/entities/Snake";

// Spy on gameBridge methods
const spySetPhase = vi.spyOn(gameBridge, "setPhase");
const spySetScore = vi.spyOn(gameBridge, "setScore");
const spySetHighScore = vi.spyOn(gameBridge, "setHighScore");
const spySetElapsedTime = vi.spyOn(gameBridge, "setElapsedTime");
const spyResetRun = vi.spyOn(gameBridge, "resetRun");
const spySetCurrentBiome = vi.spyOn(gameBridge, "setCurrentBiome");
const spySetBiomeVisitStats = vi.spyOn(gameBridge, "setBiomeVisitStats");
const spyEmitBiomeTransition = vi.spyOn(gameBridge, "emitBiomeTransition");
const spyEmitBiomeEnter = vi.spyOn(gameBridge, "emitBiomeEnter");
const spyEmitBiomeExit = vi.spyOn(gameBridge, "emitBiomeExit");

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
  gameBridge.setActiveParasites([]);
  gameBridge.setParasitesCollected(0);
}

function injectMoltenLavaPool(
  scene: MainScene,
  pos: { col: number; row: number },
): void {
  const pools = (
    scene as unknown as {
      moltenLavaPools: Map<string, { col: number; row: number }>;
    }
  ).moltenLavaPools;
  pools.set(`${pos.col}:${pos.row}`, { ...pos });
}

function getParasiteManager(scene: MainScene): ParasiteManager {
  return (
    scene as unknown as {
      parasiteManager: ParasiteManager;
    }
  ).parasiteManager;
}

function getParasitePickupSpriteMap(scene: MainScene): Map<string, unknown> {
  return (
    scene as unknown as {
      parasitePickupSprites: Map<string, unknown>;
    }
  ).parasitePickupSprites;
}

function setActiveParasiteSegments(
  scene: MainScene,
  types: readonly ParasiteType[],
): void {
  const parasiteManager = getParasiteManager(scene);
  const nextState = parasiteManager.getState();
  nextState.inventory.segments = types.map((type, index) => ({
    id: `seg-${index}-${type}`,
    type,
    attachedAtMs: index,
    sourcePickupId: null,
  }));
  parasiteManager.replaceState(nextState);
}

function getParasiteSegmentIconMap(scene: MainScene): Map<string, unknown> {
  return (
    scene as unknown as {
      parasiteSegmentIconOverlays: Map<string, unknown>;
    }
  ).parasiteSegmentIconOverlays;
}

function injectSplitterObstacle(
  scene: MainScene,
  pos: { col: number; row: number },
): void {
  const parasiteManager = getParasiteManager(scene);
  const nextState = parasiteManager.getState();
  nextState.splitterObstacles.push({
    id: `test-splitter-${nextState.splitterObstacles.length + 1}`,
    position: { ...pos },
    spawnedAtMs: 0,
    sourceSegmentId: "test-segment",
  });
  parasiteManager.replaceState(nextState);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetBridge();
});

describe("MainScene", () => {
  // ── Construction ───────────────────────────────────────────

  it("has scene key 'MainScene'", () => {
    const scene = new MainScene();
    expect(
      (scene as unknown as { config: { key: string } }).config?.key,
    ).toBe("MainScene");
  });

  it("extends Phaser.Scene (via mock)", async () => {
    const scene = new MainScene();
    const Phaser = await import("phaser");
    expect(scene).toBeInstanceOf(Phaser.Scene);
  });

  // ── create() ───────────────────────────────────────────────

  it("create() draws the arena grid", () => {
    const scene = new MainScene();
    scene.create();
    expect(mockLineStyle).toHaveBeenCalled();
    expect(mockStrokePath).toHaveBeenCalled();
  });

  it("create() initializes backdrop, tilemap, and grid theme layers for Neon City", () => {
    const scene = new MainScene();
    scene.create();

    expect(mockAddGraphics).toHaveBeenCalledTimes(3);
    expect(mockSetBackgroundColor).toHaveBeenCalledWith(0x0a0a0a);
    expect(mockLineStyle).toHaveBeenCalledWith(2, 0x00f0ff, 0.12);
    expect(mockLineStyle).toHaveBeenCalledWith(1, 0x00d5e2, 0.14);
    expect(mockLineStyle).toHaveBeenCalledWith(1, 0x00f0ff, 0.08);
  });

  it("uses explicit render depths for arena layers, mechanics, food, and snake", () => {
    const scene = new MainScene();
    scene.create();

    expect(mockGraphicsSetDepth).toHaveBeenCalledWith(RENDER_DEPTH.BIOME_BACKDROP);
    expect(mockGraphicsSetDepth).toHaveBeenCalledWith(RENDER_DEPTH.BIOME_TILEMAP);
    expect(mockGraphicsSetDepth).toHaveBeenCalledWith(RENDER_DEPTH.BIOME_GRID);

    scene.enterPhase("playing");
    expect(mockSpriteSetDepth).toHaveBeenCalledWith(RENDER_DEPTH.FOOD);
    expect(mockSpriteSetDepth).toHaveBeenCalledWith(RENDER_DEPTH.SNAKE);

    scene.setMoltenLavaConfig({
      spawnIntervalMs: 45_000,
      spawnChancePerInterval: 1,
      maxPools: 1,
    });
    scene.setRng(() => 0.25);
    scene.getSnake()!.getTicker().setInterval(200_000);

    mockGraphicsSetDepth.mockClear();
    scene.update(0, 45_000); // Neon -> Ice
    scene.update(0, 45_000); // Ice -> Molten
    expect(mockGraphicsSetDepth).toHaveBeenCalledWith(RENDER_DEPTH.BIOME_MECHANIC);
  });

  it("create() sets phase to 'start' via bridge", () => {
    const scene = new MainScene();
    scene.create();
    expect(spySetPhase).toHaveBeenCalledWith("start");
  });

  // ── Phase management ───────────────────────────────────────

  it("enterPhase updates the scene phase", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    expect(scene.getPhase()).toBe("playing");
  });

  it("enterPhase('playing') resets run state via bridge", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    expect(spyResetRun).toHaveBeenCalled();
  });

  it("enterPhase notifies the bridge of every transition", () => {
    const scene = new MainScene();
    scene.create();
    spySetPhase.mockClear();

    scene.enterPhase("playing");
    expect(spySetPhase).toHaveBeenCalledWith("playing");

    scene.enterPhase("gameOver");
    expect(spySetPhase).toHaveBeenCalledWith("gameOver");
  });

  // ── Score ──────────────────────────────────────────────────

  it("addScore increments score and notifies bridge", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    spySetScore.mockClear();

    scene.addScore(10);
    expect(scene.getScore()).toBe(10);
    expect(spySetScore).toHaveBeenCalledWith(10);

    scene.addScore(5);
    expect(scene.getScore()).toBe(15);
    expect(spySetScore).toHaveBeenCalledWith(15);
  });

  it("addScore applies splitter multiplier while a splitter segment is attached", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const parasiteManager = getParasiteManager(scene);
    const seeded = parasiteManager.getState();
    seeded.inventory.segments.push({
      id: "segment-splitter",
      type: ParasiteType.Splitter,
      attachedAtMs: 0,
      sourcePickupId: null,
    });
    parasiteManager.replaceState(seeded);

    spySetScore.mockClear();
    scene.addScore(2);
    expect(scene.getScore()).toBe(3);
    expect(spySetScore).toHaveBeenLastCalledWith(3);
  });

  it("food-score callback path uses splitter multiplier while attached", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const parasiteManager = getParasiteManager(scene);
    const seeded = parasiteManager.getState();
    seeded.inventory.segments.push({
      id: "segment-splitter",
      type: ParasiteType.Splitter,
      attachedAtMs: 0,
      sourcePickupId: null,
    });
    parasiteManager.replaceState(seeded);

    const food = scene.getFood();
    expect(food).not.toBeNull();
    vi.spyOn(food!, "checkEat").mockImplementation((_snake, onScore) => {
      onScore(2);
      return true;
    });

    spySetScore.mockClear();
    (
      scene as unknown as {
        resolveFoodConsumption: () => void;
      }
    ).resolveFoodConsumption();

    expect(scene.getScore()).toBe(3);
    expect(spySetScore).toHaveBeenLastCalledWith(3);
  });

  it("blocks the first food contact when shield debt is active and consumes on second contact", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const food = scene.getFood()!;
    const parasiteManager = getParasiteManager(scene);
    const seeded = parasiteManager.getState();
    seeded.blockedFoodCharges = 1;
    parasiteManager.replaceState(seeded);

    snake.reset({ col: 7, row: 7 }, "right", 1);
    food.setPosition({ col: 7, row: 7 });
    const checkEatSpy = vi.spyOn(food, "checkEat");
    spySetScore.mockClear();

    (
      scene as unknown as {
        resolveFoodConsumption: () => void;
      }
    ).resolveFoodConsumption();

    expect(checkEatSpy).not.toHaveBeenCalled();
    expect(parasiteManager.getState().blockedFoodCharges).toBe(0);
    expect(scene.getScore()).toBe(0);

    (
      scene as unknown as {
        resolveFoodConsumption: () => void;
      }
    ).resolveFoodConsumption();

    expect(checkEatSpy).toHaveBeenCalledTimes(1);
    expect(scene.getScore()).toBe(1);
    expect(parasiteManager.getState().blockedFoodCharges).toBe(0);
  });

  // ── High score ─────────────────────────────────────────────

  it("endRun updates highScore if score is greater", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.addScore(50);
    spySetHighScore.mockClear();

    scene.endRun();
    expect(scene.getHighScore()).toBe(50);
    expect(spySetHighScore).toHaveBeenCalledWith(50);
  });

  it("endRun does not lower existing highScore", () => {
    const scene = new MainScene();
    scene.create();
    scene.setHighScore(100);

    scene.enterPhase("playing");
    scene.addScore(20);
    spySetHighScore.mockClear();

    scene.endRun();
    expect(scene.getHighScore()).toBe(100);
    // highScore unchanged → no highScoreChange call from endRun
    expect(spySetHighScore).not.toHaveBeenCalled();
  });

  it("endRun transitions to gameOver phase", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    spySetPhase.mockClear();

    scene.endRun();
    expect(scene.getPhase()).toBe("gameOver");
    expect(spySetPhase).toHaveBeenCalledWith("gameOver");
  });

  it("setHighScore updates highScore and notifies bridge", () => {
    const scene = new MainScene();
    scene.create();
    scene.setHighScore(200);
    expect(scene.getHighScore()).toBe(200);
    expect(spySetHighScore).toHaveBeenCalledWith(200);
  });

  // ── Elapsed time ───────────────────────────────────────────

  it("update() accumulates elapsedTime while playing", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    spySetElapsedTime.mockClear();

    scene.update(0, 16.67);
    scene.update(16.67, 16.67);

    expect(scene.getElapsedTime()).toBeCloseTo(33.34, 1);
    expect(spySetElapsedTime).toHaveBeenCalledTimes(2);
  });

  it("update() does not accumulate time when phase is 'start'", () => {
    const scene = new MainScene();
    scene.create();
    // phase is "start" after create
    spySetElapsedTime.mockClear();

    scene.update(0, 100);
    expect(scene.getElapsedTime()).toBe(0);
    expect(spySetElapsedTime).not.toHaveBeenCalled();
  });

  it("update() does not accumulate time when phase is 'gameOver'", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.update(0, 500);
    scene.endRun();
    spySetElapsedTime.mockClear();

    scene.update(500, 100);
    // elapsed time should not have changed after gameOver
    expect(spySetElapsedTime).not.toHaveBeenCalled();
  });

  it("advances parasite pickup timers and renders safe spawns away from snake, food, and obstacles", () => {
    const scene = new MainScene();
    scene.create();
    scene.setRng(() => 0);
    scene.enterPhase("playing");
    scene.getSnake()!.getTicker().setInterval(1_000_000);
    injectMoltenLavaPool(scene, { col: 0, row: 1 });
    const parasiteManager = getParasiteManager(scene);

    const spriteFactory = (scene as unknown as {
      add: { sprite: ReturnType<typeof vi.fn> };
    }).add.sprite;
    spriteFactory.mockClear();

    expect(parasiteManager.getState().timers.pickupSpawnElapsedMs).toBe(0);

    const halfInterval = PARASITE_PICKUP_SPAWN_INTERVAL_MS / 2;
    scene.update(0, halfInterval);

    expect(parasiteManager.getState().timers.pickupSpawnElapsedMs).toBe(
      halfInterval,
    );
    expect(parasiteManager.getState().pickups).toHaveLength(0);
    expect(spriteFactory).not.toHaveBeenCalled();
    expect(getParasitePickupSpriteMap(scene).size).toBe(0);

    scene.update(halfInterval, halfInterval);

    const snakePositions = scene
      .getSnake()!
      .getSegments()
      .map((segment) => `${segment.col}:${segment.row}`);
    const food = scene.getFood()!.getPosition();
    const blocked = new Set<string>([
      ...snakePositions,
      `${food.col}:${food.row}`,
      "0:1",
    ]);
    const parasiteState = parasiteManager.getState();
    const pickups = parasiteState.pickups;

    expect(parasiteState.timers.pickupSpawnElapsedMs).toBe(0);
    expect(pickups).toHaveLength(1);
    expect(blocked.has(`${pickups[0]!.position.col}:${pickups[0]!.position.row}`)).toBe(false);
    expect(spriteFactory).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      "parasite-pickup",
    );
    expect(getParasitePickupSpriteMap(scene).size).toBe(1);
  });

  it("consumes a parasite pickup when the snake head enters its cell and removes the pickup sprite", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.reset({ col: 5, row: 5 }, "right", 4);
    snake.getTicker().setInterval(100);
    scene.getFood()!.setPosition({ col: 0, row: 0 });

    const parasiteManager = getParasiteManager(scene);
    const seeded = parasiteManager.getState();
    seeded.pickups = [
      {
        id: "pickup-1",
        type: ParasiteType.Shield,
        position: { col: 6, row: 5 },
        spawnedAtMs: 50,
      },
    ];
    parasiteManager.replaceState(seeded);

    const pickupSpriteDestroy = vi.fn();
    getParasitePickupSpriteMap(scene).set("pickup-1", {
      destroy: pickupSpriteDestroy,
    });

    scene.update(0, 100);

    const after = parasiteManager.getState();
    expect(after.pickups).toEqual([]);
    expect(after.inventory.segments).toEqual([
      {
        id: "segment-pickup-1",
        type: ParasiteType.Shield,
        attachedAtMs: 100,
        sourcePickupId: "pickup-1",
      },
    ]);
    expect(after.parasitesCollected).toBe(1);
    expect(getParasitePickupSpriteMap(scene).has("pickup-1")).toBe(false);
    expect(pickupSpriteDestroy).toHaveBeenCalledTimes(1);
    expect(gameBridge.getState().activeParasites).toEqual([ParasiteType.Shield]);
    expect(gameBridge.getState().parasitesCollected).toBe(1);
  });

  it("applies runtime FIFO shedding and parasites-collected updates when consuming a fourth pickup", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.reset({ col: 5, row: 5 }, "right", 4);
    snake.getTicker().setInterval(100);
    scene.getFood()!.setPosition({ col: 0, row: 0 });

    const parasiteManager = getParasiteManager(scene);
    const seeded = parasiteManager.getState();
    seeded.parasitesCollected = 3;
    seeded.inventory.segments = [
      {
        id: "seg-1",
        type: ParasiteType.Magnet,
        attachedAtMs: 10,
        sourcePickupId: "pickup-1",
      },
      {
        id: "seg-2",
        type: ParasiteType.Shield,
        attachedAtMs: 20,
        sourcePickupId: "pickup-2",
      },
      {
        id: "seg-3",
        type: ParasiteType.Splitter,
        attachedAtMs: 30,
        sourcePickupId: "pickup-3",
      },
    ];
    seeded.pickups = [
      {
        id: "pickup-4",
        type: ParasiteType.Magnet,
        position: { col: 6, row: 5 },
        spawnedAtMs: 999,
      },
    ];
    parasiteManager.replaceState(seeded);

    const pickupSpriteDestroy = vi.fn();
    getParasitePickupSpriteMap(scene).set("pickup-4", {
      destroy: pickupSpriteDestroy,
    });

    scene.update(0, 100);

    const after = parasiteManager.getState();
    expect(after.pickups).toEqual([]);
    expect(after.inventory.segments).toEqual([
      {
        id: "seg-2",
        type: ParasiteType.Shield,
        attachedAtMs: 20,
        sourcePickupId: "pickup-2",
      },
      {
        id: "seg-3",
        type: ParasiteType.Splitter,
        attachedAtMs: 30,
        sourcePickupId: "pickup-3",
      },
      {
        id: "segment-pickup-4",
        type: ParasiteType.Magnet,
        attachedAtMs: 100,
        sourcePickupId: "pickup-4",
      },
    ]);
    expect(after.parasitesCollected).toBe(4);
    expect(getParasitePickupSpriteMap(scene).has("pickup-4")).toBe(false);
    expect(pickupSpriteDestroy).toHaveBeenCalledTimes(1);
    expect(gameBridge.getState().activeParasites).toEqual([
      ParasiteType.Shield,
      ParasiteType.Splitter,
      ParasiteType.Magnet,
    ]);
    expect(gameBridge.getState().parasitesCollected).toBe(4);
  });

  it("keeps respawned food off active parasite pickup cells after food is eaten", () => {
    const scene = new MainScene();
    scene.create();
    scene.setRng(() => 0);
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.reset({ col: 5, row: 5 }, "right", 4);
    snake.getTicker().setInterval(100);
    scene.getFood()!.setPosition({ col: 6, row: 5 });

    const parasiteManager = getParasiteManager(scene);
    const seeded = parasiteManager.getState();
    seeded.pickups = [
      {
        id: "pickup-a",
        type: ParasiteType.Magnet,
        position: { col: 0, row: 0 },
        spawnedAtMs: 1,
      },
      {
        id: "pickup-b",
        type: ParasiteType.Shield,
        position: { col: 0, row: 1 },
        spawnedAtMs: 2,
      },
    ];
    parasiteManager.replaceState(seeded);

    scene.update(0, 100);

    const respawnedFood = scene.getFood()!.getPosition();
    const activePickups = parasiteManager.getState().pickups;
    for (const pickup of activePickups) {
      expect(respawnedFood).not.toEqual(pickup.position);
    }
  });

  it("pulls food one tile per stepped tick when a magnet segment is in range", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    setActiveParasiteSegments(scene, [ParasiteType.Magnet]);

    const snake = scene.getSnake()!;
    snake.reset({ col: 5, row: 5 }, "right", 3);
    snake.getTicker().setInterval(100);
    scene.getFood()!.setPosition({ col: 4, row: 7 });

    scene.update(0, 100);

    expect(scene.getFood()!.getPosition()).toEqual({ col: 4, row: 6 });
  });

  it("applies stacked magnet speed bonuses and restores base speed when magnets are gone", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000);
    scene.update(0, 0);

    setActiveParasiteSegments(scene, [
      ParasiteType.Magnet,
      ParasiteType.Magnet,
      ParasiteType.Shield,
    ]);
    scene.update(0, 0);

    expect(snake.getTicker().interval).toBeCloseTo(
      1_000 / (1 + PARASITE_MAGNET_SPEED_BONUS_PER_SEGMENT * 2),
    );

    setActiveParasiteSegments(scene, [
      ParasiteType.Magnet,
      ParasiteType.Magnet,
      ParasiteType.Magnet,
    ]);
    scene.update(0, 0);

    expect(snake.getTicker().interval).toBeCloseTo(
      1_000 / (1 + PARASITE_MAGNET_SPEED_BONUS_PER_SEGMENT * 3),
    );

    setActiveParasiteSegments(scene, []);
    scene.update(0, 0);

    expect(snake.getTicker().interval).toBeCloseTo(1_000);
  });

  it("clears parasite pickup state when a new run starts", () => {
    const scene = new MainScene();
    scene.create();
    scene.setRng(() => 0);
    scene.enterPhase("playing");
    scene.getSnake()!.getTicker().setInterval(1_000_000);
    scene.update(0, PARASITE_PICKUP_SPAWN_INTERVAL_MS);

    expect(getParasiteManager(scene).getState().pickups).toHaveLength(1);
    expect(getParasitePickupSpriteMap(scene).size).toBe(1);

    scene.endRun();
    scene.enterPhase("playing");

    const parasiteState = getParasiteManager(scene).getState();
    expect(parasiteState.pickups).toEqual([]);
    expect(parasiteState.timers.pickupSpawnElapsedMs).toBe(0);
    expect(getParasitePickupSpriteMap(scene).size).toBe(0);
    expect(gameBridge.getState().activeParasites).toEqual([]);
    expect(gameBridge.getState().parasitesCollected).toBe(0);
  });

  it("renders parasite segment glows/icons on snake body with dedicated type markers", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.reset({ col: 10, row: 10 }, "right", 6);
    snake.getTicker().setInterval(60_000);

    const parasiteState = getParasiteManager(scene).getState();
    parasiteState.inventory.segments = [
      {
        id: "seg-magnet",
        type: ParasiteType.Magnet,
        attachedAtMs: 100,
        sourcePickupId: "pickup-magnet",
      },
      {
        id: "seg-shield",
        type: ParasiteType.Shield,
        attachedAtMs: 200,
        sourcePickupId: "pickup-shield",
      },
      {
        id: "seg-splitter",
        type: ParasiteType.Splitter,
        attachedAtMs: 300,
        sourcePickupId: "pickup-splitter",
      },
    ];
    getParasiteManager(scene).replaceState(parasiteState);

    mockAddGraphics.mockClear();
    mockGraphicsSetDepth.mockClear();
    mockTextSetText.mockClear();
    mockTextSetDepth.mockClear();
    mockFillCircle.mockClear();

    scene.update(0, 16);

    expect(mockAddGraphics).toHaveBeenCalledTimes(1);
    expect(mockGraphicsSetDepth).toHaveBeenCalledWith(RENDER_DEPTH.SNAKE + 1);
    expect(mockTextSetDepth).toHaveBeenCalledWith(RENDER_DEPTH.SNAKE + 2);
    expect(mockTextSetText).toHaveBeenCalledWith("MG");
    expect(mockTextSetText).toHaveBeenCalledWith("SH");
    expect(mockTextSetText).toHaveBeenCalledWith("SP");
    expect(mockFillCircle).toHaveBeenCalled();
    expect(getParasiteSegmentIconMap(scene).size).toBe(3);
  });

  it("cleans parasite segment icon overlays when active segments are removed", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.getSnake()!.getTicker().setInterval(60_000);

    const seededState = getParasiteManager(scene).getState();
    seededState.inventory.segments = [
      {
        id: "seg-magnet",
        type: ParasiteType.Magnet,
        attachedAtMs: 100,
        sourcePickupId: "pickup-magnet",
      },
    ];
    getParasiteManager(scene).replaceState(seededState);
    scene.update(0, 16);

    expect(getParasiteSegmentIconMap(scene).size).toBe(1);

    const clearedState = getParasiteManager(scene).getState();
    clearedState.inventory.segments = [];
    getParasiteManager(scene).replaceState(clearedState);

    mockTextDestroy.mockClear();
    scene.update(16, 16);

    expect(getParasiteSegmentIconMap(scene).size).toBe(0);
    expect(mockTextDestroy).toHaveBeenCalled();
  });

  it("spawns splitter obstacles every 10 seconds while splitter is attached", () => {
    const scene = new MainScene();
    scene.create();
    scene.setRng(() => 0);
    scene.enterPhase("playing");
    scene.getSnake()!.getTicker().setInterval(1_000_000);
    const parasiteManager = getParasiteManager(scene);
    const seeded = parasiteManager.getState();
    seeded.inventory.segments.push({
      id: "segment-splitter",
      type: ParasiteType.Splitter,
      attachedAtMs: 0,
      sourcePickupId: null,
    });
    parasiteManager.replaceState(seeded);

    scene.update(0, PARASITE_SPLITTER_INTERVAL_MS - 1);
    expect(parasiteManager.getState().splitterObstacles).toHaveLength(0);

    scene.update(
      PARASITE_SPLITTER_INTERVAL_MS - 1,
      1,
    );
    expect(parasiteManager.getState().splitterObstacles).toHaveLength(1);

    scene.update(
      PARASITE_SPLITTER_INTERVAL_MS,
      PARASITE_SPLITTER_INTERVAL_MS * 2,
    );
    const splitterObstacles = parasiteManager.getState().splitterObstacles;
    expect(splitterObstacles).toHaveLength(3);
    expect(
      new Set(
        splitterObstacles.map((obstacle) => `${obstacle.position.col}:${obstacle.position.row}`),
      ).size,
    ).toBe(3);

    const snake = scene.getSnake()!;
    const food = scene.getFood()!.getPosition();
    for (const obstacle of splitterObstacles) {
      expect(snake.isOnSnake(obstacle.position)).toBe(false);
      expect(obstacle.position).not.toEqual(food);
    }

    scene.update(PARASITE_SPLITTER_INTERVAL_MS * 3, 500);
    expect(parasiteManager.getState().splitterObstacles).toHaveLength(3);
  });

  it("clears splitter obstacles when a biome exits", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    const parasiteManager = getParasiteManager(scene);
    const seeded = parasiteManager.getState();
    seeded.splitterObstacles = [
      {
        id: "splitter-obstacle-1",
        position: { col: 4, row: 4 },
        spawnedAtMs: 10_000,
        sourceSegmentId: "segment-1",
      },
    ];
    parasiteManager.replaceState(seeded);

    (
      scene as unknown as {
        handleBiomeExit: (biome: Biome) => void;
      }
    ).handleBiomeExit(Biome.NeonCity);

    expect(parasiteManager.getState().splitterObstacles).toEqual([]);
  });

  it("clears splitter obstacles when the run ends", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    const parasiteManager = getParasiteManager(scene);
    const seeded = parasiteManager.getState();
    seeded.splitterObstacles = [
      {
        id: "splitter-obstacle-2",
        position: { col: 8, row: 8 },
        spawnedAtMs: 10_000,
        sourceSegmentId: "segment-2",
      },
    ];
    parasiteManager.replaceState(seeded);

    scene.endRun();

    expect(parasiteManager.getState().splitterObstacles).toEqual([]);
  });

  // ── Biome integration ──────────────────────────────────────

  it("enterPhase('playing') initializes biome state and visit stats for the run", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    expect(scene.getCurrentBiome()).toBe(Biome.NeonCity);
    expect(gameBridge.getState().currentBiome).toBe(Biome.NeonCity);
    expect(scene.getBiomeVisitStats()).toEqual({
      [Biome.NeonCity]: 1,
      [Biome.IceCavern]: 0,
      [Biome.MoltenCore]: 0,
      [Biome.VoidRift]: 0,
    });
    expect(spySetCurrentBiome).toHaveBeenCalledWith(Biome.NeonCity);
    expect(spySetBiomeVisitStats).toHaveBeenCalledWith({
      [Biome.NeonCity]: 1,
      [Biome.IceCavern]: 0,
      [Biome.MoltenCore]: 0,
      [Biome.VoidRift]: 0,
    });
  });

  it("supports overriding biome order so Void Rift can be first for testing", () => {
    const scene = new MainScene();
    scene.create();
    scene.setBiomeCycleOrder([
      Biome.VoidRift,
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.MoltenCore,
    ]);
    scene.enterPhase("playing");

    expect(scene.getCurrentBiome()).toBe(Biome.VoidRift);
    expect(gameBridge.getState().currentBiome).toBe(Biome.VoidRift);
    expect(scene.getBiomeVisitStats()).toEqual({
      [Biome.NeonCity]: 0,
      [Biome.IceCavern]: 0,
      [Biome.MoltenCore]: 0,
      [Biome.VoidRift]: 1,
    });

    scene.getSnake()!.getTicker().setInterval(60_000);
    scene.update(0, 45_000); // Void -> Neon
    expect(scene.getCurrentBiome()).toBe(Biome.NeonCity);
  });

  it("reads biome order override from URL query for quick manual testing", () => {
    const originalUrl = window.location.href;
    window.history.pushState(
      {},
      "",
      `${window.location.origin}/?biomeOrder=void-rift,neon-city,ice-cavern,molten-core`,
    );

    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    expect(scene.getCurrentBiome()).toBe(Biome.VoidRift);
    expect(gameBridge.getState().currentBiome).toBe(Biome.VoidRift);

    window.history.pushState({}, "", originalUrl);
  });

  it("startRun emits biome reset events once per run start", () => {
    const scene = new MainScene();
    scene.create();

    const onBiomeChange = vi.fn();
    const onBiomeVisitStatsChange = vi.fn();
    gameBridge.on("biomeChange", onBiomeChange);
    gameBridge.on("biomeVisitStatsChange", onBiomeVisitStatsChange);

    (
      scene as unknown as {
        startRun: () => void;
      }
    ).startRun();
    gameBridge.off("biomeChange", onBiomeChange);
    gameBridge.off("biomeVisitStatsChange", onBiomeVisitStatsChange);

    expect(onBiomeChange).toHaveBeenCalledTimes(1);
    expect(onBiomeChange).toHaveBeenCalledWith(Biome.NeonCity);
    expect(onBiomeVisitStatsChange).toHaveBeenCalledTimes(1);
    expect(onBiomeVisitStatsChange).toHaveBeenCalledWith({
      [Biome.NeonCity]: 1,
      [Biome.IceCavern]: 0,
      [Biome.MoltenCore]: 0,
      [Biome.VoidRift]: 0,
    });
  });

  it("update() advances biome on the 45s cadence and updates visit stats", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    // Keep snake stationary for this test so biome timing is isolated.
    scene.getSnake()!.getTicker().setInterval(60_000);
    spyEmitBiomeTransition.mockClear();

    scene.update(0, 45_000);

    expect(scene.getCurrentBiome()).toBe(Biome.IceCavern);
    expect(gameBridge.getState().currentBiome).toBe(Biome.IceCavern);
    expect(scene.getBiomeVisitStats()).toEqual({
      [Biome.NeonCity]: 1,
      [Biome.IceCavern]: 1,
      [Biome.MoltenCore]: 0,
      [Biome.VoidRift]: 0,
    });
    expect(spyEmitBiomeTransition).toHaveBeenCalledWith({
      from: Biome.NeonCity,
      to: Biome.IceCavern,
    });
  });

  it("tracks biome visit stats across repeated cycle rotations", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    scene.getSnake()!.getTicker().setInterval(1_000_000);
    scene.update(0, 45_000 * 8);

    expect(scene.getCurrentBiome()).toBe(Biome.NeonCity);
    expect(scene.getBiomeVisitStats()).toEqual({
      [Biome.NeonCity]: 3,
      [Biome.IceCavern]: 2,
      [Biome.MoltenCore]: 2,
      [Biome.VoidRift]: 2,
    });
    expect(gameBridge.getState().biomeVisitStats).toEqual({
      [Biome.NeonCity]: 3,
      [Biome.IceCavern]: 2,
      [Biome.MoltenCore]: 2,
      [Biome.VoidRift]: 2,
    });
  });

  it("emits biome exit → transition → enter events per rotation", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.getSnake()!.getTicker().setInterval(60_000);

    const events: string[] = [];
    const onExit = (biome: Biome) => events.push(`exit:${biome}`);
    const onTransition = ({ from, to }: { from: Biome; to: Biome }) =>
      events.push(`transition:${from}->${to}`);
    const onEnter = (biome: Biome) => events.push(`enter:${biome}`);
    gameBridge.on("biomeExit", onExit);
    gameBridge.on("biomeTransition", onTransition);
    gameBridge.on("biomeEnter", onEnter);

    scene.update(0, 45_000);
    gameBridge.off("biomeExit", onExit);
    gameBridge.off("biomeTransition", onTransition);
    gameBridge.off("biomeEnter", onEnter);

    expect(events).toEqual([
      `exit:${Biome.NeonCity}`,
      `transition:${Biome.NeonCity}->${Biome.IceCavern}`,
      `enter:${Biome.IceCavern}`,
    ]);
  });

  it("redraws biome background/tilemap and starts the transition wipe on biome swap", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.getSnake()!.getTicker().setInterval(60_000);
    mockAddGraphics.mockClear();
    mockLineStyle.mockClear();
    mockSetBackgroundColor.mockClear();
    mockFillRect.mockClear();
    mockCameraShake.mockClear();

    scene.update(0, 45_000); // Neon -> Ice

    expect(scene.getCurrentBiome()).toBe(Biome.IceCavern);
    expect(mockAddGraphics).toHaveBeenCalledTimes(4);
    expect(mockSetBackgroundColor).toHaveBeenCalledWith(0x081624);
    expect(mockLineStyle).toHaveBeenCalledWith(2, 0x8fdcff, 0.16);
    expect(mockLineStyle).toHaveBeenCalledWith(1, 0x8ed5ff, 0.16);
    expect(mockLineStyle).toHaveBeenCalledWith(1, 0x7dc6ff, 0.1);
    expect(mockCameraShake).toHaveBeenCalledWith(110, 0.0035);
    expect(mockFillRect).toHaveBeenCalled();

    const swapOrder = mockSetBackgroundColor.mock.invocationCallOrder[0];
    const wipeOrder = mockFillRect.mock.invocationCallOrder[0];
    expect(swapOrder).toBeLessThan(wipeOrder);
  });

  it("shows a 3-2-1 center countdown with biome label before each biome shift", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.getSnake()!.getTicker().setInterval(60_000);
    mockTextSetText.mockClear();
    mockTextSetVisible.mockClear();
    mockTextSetPosition.mockClear();
    mockTextSetAlpha.mockClear();
    mockTextSetDepth.mockClear();

    scene.update(0, 41_999); // 3001ms left → hidden
    scene.update(0, 1); // 3000ms left → 3
    scene.update(0, 1_000); // 2000ms left → 2
    scene.update(0, 1_000); // 1000ms left → 1
    scene.update(0, 1_000); // biome shifts → hidden

    expect(mockTextSetAlpha).toHaveBeenCalledWith(0.65);
    expect(mockTextSetDepth).toHaveBeenCalledWith(50);
    expect(mockTextSetText).toHaveBeenCalledWith("3");
    expect(mockTextSetText).toHaveBeenCalledWith("2");
    expect(mockTextSetText).toHaveBeenCalledWith("1");
    expect(mockTextSetText).toHaveBeenCalledWith("BIOME SHIFT: ICE CAVERN");
    expect(mockTextSetVisible).toHaveBeenCalledWith(true);
    expect(mockTextSetVisible).toHaveBeenCalledWith(false);

    const hasCenterCountdownPosition = mockTextSetPosition.mock.calls.some(
      ([x, y]) => Math.abs(x - 400) <= 20 && Math.abs(y - 260) <= 25,
    );
    const hasCenterLabelPosition = mockTextSetPosition.mock.calls.some(
      ([x, y]) => Math.abs(x - 400) <= 20 && Math.abs(y - 388) <= 25,
    );
    expect(hasCenterCountdownPosition).toBe(true);
    expect(hasCenterLabelPosition).toBe(true);
  });

  it("keeps redrawn grid behind food and snake sprites across biome transitions", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.getSnake()!.getTicker().setInterval(60_000);

    mockGraphicsSetDepth.mockClear();
    mockSpriteSetDepth.mockClear();

    scene.update(0, 45_000); // Neon -> Ice

    const gridDepthCallIndex = mockGraphicsSetDepth.mock.calls.findLastIndex(
      ([depth]) => depth === RENDER_DEPTH.BIOME_GRID,
    );
    expect(gridDepthCallIndex).toBeGreaterThanOrEqual(0);
    const gridDepthCallOrder =
      mockGraphicsSetDepth.mock.invocationCallOrder[gridDepthCallIndex];

    const gameplayDepthCallOrders = mockSpriteSetDepth.mock.calls
      .map(([depth], callIndex) => ({
        depth,
        order: mockSpriteSetDepth.mock.invocationCallOrder[callIndex],
      }))
      .filter(
        ({ depth }) =>
          depth === RENDER_DEPTH.FOOD || depth === RENDER_DEPTH.SNAKE,
      );

    expect(gameplayDepthCallOrders.length).toBeGreaterThan(0);
    for (const { order } of gameplayDepthCallOrders) {
      expect(order).toBeGreaterThan(gridDepthCallOrder);
    }
  });

  it("keeps gameplay updates in sync while transition FX animates and then cleans up", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(60_000); // isolate initial biome transition timing
    scene.update(0, 45_000); // Neon -> Ice, starts transition FX

    const internals = scene as unknown as {
      biomeTransitionEffect: { from: Biome; elapsedMs: number } | null;
      biomeTransitionOverlayGraphics: unknown;
    };

    expect(internals.biomeTransitionEffect).not.toBeNull();

    snake.reset({ col: 10, row: 10 }, "right", 1);
    snake.getTicker().setInterval(100);

    scene.update(0, 100);
    expect(scene.getPhase()).toBe("playing");
    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 10 });

    scene.update(0, 300);
    expect(scene.getPhase()).toBe("playing");
    expect(snake.getHeadPosition()).toEqual({ col: 12, row: 10 });
    expect(internals.biomeTransitionEffect).toBeNull();
    expect(internals.biomeTransitionOverlayGraphics).toBeNull();
  });

  it("applies distinct background colors across the full biome cycle", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.getSnake()!.getTicker().setInterval(60_000);
    mockSetBackgroundColor.mockClear();

    scene.update(0, 45_000 * 3); // Neon -> Ice -> Molten -> Void

    expect(scene.getCurrentBiome()).toBe(Biome.VoidRift);
    expect(mockSetBackgroundColor).toHaveBeenCalledWith(0x081624);
    expect(mockSetBackgroundColor).toHaveBeenCalledWith(0x1a0d05);
    expect(mockSetBackgroundColor).toHaveBeenCalledWith(0x060510);
  });

  it("replay resets biome visit stats back to a fresh run", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.getSnake()!.getTicker().setInterval(60_000);
    scene.update(0, 45_000);
    scene.endRun();

    scene.enterPhase("playing");
    expect(scene.getCurrentBiome()).toBe(Biome.NeonCity);
    expect(scene.getBiomeVisitStats()).toEqual({
      [Biome.NeonCity]: 1,
      [Biome.IceCavern]: 0,
      [Biome.MoltenCore]: 0,
      [Biome.VoidRift]: 0,
    });
  });

  it("endRun stops biome progression", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.getSnake()!.getTicker().setInterval(60_000);
    scene.endRun();

    spyEmitBiomeTransition.mockClear();
    spyEmitBiomeExit.mockClear();
    spyEmitBiomeEnter.mockClear();
    scene.update(0, 180_000);

    expect(scene.getCurrentBiome()).toBe(Biome.NeonCity);
    expect(spyEmitBiomeTransition).not.toHaveBeenCalled();
    expect(spyEmitBiomeExit).not.toHaveBeenCalled();
    expect(spyEmitBiomeEnter).not.toHaveBeenCalled();
  });

  it("Ice Cavern momentum resolves wall collisions before a delayed turn applies", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(60_000); // isolate biome timing from movement
    scene.update(0, 45_000); // Neon -> Ice
    expect(scene.getCurrentBiome()).toBe(Biome.IceCavern);

    snake.reset({ col: GRID_COLS - 2, row: 10 }, "right", 1);
    snake.getTicker().setInterval(100);
    snake.bufferDirection("up");

    scene.update(0, 100); // slide tile 1
    expect(scene.getPhase()).toBe("playing");
    expect(snake.getHeadPosition()).toEqual({ col: GRID_COLS - 1, row: 10 });

    scene.update(0, 100); // slide tile 2 -> out of bounds before turn can apply
    expect(scene.getPhase()).toBe("gameOver");
  });

  it("turns are immediate again after leaving Ice Cavern", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.setMoltenLavaConfig({ spawnChancePerInterval: 0 });

    const snake = scene.getSnake()!;
    const echoGhost = scene.getEchoGhost()!;
    snake.getTicker().setInterval(60_000); // isolate biome timing from movement
    scene.update(0, 45_000); // Neon -> Ice
    scene.update(0, 45_000); // Ice -> Molten
    expect(scene.getCurrentBiome()).toBe(Biome.MoltenCore);

    snake.reset({ col: 10, row: 10 }, "right", 1);
    snake.getTicker().setInterval(100);
    snake.bufferDirection("up");
    vi.spyOn(echoGhost, "isActive").mockReturnValue(false);

    scene.update(0, 100);
    expect(scene.getPhase()).toBe("playing");
    expect(snake.getDirection()).toBe("up");
    expect(snake.getHeadPosition()).toEqual({ col: 10, row: 9 });
  });

  it("Molten Core spawns lava pools on empty cells with configurable cap/frequency", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.setMoltenLavaConfig({
      spawnIntervalMs: 1,
      spawnChancePerInterval: 1,
      maxPools: 3,
    });
    scene.setRng(() => 0.2);

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(60_000);

    // Neon -> Ice (no molten pools yet)
    scene.update(0, 45_000);
    expect(scene.getMoltenLavaPools()).toHaveLength(0);

    // Ice -> Molten (spawns up to cap)
    scene.update(0, 45_000);
    const pools = scene.getMoltenLavaPools();
    const foodPos = scene.getFood()!.getPosition();

    expect(scene.getCurrentBiome()).toBe(Biome.MoltenCore);
    expect(pools).toHaveLength(3);
    for (const pool of pools) {
      expect(snake.isOnSnake(pool)).toBe(false);
      expect(pool).not.toEqual(foodPos);
    }
  });

  it("Molten Core lava spawns avoid active parasite pickup and splitter-obstacle cells", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.setRng(() => 0);
    scene.setMoltenLavaConfig({
      spawnIntervalMs: 1,
      spawnChancePerInterval: 0,
      maxPools: 2,
    });

    const snake = scene.getSnake()!;
    snake.reset({ col: GRID_COLS - 2, row: GRID_ROWS - 2 }, "right", 4);
    snake.getTicker().setInterval(60_000);
    scene.getFood()!.setPosition({ col: GRID_COLS - 5, row: GRID_ROWS - 5 });

    scene.update(0, 45_000); // Neon -> Ice
    scene.update(45_000, 45_000); // Ice -> Molten
    expect(scene.getCurrentBiome()).toBe(Biome.MoltenCore);
    expect(scene.getMoltenLavaPools()).toHaveLength(0);

    const parasiteManager = getParasiteManager(scene);
    const seeded = parasiteManager.getState();
    seeded.pickups = [
      {
        id: "pickup-blocked",
        type: ParasiteType.Magnet,
        position: { col: 0, row: 0 },
        spawnedAtMs: 1,
      },
    ];
    seeded.splitterObstacles = [
      {
        id: "splitter-blocked",
        position: { col: 0, row: 1 },
        spawnedAtMs: 2,
        sourceSegmentId: "segment-splitter",
      },
    ];
    parasiteManager.replaceState(seeded);

    scene.setMoltenLavaConfig({
      spawnIntervalMs: 1,
      spawnChancePerInterval: 1,
      maxPools: 2,
    });

    scene.update(90_000, 2);

    const blocked = new Set<string>([
      ...parasiteManager
        .getState()
        .pickups
        .map((pickup) => `${pickup.position.col}:${pickup.position.row}`),
      ...parasiteManager
        .getState()
        .splitterObstacles
        .map((obstacle) => `${obstacle.position.col}:${obstacle.position.row}`),
    ]);
    const pools = scene.getMoltenLavaPools();

    expect(pools).toHaveLength(2);
    for (const pool of pools) {
      expect(blocked.has(`${pool.col}:${pool.row}`)).toBe(false);
    }
  });

  it("Molten Core renders lava pool visuals from active mechanic pools", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.setMoltenLavaConfig({
      spawnIntervalMs: 45_000,
      spawnChancePerInterval: 1,
      maxPools: 1,
    });
    scene.setRng(() => 0.2);

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(200_000);

    scene.update(0, 45_000); // Neon -> Ice
    mockFillCircle.mockClear();

    scene.update(0, 45_000); // Ice -> Molten + pool visual draw

    expect(scene.getCurrentBiome()).toBe(Biome.MoltenCore);
    expect(scene.getMoltenLavaPools()).toHaveLength(1);
    expect(mockFillCircle.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("Molten Core collision burns 3 tail segments when snake is long enough", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.setMoltenLavaConfig({
      spawnChancePerInterval: 0,
      burnTailSegments: 3,
    });

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(60_000);
    scene.update(0, 45_000); // Neon -> Ice
    scene.update(0, 45_000); // Ice -> Molten

    snake.reset({ col: 5, row: 5 }, "right", 6);
    snake.getTicker().setInterval(125);
    const interval = snake.getTicker().interval;
    injectMoltenLavaPool(scene, { col: 6, row: 5 });

    scene.update(0, interval);

    expect(scene.getPhase()).toBe("playing");
    expect(snake.isAlive()).toBe(true);
    expect(snake.getLength()).toBe(3);
  });

  it("Molten Core collision kills the snake when length is too short", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.setMoltenLavaConfig({
      spawnChancePerInterval: 0,
      burnTailSegments: 3,
    });

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(60_000);
    scene.update(0, 45_000); // Neon -> Ice
    scene.update(0, 45_000); // Ice -> Molten

    snake.reset({ col: 5, row: 5 }, "right", 3);
    snake.getTicker().setInterval(125);
    const interval = snake.getTicker().interval;
    injectMoltenLavaPool(scene, { col: 6, row: 5 });

    scene.update(0, interval);

    expect(scene.getPhase()).toBe("gameOver");
    expect(snake.isAlive()).toBe(false);
  });

  it("cleans up all Molten Core lava pools when biome changes", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.setMoltenLavaConfig({
      spawnIntervalMs: 1,
      spawnChancePerInterval: 1,
      maxPools: 4,
    });
    scene.setRng(() => 0.3);

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(60_000);

    scene.update(0, 45_000); // Neon -> Ice
    scene.update(0, 45_000); // Ice -> Molten
    expect(scene.getMoltenLavaPools().length).toBeGreaterThan(0);

    scene.update(0, 45_000); // Molten -> Void

    expect(scene.getCurrentBiome()).toBe(Biome.VoidRift);
    expect(scene.getMoltenLavaPools()).toHaveLength(0);
  });

  it("Void Rift gravity does not apply outside the Void biome", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.reset({ col: 10, row: 0 }, "right", 1);
    snake.getTicker().setInterval(100);

    scene.update(0, 100);
    scene.update(0, 100);
    scene.update(0, 100);

    expect(scene.getCurrentBiome()).toBe(Biome.NeonCity);
    expect(snake.getHeadPosition()).toEqual({ col: 13, row: 0 });
  });

  it("Void Rift gravity nudges the snake toward arena center on cadence steps", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(200_000); // isolate biome timing from movement
    scene.update(0, 45_000); // Neon -> Ice
    scene.update(0, 45_000); // Ice -> Molten
    scene.update(0, 45_000); // Molten -> Void
    expect(scene.getCurrentBiome()).toBe(Biome.VoidRift);

    snake.reset({ col: 10, row: 0 }, "right", 1);
    snake.getTicker().setInterval(100);

    scene.update(0, 100); // step 1 (no gravity)
    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 0 });

    scene.update(0, 100); // step 2 (no gravity)
    expect(snake.getHeadPosition()).toEqual({ col: 12, row: 0 });

    scene.update(0, 100); // step 3 + gravity pull toward center (down)
    expect(snake.getHeadPosition()).toEqual({ col: 13, row: 1 });
  });

  it("Void Rift pull is weaker far from center and stronger near center", () => {
    const scene = new MainScene();
    scene.create();
    scene.setBiomeCycleOrder([
      Biome.VoidRift,
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.MoltenCore,
    ]);
    scene.setBiomeMechanicsConfig({
      voidRift: { gravityPullCadenceSteps: 3 },
    });
    scene.enterPhase("playing");
    expect(scene.getCurrentBiome()).toBe(Biome.VoidRift);

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(100);

    // Far from center (distance >= 26): effective cadence is slower (4).
    snake.reset({ col: 2, row: 2 }, "right", 1);
    scene.update(0, 100);
    expect(snake.getHeadPosition()).toEqual({ col: 3, row: 2 });
    scene.update(0, 100);
    expect(snake.getHeadPosition()).toEqual({ col: 4, row: 2 });
    scene.update(0, 100);
    expect(snake.getHeadPosition()).toEqual({ col: 5, row: 2 });
    scene.update(0, 100);
    expect(snake.getHeadPosition()).toEqual({ col: 7, row: 2 });

    // Near center (distance <= 6): effective cadence is faster (2).
    snake.reset({ col: 17, row: 15 }, "up", 1);
    scene.update(0, 100); // step 1: no pull yet
    expect(snake.getHeadPosition()).toEqual({ col: 17, row: 14 });
    scene.update(0, 100); // step 2: pull right applies
    expect(snake.getHeadPosition()).toEqual({ col: 18, row: 13 });
  });

  it("touching the Void Rift center tile ends the run immediately", () => {
    const scene = new MainScene();
    scene.create();
    scene.setBiomeCycleOrder([
      Biome.VoidRift,
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.MoltenCore,
    ]);
    scene.setBiomeMechanicsConfig({
      voidRift: { gravityPullCadenceSteps: 999_999 },
    });
    scene.enterPhase("playing");
    expect(scene.getCurrentBiome()).toBe(Biome.VoidRift);

    const snake = scene.getSnake()!;
    snake.reset({ col: 19, row: 15 }, "right", 1);
    snake.getTicker().setInterval(100);

    scene.update(0, 100); // moves onto center (20,15)

    expect(scene.getPhase()).toBe("gameOver");
    expect(snake.isAlive()).toBe(false);
  });

  it("Void Rift treats opposite input as a no-op and skips gravity nudge that step", () => {
    const scene = new MainScene();
    scene.create();
    scene.setBiomeCycleOrder([
      Biome.VoidRift,
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.MoltenCore,
    ]);
    scene.setBiomeMechanicsConfig({
      voidRift: { gravityPullCadenceSteps: 1 },
    });
    scene.setRng(() => 0.8); // tie-break toward vertical pull (up) at col10,row25
    scene.enterPhase("playing");
    expect(scene.getCurrentBiome()).toBe(Biome.VoidRift);

    const snake = scene.getSnake()!;
    snake.reset({ col: 10, row: 0 }, "right", 3);
    snake.getTicker().setInterval(100);
    snake.bufferDirection("left"); // rejected opposite input

    scene.update(0, 100);

    expect(scene.getPhase()).toBe("playing");
    expect(snake.getDirection()).toBe("right");
    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 0 });
  });

  it("retains rejected opposite-input protection until the next gravity cadence step", () => {
    const scene = new MainScene();
    scene.create();
    scene.setBiomeCycleOrder([
      Biome.VoidRift,
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.MoltenCore,
    ]);
    scene.setBiomeMechanicsConfig({
      voidRift: { gravityPullCadenceSteps: 3 },
    });
    scene.enterPhase("playing");
    expect(scene.getCurrentBiome()).toBe(Biome.VoidRift);

    const snake = scene.getSnake()!;
    snake.reset({ col: 10, row: 0 }, "right", 1);
    snake.getTicker().setInterval(100);
    snake.bufferDirection("left"); // rejected opposite input

    scene.update(0, 100); // step 1 (no gravity due)
    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 0 });

    scene.update(0, 100); // step 2 (no gravity due)
    expect(snake.getHeadPosition()).toEqual({ col: 12, row: 0 });

    scene.update(0, 100); // step 3 (gravity would be due, but should be skipped)
    expect(snake.getHeadPosition()).toEqual({ col: 13, row: 0 });
  });

  it("treats opposite-to-pull steering as a no-op and skips Void gravity", () => {
    const scene = new MainScene();
    scene.create();
    scene.setBiomeCycleOrder([
      Biome.VoidRift,
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.MoltenCore,
    ]);
    scene.setBiomeMechanicsConfig({
      voidRift: { gravityPullCadenceSteps: 1 },
    });
    scene.setRng(() => 0.8); // tie-break toward vertical pull (up) at col10,row25
    scene.enterPhase("playing");
    expect(scene.getCurrentBiome()).toBe(Biome.VoidRift);

    const snake = scene.getSnake()!;
    snake.reset({ col: 10, row: 25 }, "right", 1);
    snake.getTicker().setInterval(100);
    snake.bufferDirection("down"); // opposite of upcoming pull (up) -> rejected

    scene.update(0, 100);

    expect(scene.getPhase()).toBe("playing");
    expect(snake.getDirection()).toBe("right");
    // Without no-op protection, gravity would have pulled this up to row 24.
    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 25 });
  });

  it("rejects opposite-to-pull input before movement in Void Rift", () => {
    const scene = new MainScene();
    scene.create();
    scene.setBiomeCycleOrder([
      Biome.VoidRift,
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.MoltenCore,
    ]);
    scene.setBiomeMechanicsConfig({
      voidRift: { gravityPullCadenceSteps: 999_999 },
    });
    scene.enterPhase("playing");
    expect(scene.getCurrentBiome()).toBe(Biome.VoidRift);

    const snake = scene.getSnake()!;
    snake.reset({ col: 10, row: 10 }, "up", 3); // pull direction here is RIGHT
    snake.getTicker().setInterval(100);
    snake.bufferDirection("left"); // opposite to pull; should be ignored

    scene.update(0, 100);

    expect(scene.getPhase()).toBe("playing");
    expect(snake.getDirection()).toBe("up");
    expect(snake.getHeadPosition()).toEqual({ col: 10, row: 9 });
  });

  it("treats opposite-to-pull input as a protected no-op when gravity is due", () => {
    const scene = new MainScene();
    scene.create();
    scene.setBiomeCycleOrder([
      Biome.VoidRift,
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.MoltenCore,
    ]);
    scene.setBiomeMechanicsConfig({
      voidRift: { gravityPullCadenceSteps: 1 },
    });
    scene.enterPhase("playing");
    expect(scene.getCurrentBiome()).toBe(Biome.VoidRift);

    const snake = scene.getSnake()!;
    snake.reset({ col: 10, row: 10 }, "up", 3); // pull is RIGHT from this position
    snake.getTicker().setInterval(100);
    snake.bufferDirection("left"); // opposite to pull; should become protected no-op

    scene.update(0, 100);

    expect(scene.getPhase()).toBe("playing");
    expect(snake.getDirection()).toBe("up");
    // Without protection, gravity would have nudged this to col 11.
    expect(snake.getHeadPosition()).toEqual({ col: 10, row: 9 });
  });

  it("resets Void Rift pull cadence when the biome is re-entered", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);
    scene.update(0, 45_000 * 3); // Neon -> Ice -> Molten -> Void
    expect(scene.getCurrentBiome()).toBe(Biome.VoidRift);

    snake.reset({ col: 10, row: 0 }, "right", 1);
    snake.getTicker().setInterval(100);
    scene.update(0, 100); // cadence step 1
    scene.update(0, 100); // cadence step 2
    expect(snake.getHeadPosition()).toEqual({ col: 12, row: 0 });

    snake.getTicker().setInterval(1_000_000);
    scene.update(0, 45_000 * 4); // Void -> Neon -> Ice -> Molten -> Void
    expect(scene.getCurrentBiome()).toBe(Biome.VoidRift);

    snake.reset({ col: 10, row: 0 }, "right", 1);
    snake.getTicker().setInterval(100);
    scene.update(0, 100); // should be cadence step 1 again after re-enter
    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 0 });
  });

  it("shared biome config allows tuning Ice momentum slide distance", () => {
    const scene = new MainScene();
    scene.create();
    scene.setBiomeMechanicsConfig({
      iceCavern: { turnMomentumTiles: 1 },
    });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(60_000);
    scene.update(0, 45_000); // Neon -> Ice
    expect(scene.getCurrentBiome()).toBe(Biome.IceCavern);

    snake.reset({ col: 10, row: 10 }, "right", 1);
    snake.getTicker().setInterval(100);
    snake.bufferDirection("up");

    scene.update(0, 100); // slide tile 1
    expect(snake.getDirection()).toBe("right");
    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 10 });

    scene.update(0, 100); // delayed turn applies
    expect(snake.getDirection()).toBe("up");
    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 9 });
  });

  it("shared biome config uses injected RNG for Void tie-breaks", () => {
    const scene = new MainScene();
    scene.create();
    scene.setBiomeMechanicsConfig({
      voidRift: { gravityPullCadenceSteps: 1 },
    });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(200_000); // isolate biome timing from movement
    scene.update(0, 45_000); // Neon -> Ice
    scene.update(0, 45_000); // Ice -> Molten
    scene.update(0, 45_000); // Molten -> Void
    expect(scene.getCurrentBiome()).toBe(Biome.VoidRift);

    scene.setRng(() => 0.8); // deterministic vertical preference on tie
    snake.reset({ col: 17, row: 13 }, "right", 1);
    snake.getTicker().setInterval(100);

    scene.update(0, 100); // head: (18,13), tie -> pulled down to (18,14)
    expect(snake.getHeadPosition()).toEqual({ col: 18, row: 14 });
  });

  it("shared biome config clamps invalid balancing values", () => {
    const scene = new MainScene();
    scene.setBiomeMechanicsConfig({
      iceCavern: { turnMomentumTiles: -5 },
      moltenCore: {
        spawnIntervalMs: Number.NaN,
        spawnChancePerInterval: 5,
        maxPools: -3,
        burnTailSegments: 0,
      },
      voidRift: { gravityPullCadenceSteps: 0 },
    });

    expect(scene.getBiomeMechanicsConfig()).toEqual({
      iceCavern: { turnMomentumTiles: 0 },
      moltenCore: {
        spawnIntervalMs: 1_500,
        spawnChancePerInterval: 1,
        maxPools: 0,
        burnTailSegments: 1,
      },
      voidRift: { gravityPullCadenceSteps: 1 },
    });
  });

  it("QA-DEFECT-01: Void Rift gravity nudge skips when it would cause self-collision", () => {
    const scene = new MainScene();
    scene.create();
    scene.setBiomeMechanicsConfig({
      voidRift: { gravityPullCadenceSteps: 1 },
    });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(200_000); // isolate biome timing from movement
    scene.update(0, 45_000); // Neon -> Ice
    scene.update(0, 45_000); // Ice -> Molten
    scene.update(0, 45_000); // Molten -> Void
    expect(scene.getCurrentBiome()).toBe(Biome.VoidRift);

    // Reproduce QA-DEFECT-01 scenario:
    // Snake heading right, body trailing left, positioned right of center.
    // Center is at col 20. Head at col 21 → gravity pulls LEFT toward col 20
    // Body at col 20 means the nudge destination would be a body segment.
    snake.reset({ col: 21, row: 15 }, "right", 3);
    // Segments: head(21,15), body(20,15), body(19,15)
    snake.getTicker().setInterval(100);

    // Step: head moves to (22,15), gravity fires (cadence=1).
    // Pull direction: center col=20, head col=22 → pull LEFT to (21,15).
    // (21,15) is the previous head position, now first body segment.
    // Without the fix this would cause self-collision → game over.
    scene.update(0, 100);

    expect(scene.getPhase()).toBe("playing");
    expect(snake.isAlive()).toBe(true);
    // Nudge was skipped, so head stays at (22,15)
    expect(snake.getHeadPosition()).toEqual({ col: 22, row: 15 });
  });

  it("Void Rift renders an animated center vortex visual", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(200_000);
    scene.update(0, 45_000); // Neon -> Ice
    scene.update(0, 45_000); // Ice -> Molten
    scene.update(0, 45_000); // Molten -> Void
    expect(scene.getCurrentBiome()).toBe(Biome.VoidRift);

    mockFillCircle.mockClear();
    mockMoveTo.mockClear();
    mockLineTo.mockClear();

    scene.update(0, 16);

    expect(mockFillCircle).toHaveBeenCalled();
    expect(mockMoveTo).toHaveBeenCalled();
    expect(mockLineTo).toHaveBeenCalled();
  });

  // ── Replay lifecycle ───────────────────────────────────────

  it("entering 'playing' after gameOver resets score and time", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.addScore(30);
    scene.update(0, 5000);
    scene.endRun();

    spyResetRun.mockClear();
    scene.enterPhase("playing");

    expect(scene.getScore()).toBe(0);
    expect(scene.getElapsedTime()).toBe(0);
    expect(spyResetRun).toHaveBeenCalled();
  });

  // ── Single source of truth ─────────────────────────────────

  it("getters always reflect gameBridge.getState()", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.addScore(42);
    scene.update(0, 1234);

    const state = gameBridge.getState();
    expect(scene.getPhase()).toBe(state.phase);
    expect(scene.getScore()).toBe(state.score);
    expect(scene.getHighScore()).toBe(state.highScore);
    expect(scene.getElapsedTime()).toBe(state.elapsedTime);
    expect(scene.getCurrentBiome()).toBe(state.currentBiome);
    expect(scene.getBiomeVisitStats()).toEqual(state.biomeVisitStats);
  });

  it("external bridge mutations are visible through scene getters", () => {
    const scene = new MainScene();
    scene.create();

    // Simulate an external consumer mutating bridge state directly
    gameBridge.setScore(999);
    gameBridge.setHighScore(5000);
    gameBridge.setElapsedTime(42000);
    gameBridge.setPhase("gameOver");

    expect(scene.getScore()).toBe(999);
    expect(scene.getHighScore()).toBe(5000);
    expect(scene.getElapsedTime()).toBe(42000);
    expect(scene.getPhase()).toBe("gameOver");
  });
});

describe("MainScene – storage integration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("create() loads persisted high score from localStorage", () => {
    localStorage.setItem("exquisite-snake:highScore", "99");
    const scene = new MainScene();
    scene.create();
    expect(scene.getHighScore()).toBe(99);
    expect(spySetHighScore).toHaveBeenCalledWith(99);
  });

  it("create() defaults to 0 when no high score is stored", () => {
    const scene = new MainScene();
    scene.create();
    expect(scene.getHighScore()).toBe(0);
  });

  it("endRun() persists new high score to localStorage", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.addScore(75);
    scene.endRun();
    expect(localStorage.getItem("exquisite-snake:highScore")).toBe("75");
  });

  it("endRun() does not write to localStorage when score is not a new high", () => {
    localStorage.setItem("exquisite-snake:highScore", "100");
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.addScore(50);
    scene.endRun();
    // Should still be the original value
    expect(localStorage.getItem("exquisite-snake:highScore")).toBe("100");
  });

  it("survives localStorage being unavailable on create", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const scene = new MainScene();
    expect(() => scene.create()).not.toThrow();
    expect(scene.getHighScore()).toBe(0);
    vi.restoreAllMocks();
  });

  it("survives localStorage being unavailable on endRun", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.addScore(50);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => scene.endRun()).not.toThrow();
    expect(scene.getHighScore()).toBe(50);
    vi.restoreAllMocks();
  });
});

describe("MainScene – no local state fields (single source of truth)", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/game/scenes/MainScene.ts"),
    "utf-8",
  );

  it("does not declare a local 'phase' field", () => {
    expect(source).not.toMatch(/private\s+phase\b/);
  });

  it("does not declare a local 'score' field", () => {
    expect(source).not.toMatch(/private\s+score\b/);
  });

  it("does not declare a local 'highScore' field", () => {
    expect(source).not.toMatch(/private\s+highScore\b/);
  });

  it("does not declare a local 'elapsedTime' field", () => {
    expect(source).not.toMatch(/private\s+elapsedTime\b/);
  });

  it("reads state from gameBridge.getState()", () => {
    expect(source).toContain("gameBridge.getState()");
  });
});

describe("MainScene source file", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/game/scenes/MainScene.ts"),
    "utf-8",
  );

  it("extends Phaser.Scene", () => {
    expect(source).toContain("extends Phaser.Scene");
  });

  it("imports gameBridge from bridge module", () => {
    expect(source).toContain("gameBridge");
    expect(source).toContain("bridge");
  });

  it("imports arena dimensions and colors from config", () => {
    expect(source).toContain("ARENA_WIDTH");
    expect(source).toContain("ARENA_HEIGHT");
    expect(source).toContain("TILE_SIZE");
    expect(source).toContain("COLORS");
  });

  it("has create and update methods", () => {
    expect(source).toContain("create()");
    expect(source).toContain("update(");
  });

  it("uses scene key 'MainScene'", () => {
    expect(source).toContain('"MainScene"');
  });

  it("imports isInBounds from grid utils", () => {
    expect(source).toContain("isInBounds");
  });

  it("imports Snake and Food entities", () => {
    expect(source).toContain("Snake");
    expect(source).toContain("Food");
  });
});

describe("Game.tsx loads MainScene for the scene list", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/components/Game.tsx"),
    "utf-8",
  );

  it("dynamically imports MainScene", () => {
    expect(source).toContain("MainScene");
  });

  it("passes MainScene to createGameConfig", () => {
    expect(source).toContain("createGameConfig");
    expect(source).toContain("MainScene");
  });
});

// ── Entity management ────────────────────────────────────────────

describe("MainScene – entity management", () => {
  it("creates snake, food, and echo ghost when entering 'playing'", () => {
    const scene = new MainScene();
    scene.create();

    expect(scene.getSnake()).toBeNull();
    expect(scene.getFood()).toBeNull();
    expect(scene.getEchoGhost()).toBeNull();

    scene.enterPhase("playing");

    expect(scene.getSnake()).not.toBeNull();
    expect(scene.getFood()).not.toBeNull();
    expect(scene.getEchoGhost()).not.toBeNull();
  });

  it("exposes rewind hooks to snapshot/restore EchoGhost state", () => {
    const scene = new MainScene();
    scene.create();
    expect(scene.createEchoGhostSnapshot()).toBeNull();

    scene.enterPhase("playing");
    const ghost = scene.getEchoGhost()!;
    ghost.advance(5_000);

    const snapshot = scene.createEchoGhostSnapshot();
    expect(snapshot).not.toBeNull();

    ghost.reset();
    expect(ghost.getBufferedSampleCount()).toBe(0);

    scene.restoreEchoGhostSnapshot(snapshot);
    expect(ghost.createSnapshot()).toEqual(snapshot);
  });

  it("snake starts alive when entering 'playing'", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    expect(scene.getSnake()!.isAlive()).toBe(true);
  });

  it("snake starts at center of grid", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const head = scene.getSnake()!.getHeadPosition();
    expect(head.col).toBe(Math.floor(GRID_COLS / 2));
    expect(head.row).toBe(Math.floor(GRID_ROWS / 2));
  });

  it("calls setupTouchInput alongside setupInput when entering 'playing'", () => {
    const spy = vi.spyOn(Snake.prototype, "setupTouchInput");
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("feeds snake positions into EchoGhost only on movement ticks", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const echoGhost = scene.getEchoGhost()!;
    snake.getTicker().setInterval(100);

    const initialSamples = echoGhost.getBufferedSampleCount();
    expect(initialSamples).toBeGreaterThan(0);

    scene.update(0, 50);
    expect(echoGhost.getBufferedSampleCount()).toBe(initialSamples);

    scene.update(0, 50);
    expect(echoGhost.getBufferedSampleCount()).toBe(initialSamples + 1);
  });

  it("renders EchoGhost with dashed outlines, 40% opacity, and trailing particles after delay", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(60_000);

    mockLineStyle.mockClear();
    mockMoveTo.mockClear();
    mockLineTo.mockClear();
    mockFillCircle.mockClear();

    scene.update(0, 4_999);
    expect(mockLineStyle).not.toHaveBeenCalledWith(2, 0xff4b8f, 0.4);
    expect(mockFillCircle).not.toHaveBeenCalled();

    scene.update(0, 1);

    expect(mockLineStyle).toHaveBeenCalledWith(2, 0xff4b8f, 0.4);
    expect(mockMoveTo).toHaveBeenCalled();
    expect(mockLineTo).toHaveBeenCalled();
    expect(mockFillCircle).toHaveBeenCalled();
  });

  it("tints EchoGhost visuals to the active biome at render time", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(60_000);

    mockLineStyle.mockClear();
    scene.update(0, 5_000);
    expect(mockLineStyle).toHaveBeenCalledWith(2, 0xff4b8f, 0.4);

    mockLineStyle.mockClear();
    scene.update(0, 45_000); // Neon -> Ice

    expect(scene.getCurrentBiome()).toBe(Biome.IceCavern);
    expect(mockLineStyle).toHaveBeenCalledWith(2, 0xd3f1ff, 0.4);
  });

  it("queues a delayed ghost-food burst exactly 5 seconds after food is eaten", () => {
    const scene = new MainScene();
    scene.create();
    scene.setRng(() => 0.5);
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const foodPos = scene.getFood()!.getPosition();
    const moveDirection = foodPos.col > 0 ? "right" : "left";
    const startCol = moveDirection === "right" ? foodPos.col - 1 : foodPos.col + 1;
    snake.reset({ col: startCol, row: foodPos.row }, moveDirection, 1);

    const particlesAdd = (
      scene as unknown as { add: { particles: ReturnType<typeof vi.fn> } }
    ).add.particles;
    particlesAdd.mockClear();
    mockTimeDelayedCall.mockClear();

    const interval = snake.getTicker().interval;
    scene.update(0, interval);

    expect(particlesAdd).toHaveBeenCalledTimes(1);
    const delayedGhostBurstCall = mockTimeDelayedCall.mock.calls.find(
      (call) => call[0] === 5_000,
    );
    expect(delayedGhostBurstCall).toBeDefined();

    const delayedGhostBurstCallback = delayedGhostBurstCall![1] as () => void;
    delayedGhostBurstCallback();

    expect(particlesAdd).toHaveBeenCalledTimes(2);
    const delayedBurstArgs = particlesAdd.mock.calls[1];
    const expectedGhostBurstPixel = gridToPixel(foodPos);
    expect(delayedBurstArgs[0]).toBe(expectedGhostBurstPixel.x);
    expect(delayedBurstArgs[1]).toBe(expectedGhostBurstPixel.y);
  });

  it("QA-DEFECT-02: delayed ghost-food burst in Void Rift uses the pre-nudge eat cell", () => {
    const scene = new MainScene();
    scene.create();
    scene.setBiomeCycleOrder([
      Biome.VoidRift,
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.MoltenCore,
    ]);
    scene.setBiomeMechanicsConfig({
      voidRift: { gravityPullCadenceSteps: 1 },
    });
    scene.enterPhase("playing");
    expect(scene.getCurrentBiome()).toBe(Biome.VoidRift);

    const food = scene.getFood()!;
    const forcedFoodPos = { col: 10, row: 10 };
    const forcedFoodPixel = gridToPixel(forcedFoodPos);
    (food as unknown as { position: { col: number; row: number } }).position = {
      ...forcedFoodPos,
    };
    food.getSprite().setPosition(forcedFoodPixel.x, forcedFoodPixel.y);

    const snake = scene.getSnake()!;
    snake.reset({ col: forcedFoodPos.col - 1, row: forcedFoodPos.row }, "right", 1);

    const particlesAdd = (
      scene as unknown as { add: { particles: ReturnType<typeof vi.fn> } }
    ).add.particles;
    particlesAdd.mockClear();
    mockTimeDelayedCall.mockClear();

    const interval = snake.getTicker().interval;
    scene.update(0, interval);

    expect(snake.getHeadPosition()).toEqual({ col: 11, row: 10 });
    const delayedGhostBurstCall = mockTimeDelayedCall.mock.calls.find(
      (call) => call[0] === 5_000,
    );
    expect(delayedGhostBurstCall).toBeDefined();

    const delayedGhostBurstCallback = delayedGhostBurstCall![1] as () => void;
    delayedGhostBurstCallback();

    const delayedBurstArgs = particlesAdd.mock.calls.at(-1);
    expect(delayedBurstArgs).toBeDefined();
    const expectedGhostBurstPixel = gridToPixel(forcedFoodPos);
    expect(delayedBurstArgs![0]).toBe(expectedGhostBurstPixel.x);
    expect(delayedBurstArgs![1]).toBe(expectedGhostBurstPixel.y);
  });

  it("skips delayed ghost-food burst when the target history sample is unavailable", () => {
    const scene = new MainScene();
    scene.create();
    scene.setRng(() => 0.5);
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const foodPos = scene.getFood()!.getPosition();
    const moveDirection = foodPos.col > 0 ? "right" : "left";
    const startCol = moveDirection === "right" ? foodPos.col - 1 : foodPos.col + 1;
    snake.reset({ col: startCol, row: foodPos.row }, moveDirection, 1);

    const particlesAdd = (
      scene as unknown as { add: { particles: ReturnType<typeof vi.fn> } }
    ).add.particles;
    particlesAdd.mockClear();
    mockTimeDelayedCall.mockClear();

    const interval = snake.getTicker().interval;
    scene.update(0, interval);

    expect(particlesAdd).toHaveBeenCalledTimes(1);
    const delayedGhostBurstCall = mockTimeDelayedCall.mock.calls.find(
      (call) => call[0] === 5_000,
    );
    expect(delayedGhostBurstCall).toBeDefined();

    scene.getEchoGhost()!.reset();
    const delayedGhostBurstCallback = delayedGhostBurstCall![1] as () => void;
    delayedGhostBurstCallback();

    expect(particlesAdd).toHaveBeenCalledTimes(1);
  });

  it("destroys old entities on replay (entering 'playing' again)", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const firstSnake = scene.getSnake();
    const firstFood = scene.getFood();
    const firstGhost = scene.getEchoGhost();

    scene.endRun();
    scene.enterPhase("playing");

    // New entities should be created (different instances)
    expect(scene.getSnake()).not.toBe(firstSnake);
    expect(scene.getFood()).not.toBe(firstFood);
    expect(scene.getEchoGhost()).not.toBe(firstGhost);
    expect(scene.getSnake()).not.toBeNull();
    expect(scene.getFood()).not.toBeNull();
    expect(scene.getEchoGhost()).not.toBeNull();
  });

  it("cleans up EchoGhost when the scene shuts down", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    expect(scene.getEchoGhost()).not.toBeNull();

    scene.shutdown();
    expect(scene.getEchoGhost()).toBeNull();
  });

  it("clears ghost visual trail caches when restoring an EchoGhost snapshot", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.getSnake()!.getTicker().setInterval(60_000);
    scene.update(0, 5_000);

    const internals = scene as unknown as {
      echoGhostTrailParticles: unknown[];
      echoGhostTrailSpawnElapsedMs: number;
      lastEchoGhostHead: { col: number; row: number } | null;
    };
    expect(internals.echoGhostTrailParticles.length).toBeGreaterThan(0);
    expect(internals.lastEchoGhostHead).not.toBeNull();

    const snapshot = scene.createEchoGhostSnapshot();
    scene.restoreEchoGhostSnapshot(snapshot);

    expect(internals.echoGhostTrailParticles).toEqual([]);
    expect(internals.echoGhostTrailSpawnElapsedMs).toBe(0);
    expect(internals.lastEchoGhostHead).toBeNull();
  });
});

// ── Wall collision ─────────────────────────────────────────────

describe("MainScene – wall collision", () => {
  it("shield absorbs one wall collision, then a second collision is fatal", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    setActiveParasiteSegments(scene, [ParasiteType.Shield]);

    const snake = scene.getSnake()!;
    snake.reset({ col: GRID_COLS - 1, row: 15 }, "right", 1);
    const interval = snake.getTicker().interval;

    scene.update(0, interval);

    const parasiteState = getParasiteManager(scene).getState();
    expect(scene.getPhase()).toBe("playing");
    expect(snake.isAlive()).toBe(true);
    expect(snake.getHeadPosition()).toEqual({ col: GRID_COLS - 1, row: 15 });
    expect(parasiteState.inventory.segments).toEqual([]);
    expect(parasiteState.blockedFoodCharges).toBe(1);
    expect(gameBridge.getState().activeParasites).toEqual([]);
    expect(gameBridge.getState().parasitesCollected).toBe(0);

    scene.update(interval, interval);
    expect(scene.getPhase()).toBe("gameOver");
  });

  it("ends the run when snake hits the right wall", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    // Move the snake to the right edge by resetting to last column
    snake.reset({ col: GRID_COLS - 1, row: 15 }, "right", 1);

    // Advance a full tick — snake steps to col = GRID_COLS (out of bounds)
    const interval = snake.getTicker().interval;
    scene.update(0, interval);

    expect(scene.getPhase()).toBe("gameOver");
    expect(snake.isAlive()).toBe(false);
  });

  it("ends the run when snake hits the left wall", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.reset({ col: 0, row: 15 }, "left", 1);

    const interval = snake.getTicker().interval;
    scene.update(0, interval);

    expect(scene.getPhase()).toBe("gameOver");
  });

  it("ends the run when snake hits the top wall", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.reset({ col: 15, row: 0 }, "up", 1);

    const interval = snake.getTicker().interval;
    scene.update(0, interval);

    expect(scene.getPhase()).toBe("gameOver");
  });

  it("ends the run when snake hits the bottom wall", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.reset({ col: 15, row: GRID_ROWS - 1 }, "down", 1);

    const interval = snake.getTicker().interval;
    scene.update(0, interval);

    expect(scene.getPhase()).toBe("gameOver");
  });

  it("does not end the run when snake stays in bounds", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    // Reset to center with length 1 to avoid any self-collision issues
    snake.reset({ col: 10, row: 10 }, "right", 1);

    const interval = snake.getTicker().interval;
    scene.update(0, interval);

    expect(scene.getPhase()).toBe("playing");
    expect(snake.isAlive()).toBe(true);
  });
});

describe("MainScene – splitter obstacle collision", () => {
  it("ends the run when snake head touches a splitter obstacle", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.reset({ col: 10, row: 10 }, "right", 1);
    injectSplitterObstacle(scene, { col: 11, row: 10 });

    const interval = snake.getTicker().interval;
    scene.update(0, interval);

    expect(scene.getPhase()).toBe("gameOver");
    expect(snake.isAlive()).toBe(false);
  });

  it("does not let shield absorb splitter obstacle collisions", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    setActiveParasiteSegments(scene, [ParasiteType.Shield]);

    const snake = scene.getSnake()!;
    snake.reset({ col: 12, row: 12 }, "right", 1);
    injectSplitterObstacle(scene, { col: 13, row: 12 });

    const interval = snake.getTicker().interval;
    scene.update(0, interval);

    const parasiteState = getParasiteManager(scene).getState();
    expect(scene.getPhase()).toBe("gameOver");
    expect(snake.isAlive()).toBe(false);
    expect(parasiteState.inventory.segments).toHaveLength(1);
    expect(parasiteState.inventory.segments[0]?.type).toBe(ParasiteType.Shield);
    expect(parasiteState.blockedFoodCharges).toBe(0);
  });

  it("keeps wall/self collision precedence deterministic over splitter overlap edge cases", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    setActiveParasiteSegments(scene, [ParasiteType.Shield]);

    const snake = scene.getSnake()!;
    snake.reset({ col: 5, row: 5 }, "right", 5);
    const interval = snake.getTicker().interval;

    scene.update(0, interval);
    snake.bufferDirection("down");
    scene.update(0, interval);
    snake.bufferDirection("left");
    scene.update(0, interval);

    const preCollisionHead = snake.getHeadPosition();
    injectSplitterObstacle(scene, { col: 5, row: 5 });

    snake.bufferDirection("up");
    scene.update(0, interval);

    const parasiteState = getParasiteManager(scene).getState();
    expect(scene.getPhase()).toBe("playing");
    expect(snake.isAlive()).toBe(true);
    expect(snake.getHeadPosition()).toEqual(preCollisionHead);
    expect(parasiteState.inventory.segments).toEqual([]);
    expect(parasiteState.blockedFoodCharges).toBe(1);
  });
});

// ── Self-collision ────────────────────────────────────────────

describe("MainScene – self collision", () => {
  it("shield absorbs one self-collision and keeps the run alive", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    setActiveParasiteSegments(scene, [ParasiteType.Shield]);

    const snake = scene.getSnake()!;
    snake.reset({ col: 5, row: 5 }, "right", 5);
    const interval = snake.getTicker().interval;

    scene.update(0, interval);
    snake.bufferDirection("down");
    scene.update(0, interval);
    snake.bufferDirection("left");
    scene.update(0, interval);

    const preCollisionHead = snake.getHeadPosition();
    snake.bufferDirection("up");
    scene.update(0, interval);

    const parasiteState = getParasiteManager(scene).getState();
    expect(scene.getPhase()).toBe("playing");
    expect(snake.isAlive()).toBe(true);
    expect(snake.getHeadPosition()).toEqual(preCollisionHead);
    expect(parasiteState.inventory.segments).toEqual([]);
    expect(parasiteState.blockedFoodCharges).toBe(1);
    expect(gameBridge.getState().activeParasites).toEqual([]);
    expect(gameBridge.getState().parasitesCollected).toBe(0);
  });

  it("ends the run when snake collides with itself", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    // Create a snake long enough to collide with itself:
    // A snake at (5,5) going right, length 5, segments at:
    // (5,5) (4,5) (3,5) (2,5) (1,5)
    // If we buffer: down, left, up — the head will move into the body
    snake.reset({ col: 5, row: 5 }, "right", 5);

    const interval = snake.getTicker().interval;

    // Step 1: buffer "down", snake head moves to (5,6)? No, it should step right first
    // Actually, we need to move right first, then buffer turns to create self-collision
    // Move right: head at (6,5)
    scene.update(0, interval);
    expect(scene.getPhase()).toBe("playing");

    // Buffer down, step: head at (6,6)
    snake.bufferDirection("down");
    scene.update(0, interval);
    expect(scene.getPhase()).toBe("playing");

    // Buffer left, step: head at (5,6)
    snake.bufferDirection("left");
    scene.update(0, interval);
    expect(scene.getPhase()).toBe("playing");

    // Buffer up, step: head at (5,5) — this is now a body segment!
    snake.bufferDirection("up");
    scene.update(0, interval);
    expect(scene.getPhase()).toBe("gameOver");
    expect(snake.isAlive()).toBe(false);
  });
});

describe("MainScene – echo ghost collision", () => {
  it("ends the run via endRun side effects when snake head hits an active echo segment", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const echoGhost = scene.getEchoGhost()!;
    const endRunSpy = vi.spyOn(scene, "endRun");
    snake.reset({ col: 10, row: 10 }, "right", 1);

    mockCameraShake.mockClear();

    vi.spyOn(echoGhost, "isActive").mockReturnValue(true);
    vi.spyOn(echoGhost, "getPlaybackSegments").mockReturnValue([
      { col: 11, row: 10 },
    ]);

    const interval = snake.getTicker().interval;
    scene.update(0, interval);

    expect(endRunSpy).toHaveBeenCalledTimes(1);
    expect(scene.getPhase()).toBe("gameOver");
    expect(snake.isAlive()).toBe(false);
    expect(mockCameraShake).toHaveBeenCalledTimes(1);
  });

  it("matches self-collision fatality side effects (parity with echo-collision)", () => {
    const runSelfCollision = () => {
      const scene = new MainScene();
      scene.create();
      scene.enterPhase("playing");

      const snake = scene.getSnake()!;
      const endRunSpy = vi.spyOn(scene, "endRun");
      snake.reset({ col: 5, row: 5 }, "right", 5);

      mockCameraShake.mockClear();
      const interval = snake.getTicker().interval;
      scene.update(0, interval);
      snake.bufferDirection("down");
      scene.update(0, interval);
      snake.bufferDirection("left");
      scene.update(0, interval);
      snake.bufferDirection("up");
      scene.update(0, interval);

      return {
        phase: scene.getPhase(),
        snakeAlive: snake.isAlive(),
        endRunCalls: endRunSpy.mock.calls.length,
        cameraShakeCalls: mockCameraShake.mock.calls.length,
      };
    };

    const runEchoCollision = () => {
      const scene = new MainScene();
      scene.create();
      scene.enterPhase("playing");

      const snake = scene.getSnake()!;
      const echoGhost = scene.getEchoGhost()!;
      const endRunSpy = vi.spyOn(scene, "endRun");
      snake.reset({ col: 10, row: 10 }, "right", 1);

      vi.spyOn(echoGhost, "isActive").mockReturnValue(true);
      vi.spyOn(echoGhost, "getPlaybackSegments").mockReturnValue([
        { col: 11, row: 10 },
      ]);

      mockCameraShake.mockClear();
      const interval = snake.getTicker().interval;
      scene.update(0, interval);

      return {
        phase: scene.getPhase(),
        snakeAlive: snake.isAlive(),
        endRunCalls: endRunSpy.mock.calls.length,
        cameraShakeCalls: mockCameraShake.mock.calls.length,
      };
    };

    const selfCollisionOutcome = runSelfCollision();
    resetBridge();
    const echoCollisionOutcome = runEchoCollision();

    expect(selfCollisionOutcome).toEqual({
      phase: "gameOver",
      snakeAlive: false,
      endRunCalls: 1,
      cameraShakeCalls: 1,
    });
    expect(echoCollisionOutcome).toEqual(selfCollisionOutcome);
  });

  it("does not collide with playback segments while echo ghost is inactive", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const echoGhost = scene.getEchoGhost()!;
    snake.reset({ col: 10, row: 10 }, "right", 1);

    mockCameraShake.mockClear();
    vi.spyOn(echoGhost, "isActive").mockReturnValue(false);
    vi.spyOn(echoGhost, "getPlaybackSegments").mockReturnValue([
      { col: 11, row: 10 },
    ]);

    const interval = snake.getTicker().interval;
    scene.update(0, interval);

    expect(scene.getPhase()).toBe("playing");
    expect(snake.isAlive()).toBe(true);
    expect(mockCameraShake).not.toHaveBeenCalled();
  });
});

// ── endRun kills the snake ──────────────────────────────────────

describe("MainScene – endRun kills snake", () => {
  it("kills the snake when endRun is called", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    expect(snake.isAlive()).toBe(true);

    scene.endRun();
    expect(snake.isAlive()).toBe(false);
  });

  it("endRun is idempotent when snake is already dead", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.kill();

    expect(() => scene.endRun()).not.toThrow();
    expect(scene.getPhase()).toBe("gameOver");
  });
});

// ── Deterministic reset / replay ────────────────────────────────

describe("MainScene – deterministic reset / replay", () => {
  it("uses injected RNG for food placement", () => {
    const scene = new MainScene();
    scene.create();

    // Set a deterministic RNG
    let callCount = 0;
    const deterministicRng = () => {
      callCount++;
      return 0.5;
    };
    scene.setRng(deterministicRng);

    scene.enterPhase("playing");

    // The RNG should have been called at least once (for initial food placement)
    expect(callCount).toBeGreaterThan(0);
  });

  it("same RNG produces same food position across replays", () => {
    const scene = new MainScene();
    scene.create();

    const makeRng = () => {
      let i = 0;
      return () => {
        i++;
        return (i * 0.37) % 1; // deterministic sequence
      };
    };

    // First run
    scene.setRng(makeRng());
    scene.enterPhase("playing");
    const firstFoodPos = scene.getFood()!.getPosition();
    scene.endRun();

    // Second run with same RNG sequence
    scene.setRng(makeRng());
    scene.enterPhase("playing");
    const secondFoodPos = scene.getFood()!.getPosition();

    expect(firstFoodPos).toEqual(secondFoodPos);
  });

  it("snake starts at same position on each replay", () => {
    const scene = new MainScene();
    scene.create();

    scene.enterPhase("playing");
    const firstHead = scene.getSnake()!.getHeadPosition();
    scene.endRun();

    scene.enterPhase("playing");
    const secondHead = scene.getSnake()!.getHeadPosition();

    expect(firstHead).toEqual(secondHead);
  });

  it("score and time are reset on replay", () => {
    const scene = new MainScene();
    scene.create();

    scene.enterPhase("playing");
    scene.addScore(42);
    scene.update(0, 5000);
    scene.endRun();

    scene.enterPhase("playing");
    expect(scene.getScore()).toBe(0);
    expect(scene.getElapsedTime()).toBe(0);
  });

  it("setRng / getRng roundtrip", () => {
    const scene = new MainScene();
    const rng = () => 0.42;
    scene.setRng(rng);
    expect(scene.getRng()).toBe(rng);
  });

  it("snake is freshly alive on replay after game over", () => {
    const scene = new MainScene();
    scene.create();

    scene.enterPhase("playing");
    scene.endRun();

    scene.enterPhase("playing");
    expect(scene.getSnake()!.isAlive()).toBe(true);
  });

  it("food position is within bounds on replay", () => {
    const scene = new MainScene();
    scene.create();

    scene.enterPhase("playing");
    scene.endRun();

    scene.enterPhase("playing");
    const pos = scene.getFood()!.getPosition();
    expect(pos.col).toBeGreaterThanOrEqual(0);
    expect(pos.col).toBeLessThan(GRID_COLS);
    expect(pos.row).toBeGreaterThanOrEqual(0);
    expect(pos.row).toBeLessThan(GRID_ROWS);
  });
});

// ── update() integration ────────────────────────────────────────

describe("MainScene – update integration", () => {
  it("update does not crash when phase is start (no entities)", () => {
    const scene = new MainScene();
    scene.create();
    // Phase is "start", no snake or food
    expect(() => scene.update(0, 16)).not.toThrow();
  });

  it("update does not crash after endRun (phase is gameOver)", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.endRun();
    expect(() => scene.update(0, 16)).not.toThrow();
  });

  it("update advances snake and checks food when playing", () => {
    const scene = new MainScene();
    scene.create();
    scene.setRng(() => 0.5);
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const initialHead = snake.getHeadPosition();

    // Advance past a full tick
    const interval = snake.getTicker().interval;
    scene.update(0, interval);

    // Snake should have moved (unless wall collision happened)
    if (scene.getPhase() === "playing") {
      const newHead = snake.getHeadPosition();
      expect(newHead.col).not.toBe(initialHead.col);
    }
  });
});
