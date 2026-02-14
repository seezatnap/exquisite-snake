import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { gameBridge } from "@/game/bridge";
import { GRID_COLS, GRID_ROWS } from "@/game/config";

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
    setAlpha: vi.fn(),
    setVisible: vi.fn(),
    visible: true,
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
        stop: vi.fn(),
        start: vi.fn(),
        setPosition: vi.fn(),
        emitting: true,
        particleAlpha: 1,
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

/** Reset the singleton bridge to its initial state between tests. */
function resetBridge(): void {
  gameBridge.setPhase("start");
  gameBridge.setScore(0);
  gameBridge.setHighScore(0);
  gameBridge.setElapsedTime(0);
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

// ── Echo ghost integration ────────────────────────────────────────

describe("MainScene – echo ghost integration", () => {
  it("echoGhost is null before entering 'playing'", () => {
    const scene = new MainScene();
    scene.create();
    expect(scene.getEchoGhost()).toBeNull();
  });

  it("creates echoGhost when entering 'playing'", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    expect(scene.getEchoGhost()).not.toBeNull();
  });

  it("echoGhost starts with zero ticks recorded", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    const ghost = scene.getEchoGhost()!;
    expect(ghost.getCurrentTick()).toBe(0);
    expect(ghost.isActive()).toBe(false);
  });

  it("records snake segments into echoGhost each tick", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    // Reset to center with length 1 to avoid self-collision during steps
    snake.reset({ col: 10, row: 15 }, "right", 1);

    const interval = snake.getTicker().interval;
    const ghost = scene.getEchoGhost()!;

    // Advance 3 ticks
    scene.update(0, interval);
    scene.update(0, interval);
    scene.update(0, interval);

    expect(ghost.getCurrentTick()).toBe(3);
    expect(ghost.getCount()).toBe(3);
  });

  it("ghost is inactive before 5 seconds (40 ticks at 125ms)", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.reset({ col: 0, row: 15 }, "right", 1);

    const interval = snake.getTicker().interval;
    const ghost = scene.getEchoGhost()!;

    // Advance 39 ticks — just under the 5-second delay
    for (let i = 0; i < 39; i++) {
      scene.update(0, interval);
    }

    expect(ghost.getCurrentTick()).toBe(39);
    expect(ghost.isActive()).toBe(false);
    expect(ghost.getGhostTrail()).toBeNull();
  });

  it("ghost becomes active after exactly 40 ticks (5 seconds at 125ms)", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const ghost = scene.getEchoGhost()!;
    const interval = snake.getTicker().interval;

    // Snake zig-zags to stay in bounds for 40+ ticks.
    // Start at col=1 going right, length 1. After 37 steps right,
    // we'll be at col=38. Turn down, then left to stay in bounds.
    snake.reset({ col: 1, row: 1 }, "right", 1);

    // 37 steps right (col 1 → 38)
    for (let i = 0; i < 37; i++) {
      scene.update(0, interval);
    }
    expect(ghost.getCurrentTick()).toBe(37);
    expect(ghost.isActive()).toBe(false);

    // Turn down for 3 more steps to reach 40 total
    snake.bufferDirection("down");
    scene.update(0, interval); // tick 38
    scene.update(0, interval); // tick 39
    scene.update(0, interval); // tick 40

    expect(ghost.getCurrentTick()).toBe(40);
    expect(ghost.isActive()).toBe(true);
    expect(ghost.getGhostTrail()).not.toBeNull();
  });

  it("ghost trail contains the snake position from 40 ticks ago", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const ghost = scene.getEchoGhost()!;
    const interval = snake.getTicker().interval;

    // Start at col=1 going right, length 1
    snake.reset({ col: 1, row: 15 }, "right", 1);

    // 37 steps right (col 1 → 38)
    for (let i = 0; i < 37; i++) {
      scene.update(0, interval);
    }

    // Turn down for remaining ticks
    snake.bufferDirection("down");
    for (let i = 0; i < 3; i++) {
      scene.update(0, interval);
    }

    // Ghost has 40 ticks recorded, trail shows tick 0
    const trail = ghost.getGhostTrail()!;
    expect(trail).not.toBeNull();
    // Tick 0 recorded the snake at col=2 (started at col=1, stepped right)
    expect(trail[0].col).toBe(2);
    expect(trail[0].row).toBe(15);
  });

  it("does not record when game is not in playing phase", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const ghost = scene.getEchoGhost()!;
    scene.endRun(); // game over

    const tickBefore = ghost.getCurrentTick();
    scene.update(0, 1000);
    expect(ghost.getCurrentTick()).toBe(tickBefore);
  });

  it("echoGhost is null after endRun and new enterPhase('playing')", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const firstGhost = scene.getEchoGhost();
    expect(firstGhost).not.toBeNull();

    scene.endRun();
    scene.enterPhase("playing");

    const secondGhost = scene.getEchoGhost();
    expect(secondGhost).not.toBeNull();
    expect(secondGhost).not.toBe(firstGhost);
    expect(secondGhost!.getCurrentTick()).toBe(0);
  });

  it("does not affect existing movement logic", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.reset({ col: 10, row: 15 }, "right", 1);

    const interval = snake.getTicker().interval;
    scene.update(0, interval);

    // Snake should have moved right
    expect(snake.getHeadPosition().col).toBe(11);
    expect(snake.getHeadPosition().row).toBe(15);
    expect(scene.getPhase()).toBe("playing");
  });

  it("does not affect existing food logic", () => {
    const scene = new MainScene();
    scene.create();
    scene.setRng(() => 0.5);
    scene.enterPhase("playing");

    const food = scene.getFood()!;
    const foodPos = food.getPosition();

    // Food should exist and be at a valid position
    expect(foodPos.col).toBeGreaterThanOrEqual(0);
    expect(foodPos.col).toBeLessThan(GRID_COLS);
    expect(foodPos.row).toBeGreaterThanOrEqual(0);
    expect(foodPos.row).toBeLessThan(GRID_ROWS);
  });

  it("echoGhost uses default tick interval matching snake movement", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const ghost = scene.getEchoGhost()!;
    // Default delay should be 40 ticks (5000ms / 125ms)
    expect(ghost.delayInTicks).toBe(40);
  });

  it("shutdown cleans up echoGhost", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    expect(scene.getEchoGhost()).not.toBeNull();

    scene.shutdown();
    expect(scene.getEchoGhost()).toBeNull();
  });
});

