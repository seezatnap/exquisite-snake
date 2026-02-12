import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { gameBridge } from "@/game/bridge";
import { GRID_COLS, GRID_ROWS, ARENA_WIDTH, ARENA_HEIGHT, TILE_SIZE } from "@/game/config";

const ROOT = path.resolve(__dirname, "../..");

// ── Phaser mock ──────────────────────────────────────────────────
const mockShake = vi.fn();
const mockEmitterDestroy = vi.fn();
const mockExplode = vi.fn();
const mockDelayedCall = vi.fn();
const mockTexturesExists = vi.fn().mockReturnValue(true);

function createMockEmitter() {
  return { explode: mockExplode, destroy: mockEmitterDestroy };
}

const mockAddParticles = vi.fn(() => createMockEmitter());

const mockGraphics = {
  lineStyle: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  strokePath: vi.fn(),
};

const mockDestroy = vi.fn();
const mockSetPosition = vi.fn();
const mockKeyboardOn = vi.fn();

function createMockSprite() {
  return { destroy: mockDestroy, setPosition: mockSetPosition, x: 0, y: 0 };
}

vi.mock("phaser", () => {
  class MockScene {
    scene = { start: vi.fn() };
    add = {
      graphics: () => mockGraphics,
      sprite: vi.fn(() => createMockSprite()),
      particles: mockAddParticles,
    };
    input = { keyboard: { on: mockKeyboardOn, off: vi.fn() } };
    cameras = { main: { shake: mockShake } };
    textures = { exists: mockTexturesExists };
    time = { delayedCall: mockDelayedCall };
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

import { MainScene } from "@/game/scenes/MainScene";
import { gridEquals } from "@/game/utils/grid";

function resetBridge(): void {
  gameBridge.setPhase("start");
  gameBridge.setScore(0);
  gameBridge.setHighScore(0);
  gameBridge.setElapsedTime(0);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetBridge();
  localStorage.clear();
});

// ── Full gameplay session simulation ────────────────────────────

describe("End-to-end gameplay QA", () => {
  it("complete game session: start → play → eat food → game over → replay", () => {
    const scene = new MainScene();
    scene.create();

    // Phase 1: Start
    expect(scene.getPhase()).toBe("start");
    expect(scene.getScore()).toBe(0);

    // Phase 2: Begin playing
    scene.enterPhase("playing");
    expect(scene.getPhase()).toBe("playing");
    expect(scene.getSnake()).not.toBeNull();
    expect(scene.getFood()).not.toBeNull();
    expect(scene.getSnake()!.isAlive()).toBe(true);
    expect(scene.getScore()).toBe(0);
    expect(scene.getElapsedTime()).toBe(0);

    // Phase 3: Simulate gameplay (multiple update cycles)
    const interval = scene.getSnake()!.getTicker().interval;
    for (let i = 0; i < 5; i++) {
      scene.update(0, interval);
      if (scene.getPhase() !== "playing") break;
    }

    // Phase 4: Elapsed time should have accumulated
    expect(scene.getElapsedTime()).toBeGreaterThan(0);

    // Phase 5: End the run
    scene.endRun();
    expect(scene.getPhase()).toBe("gameOver");
    expect(scene.getSnake()!.isAlive()).toBe(false);

    // Phase 6: Replay
    scene.enterPhase("playing");
    expect(scene.getPhase()).toBe("playing");
    expect(scene.getScore()).toBe(0);
    expect(scene.getElapsedTime()).toBe(0);
    expect(scene.getSnake()!.isAlive()).toBe(true);
  });

  it("score increments when snake eats food", () => {
    const scene = new MainScene();
    scene.create();

    // Use deterministic RNG so food spawns at a predictable interior position.
    // With rng = () => 0.5 the food lands roughly in the middle of the free-cell
    // list, which is always well inside the 40×30 grid.
    scene.setRng(() => 0.5);

    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const food = scene.getFood()!;
    const foodPos = food.getPosition();

    // Sanity: food must be inside the grid so we can place the snake adjacent
    expect(foodPos.col).toBeGreaterThanOrEqual(1);
    expect(foodPos.col).toBeLessThan(GRID_COLS);
    expect(foodPos.row).toBeGreaterThanOrEqual(0);
    expect(foodPos.row).toBeLessThan(GRID_ROWS);

    // Deterministically place the snake one cell to the left of food, heading
    // right, with length 1 so no body segments interfere.
    snake.reset({ col: foodPos.col - 1, row: foodPos.row }, "right", 1);

    expect(scene.getScore()).toBe(0);

    // One full tick moves the snake onto the food cell
    const interval = snake.getTicker().interval;
    scene.update(0, interval);

    // The snake must now be on the food's original position
    expect(gridEquals(snake.getHeadPosition(), foodPos)).toBe(true);

    // Score must have incremented — unconditional assertion
    expect(scene.getScore()).toBeGreaterThan(0);
  });

  it("high score persists across game sessions", () => {
    const scene = new MainScene();
    scene.create();

    // Play and score
    scene.enterPhase("playing");
    scene.addScore(50);
    scene.endRun();

    expect(scene.getHighScore()).toBe(50);
    expect(localStorage.getItem("exquisite-snake:highScore")).toBe("50");

    // Replay with lower score
    scene.enterPhase("playing");
    scene.addScore(30);
    scene.endRun();

    expect(scene.getHighScore()).toBe(50); // high score unchanged
    expect(localStorage.getItem("exquisite-snake:highScore")).toBe("50");

    // Replay with higher score
    scene.enterPhase("playing");
    scene.addScore(75);
    scene.endRun();

    expect(scene.getHighScore()).toBe(75);
    expect(localStorage.getItem("exquisite-snake:highScore")).toBe("75");
  });

  it("game bridge state is consistent throughout game lifecycle", () => {
    const scene = new MainScene();
    scene.create();

    // Start phase
    let state = gameBridge.getState();
    expect(state.phase).toBe("start");
    expect(state.score).toBe(0);

    // Playing phase
    scene.enterPhase("playing");
    state = gameBridge.getState();
    expect(state.phase).toBe("playing");
    expect(state.score).toBe(0);
    expect(state.elapsedTime).toBe(0);

    // Add score
    scene.addScore(10);
    state = gameBridge.getState();
    expect(state.score).toBe(10);

    // Update to accumulate time
    scene.update(0, 100);
    state = gameBridge.getState();
    expect(state.elapsedTime).toBe(100);

    // Game over
    scene.endRun();
    state = gameBridge.getState();
    expect(state.phase).toBe("gameOver");
    expect(state.score).toBe(10);
  });

  it("snake starts at center grid position on every new game", () => {
    const scene = new MainScene();
    scene.create();

    for (let i = 0; i < 3; i++) {
      scene.enterPhase("playing");

      const head = scene.getSnake()!.getHeadPosition();
      expect(head.col).toBe(Math.floor(GRID_COLS / 2));
      expect(head.row).toBe(Math.floor(GRID_ROWS / 2));

      scene.endRun();
    }
  });

  it("food is always within arena bounds during gameplay", () => {
    const scene = new MainScene();
    scene.create();
    scene.setRng(() => Math.random());
    scene.enterPhase("playing");

    const food = scene.getFood()!;
    const pos = food.getPosition();

    expect(pos.col).toBeGreaterThanOrEqual(0);
    expect(pos.col).toBeLessThan(GRID_COLS);
    expect(pos.row).toBeGreaterThanOrEqual(0);
    expect(pos.row).toBeLessThan(GRID_ROWS);
  });

  it("camera shakes on game over", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    mockShake.mockClear();
    scene.endRun();

    expect(mockShake).toHaveBeenCalled();
  });

  it("wall collision triggers game over from each direction", () => {
    const directions = [
      { pos: { col: GRID_COLS - 1, row: 15 } as const, dir: "right" as const },
      { pos: { col: 0, row: 15 } as const, dir: "left" as const },
      { pos: { col: 15, row: 0 } as const, dir: "up" as const },
      { pos: { col: 15, row: GRID_ROWS - 1 } as const, dir: "down" as const },
    ];

    for (const { pos, dir } of directions) {
      resetBridge();
      const scene = new MainScene();
      scene.create();
      scene.enterPhase("playing");

      const snake = scene.getSnake()!;
      snake.reset(pos, dir, 1);

      const interval = snake.getTicker().interval;
      scene.update(0, interval);

      expect(scene.getPhase()).toBe("gameOver");
    }
  });

  it("elapsed time does not tick during start or gameOver phases", () => {
    const scene = new MainScene();
    scene.create();

    // Start phase
    scene.update(0, 1000);
    expect(scene.getElapsedTime()).toBe(0);

    // Playing phase
    scene.enterPhase("playing");
    scene.update(0, 100);
    const timeWhilePlaying = scene.getElapsedTime();
    expect(timeWhilePlaying).toBeGreaterThan(0);

    // Game over phase
    scene.endRun();
    const timeAtGameOver = scene.getElapsedTime();
    scene.update(0, 1000);
    expect(scene.getElapsedTime()).toBe(timeAtGameOver);
  });
});

// ── Deterministic replay QA ──────────────────────────────────────

describe("Deterministic replay QA", () => {
  it("same RNG seed produces identical food placements across replays", () => {
    const makeRng = () => {
      let i = 0;
      return () => {
        i++;
        return (i * 0.37) % 1;
      };
    };

    const scene = new MainScene();
    scene.create();

    const positions: Array<{ col: number; row: number }> = [];

    for (let run = 0; run < 3; run++) {
      scene.setRng(makeRng());
      scene.enterPhase("playing");
      positions.push(scene.getFood()!.getPosition());
      scene.endRun();
    }

    // All runs should produce the same initial food position
    expect(positions[0]).toEqual(positions[1]);
    expect(positions[1]).toEqual(positions[2]);
  });

  it("replay resets all per-run state cleanly", () => {
    const scene = new MainScene();
    scene.create();

    // First run
    scene.enterPhase("playing");
    scene.addScore(50);
    scene.update(0, 5000);
    const firstSnake = scene.getSnake();
    scene.endRun();

    // Second run
    scene.enterPhase("playing");

    // All per-run state should be fresh
    expect(scene.getScore()).toBe(0);
    expect(scene.getElapsedTime()).toBe(0);
    expect(scene.getSnake()).not.toBe(firstSnake);
    expect(scene.getSnake()!.isAlive()).toBe(true);
    expect(scene.getSnake()!.getLength()).toBe(3);
  });
});

// ── Static export validation ─────────────────────────────────────

describe("Static export production readiness", () => {
  it("next.config.ts has output: 'export'", () => {
    const configPath = path.join(ROOT, "next.config.ts");
    const content = fs.readFileSync(configPath, "utf-8");
    expect(content).toContain('output: "export"');
  });

  it("no server-side features in page.tsx (no getServerSideProps, no 'use server')", () => {
    const pagePath = path.join(ROOT, "src/app/page.tsx");
    const content = fs.readFileSync(pagePath, "utf-8");
    expect(content).not.toContain("getServerSideProps");
    expect(content).not.toContain("'use server'");
    expect(content).not.toContain('"use server"');
  });

  it("page.tsx dynamically imports Game with ssr: false", () => {
    const pagePath = path.join(ROOT, "src/app/page.tsx");
    const content = fs.readFileSync(pagePath, "utf-8");
    expect(content).toContain("ssr: false");
    expect(content).toContain("dynamic(");
  });

  it("config.ts does not import Phaser at the top level (SSR safe)", () => {
    const configPath = path.join(ROOT, "src/game/config.ts");
    const content = fs.readFileSync(configPath, "utf-8");
    // Should not have a top-level `import Phaser` or `import * from 'phaser'`
    expect(content).not.toMatch(/^import\s+(?:Phaser|\*\s+as\s+Phaser)\s+from\s+['"]phaser['"]/m);
  });

  it("layout.tsx exists and exports a default function", () => {
    const layoutPath = path.join(ROOT, "src/app/layout.tsx");
    const content = fs.readFileSync(layoutPath, "utf-8");
    expect(content).toContain("export default");
  });

  it("all required source files exist", () => {
    const requiredFiles = [
      "src/app/page.tsx",
      "src/app/layout.tsx",
      "src/components/Game.tsx",
      "src/components/HUD.tsx",
      "src/components/StartScreen.tsx",
      "src/components/GameOver.tsx",
      "src/game/config.ts",
      "src/game/bridge.ts",
      "src/game/scenes/Boot.ts",
      "src/game/scenes/MainScene.ts",
      "src/game/entities/Snake.ts",
      "src/game/entities/Food.ts",
      "src/game/utils/grid.ts",
      "src/game/utils/storage.ts",
      "src/game/utils/responsive.ts",
      "src/game/utils/touchInput.ts",
      "src/game/systems/effects.ts",
      "src/styles/globals.css",
    ];

    for (const file of requiredFiles) {
      const fullPath = path.join(ROOT, file);
      expect(fs.existsSync(fullPath)).toBe(true);
    }
  });

  it("arena dimensions are sensible for game display", () => {
    expect(ARENA_WIDTH).toBeGreaterThanOrEqual(400);
    expect(ARENA_HEIGHT).toBeGreaterThanOrEqual(300);
    expect(ARENA_WIDTH).toBeLessThanOrEqual(1920);
    expect(ARENA_HEIGHT).toBeLessThanOrEqual(1080);
    expect(TILE_SIZE).toBeGreaterThanOrEqual(10);
    expect(TILE_SIZE).toBeLessThanOrEqual(50);
  });

  it("grid dimensions produce at least 10x10 playable area", () => {
    expect(GRID_COLS).toBeGreaterThanOrEqual(10);
    expect(GRID_ROWS).toBeGreaterThanOrEqual(10);
  });

  it("package.json has all required scripts", () => {
    const pkgPath = path.join(ROOT, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

    expect(pkg.scripts.build).toBeDefined();
    expect(pkg.scripts.dev).toBeDefined();
    expect(pkg.scripts.test).toBeDefined();
    expect(pkg.scripts.lint).toBeDefined();
    expect(pkg.scripts.typecheck).toBeDefined();
  });

  it("no development-only debug flags in game config", () => {
    const configPath = path.join(ROOT, "src/game/config.ts");
    const content = fs.readFileSync(configPath, "utf-8");
    // Arcade physics debug should be false in production
    expect(content).toContain("debug: false");
  });
});
