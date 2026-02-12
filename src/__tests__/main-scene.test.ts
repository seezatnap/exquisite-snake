import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { gameBridge } from "@/game/bridge";
import { GRID_COLS, GRID_ROWS } from "@/game/config";
import { Biome } from "@/game/systems/BiomeManager";

const ROOT = path.resolve(__dirname, "../..");

// ── Phaser mock ──────────────────────────────────────────────────
const mockLineStyle = vi.fn();
const mockMoveTo = vi.fn();
const mockLineTo = vi.fn();
const mockStrokePath = vi.fn();

const mockGraphics = {
  lineStyle: mockLineStyle,
  moveTo: mockMoveTo,
  lineTo: mockLineTo,
  strokePath: mockStrokePath,
};

const mockSceneStart = vi.fn();
const mockDestroy = vi.fn();
const mockSetPosition = vi.fn();
const mockKeyboardOn = vi.fn();

function createMockSprite() {
  return {
    destroy: mockDestroy,
    setPosition: mockSetPosition,
    x: 0,
    y: 0,
  };
}

vi.mock("phaser", () => {
  class MockScene {
    scene = { start: mockSceneStart };
    add = {
      graphics: () => mockGraphics,
      sprite: vi.fn(() => createMockSprite()),
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
        shake: vi.fn(),
      },
    };
    textures = {
      exists: vi.fn().mockReturnValue(true),
    };
    time = {
      delayedCall: vi.fn(),
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

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(60_000); // isolate biome timing from movement
    scene.update(0, 45_000); // Neon -> Ice
    scene.update(0, 45_000); // Ice -> Molten
    expect(scene.getCurrentBiome()).toBe(Biome.MoltenCore);

    snake.reset({ col: 10, row: 10 }, "right", 1);
    snake.getTicker().setInterval(100);
    snake.bufferDirection("up");

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
  it("creates snake and food when entering 'playing'", () => {
    const scene = new MainScene();
    scene.create();

    expect(scene.getSnake()).toBeNull();
    expect(scene.getFood()).toBeNull();

    scene.enterPhase("playing");

    expect(scene.getSnake()).not.toBeNull();
    expect(scene.getFood()).not.toBeNull();
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

  it("destroys old entities on replay (entering 'playing' again)", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const firstSnake = scene.getSnake();
    const firstFood = scene.getFood();

    scene.endRun();
    scene.enterPhase("playing");

    // New entities should be created (different instances)
    expect(scene.getSnake()).not.toBe(firstSnake);
    expect(scene.getFood()).not.toBe(firstFood);
    expect(scene.getSnake()).not.toBeNull();
    expect(scene.getFood()).not.toBeNull();
  });
});

// ── Wall collision ─────────────────────────────────────────────

describe("MainScene – wall collision", () => {
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

// ── Self-collision ────────────────────────────────────────────

describe("MainScene – self collision", () => {
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