// ── Echo ghost collision ─────────────────────────────────────────

describe("MainScene – echo ghost collision", () => {
  it("ends the run when snake head overlaps a ghost trail segment", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const ghost = scene.getEchoGhost()!;
    const interval = snake.getTicker().interval;

    // Start snake at col=1, row=1, going right, length=1
    snake.reset({ col: 1, row: 1 }, "right", 1);

    // Advance 37 ticks going right (col 1 → 38)
    for (let i = 0; i < 37; i++) {
      scene.update(0, interval);
    }
    expect(scene.getPhase()).toBe("playing");

    // Turn down for 3 more ticks to reach 40 total, ghost now active
    snake.bufferDirection("down");
    scene.update(0, interval); // tick 38
    scene.update(0, interval); // tick 39
    scene.update(0, interval); // tick 40, ghost active

    expect(ghost.isActive()).toBe(true);
    expect(scene.getPhase()).toBe("playing");

    // Ghost trail at tick 40 shows the position from tick 0 (col=2, row=1).
    // Steer snake back toward that position. Snake is at col=38, row=4.
    // Turn left to go back.
    snake.bufferDirection("left");
    // We need to reach col=2, row=4 (or wherever the ghost trail is).
    // The ghost trail from tick 0 was at col=2, row=1.
    // Instead of navigating back 36 columns, let's test with a fresh approach.
    // We know the ghost trail from 40 ticks ago is at (2, 1).

    // Let's verify the ghost is active and the trail position
    const trail = ghost.getGhostTrail()!;
    expect(trail).not.toBeNull();
    expect(trail[0].col).toBe(2);
    expect(trail[0].row).toBe(1);

    // Now, directly place the snake's head at the ghost trail position
    // and trigger a collision check via update
    snake.reset({ col: 1, row: 1 }, "right", 1);
    // On next update, snake steps to col=2, row=1 — matching ghost trail
    scene.update(0, interval);

    expect(scene.getPhase()).toBe("gameOver");
    expect(snake.isAlive()).toBe(false);
  });

  it("does not trigger ghost collision before ghost is active", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const ghost = scene.getEchoGhost()!;
    const interval = snake.getTicker().interval;

    // Snake starts at center going right, length 1
    snake.reset({ col: 10, row: 15 }, "right", 1);

    // Advance a few ticks — ghost is still warming
    for (let i = 0; i < 5; i++) {
      scene.update(0, interval);
    }

    expect(ghost.isActive()).toBe(false);
    expect(ghost.getGhostTrail()).toBeNull();
    expect(scene.getPhase()).toBe("playing");
  });

  it("does not trigger ghost collision when head is not on ghost trail", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const ghost = scene.getEchoGhost()!;
    const interval = snake.getTicker().interval;

    // Start snake at col=1, row=1, going right, length=1
    snake.reset({ col: 1, row: 1 }, "right", 1);

    // Advance 37 ticks going right
    for (let i = 0; i < 37; i++) {
      scene.update(0, interval);
    }

    // Turn down for 3 more ticks to reach tick 40
    snake.bufferDirection("down");
    scene.update(0, interval);
    scene.update(0, interval);
    scene.update(0, interval);

    expect(ghost.isActive()).toBe(true);

    // Snake is now at col=38, row=4 — far from ghost trail at col=2, row=1
    // Continue stepping down, which is away from the ghost trail
    scene.update(0, interval);
    scene.update(0, interval);

    expect(scene.getPhase()).toBe("playing");
    expect(snake.isAlive()).toBe(true);
  });

  it("ghost collision triggers same game-over flow as self-collision", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const ghost = scene.getEchoGhost()!;
    const interval = snake.getTicker().interval;

    snake.reset({ col: 1, row: 1 }, "right", 1);

    // Fill 40 ticks to activate ghost
    for (let i = 0; i < 37; i++) {
      scene.update(0, interval);
    }
    snake.bufferDirection("down");
    scene.update(0, interval);
    scene.update(0, interval);
    scene.update(0, interval);

    expect(ghost.isActive()).toBe(true);

    // Add score to test high-score update on ghost collision
    scene.addScore(42);

    // Place snake at ghost trail position and trigger collision
    snake.reset({ col: 1, row: 1 }, "right", 1);
    scene.update(0, interval);

    // Same outcome as self-collision: gameOver, snake dead, high score updated
    expect(scene.getPhase()).toBe("gameOver");
    expect(snake.isAlive()).toBe(false);
    expect(scene.getHighScore()).toBe(42);
  });

  it("ghost collision stops recording on the echo ghost", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const ghost = scene.getEchoGhost()!;
    const interval = snake.getTicker().interval;

    snake.reset({ col: 1, row: 1 }, "right", 1);

    // Fill 40 ticks to activate ghost
    for (let i = 0; i < 37; i++) {
      scene.update(0, interval);
    }
    snake.bufferDirection("down");
    scene.update(0, interval);
    scene.update(0, interval);
    scene.update(0, interval);

    expect(ghost.isRecordingStopped()).toBe(false);

    // Trigger ghost collision
    snake.reset({ col: 1, row: 1 }, "right", 1);
    scene.update(0, interval);

    // endRun calls stopRecording on the ghost
    expect(ghost.isRecordingStopped()).toBe(true);
  });

  it("ghost collision with any segment of the trail ends the run", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const ghost = scene.getEchoGhost()!;
    const interval = snake.getTicker().interval;

    // Use a length-3 snake so the ghost trail has 3 segments
    snake.reset({ col: 1, row: 1 }, "right", 3);

    // Fill 40 ticks to activate ghost. Start at col 1, segments trail left.
    for (let i = 0; i < 37; i++) {
      scene.update(0, interval);
    }
    snake.bufferDirection("down");
    scene.update(0, interval);
    scene.update(0, interval);
    scene.update(0, interval);

    expect(ghost.isActive()).toBe(true);

    // Ghost trail from 40 ticks ago has 3 segments.
    // Tick 0 recorded: head at (2,1), body at (1,1), body at (0,1)
    const trail = ghost.getGhostTrail()!;
    expect(trail.length).toBe(3);

    // Place snake head to hit the second ghost segment (body, not head)
    // The second segment of the trail is at (1, 1)
    const targetSeg = trail[1];
    snake.reset(
      { col: targetSeg.col - 1, row: targetSeg.row },
      "right",
      1,
    );
    scene.update(0, interval);

    expect(scene.getPhase()).toBe("gameOver");
    expect(snake.isAlive()).toBe(false);
  });
});

// ── Source-level checks for echo ghost integration ──────────────

describe("MainScene source – echo ghost integration", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/game/scenes/MainScene.ts"),
    "utf-8",
  );

  it("imports EchoGhost from entities", () => {
    expect(source).toContain("EchoGhost");
    expect(source).toContain("entities/EchoGhost");
  });

  it("has an echoGhost field", () => {
    expect(source).toMatch(/private\s+echoGhost/);
  });

  it("creates EchoGhost in createEntities", () => {
    expect(source).toContain("new EchoGhost()");
  });

  it("records segments in update loop", () => {
    expect(source).toContain("this.echoGhost.record");
  });

  it("exposes getEchoGhost accessor", () => {
    expect(source).toContain("getEchoGhost()");
  });

  it("checks ghost trail in collision detection", () => {
    expect(source).toContain("getGhostTrail()");
    expect(source).toContain("gridEquals(head, seg)");
  });
});
