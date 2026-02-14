import { describe, it, expect, vi, beforeEach } from "vitest";
import { gameBridge } from "@/game/bridge";
import { GRID_COLS, GRID_ROWS, RENDER_DEPTH, TEXTURE_KEYS } from "@/game/config";
import {
  PARASITE_COLORS,
  PARASITE_PICKUP_SPAWN_INTERVAL_MS,
  SPLITTER_OBSTACLE_INTERVAL_MS,
  ParasiteType,
  createParasiteRuntimeState,
} from "@/game/entities/Parasite";
import { Biome } from "@/game/systems/BiomeManager";

function createMockGraphics() {
  return {
    lineStyle: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    strokePath: vi.fn(),
    fillStyle: vi.fn(),
    fillRect: vi.fn(),
    fillCircle: vi.fn(),
    clear: vi.fn(),
    destroy: vi.fn(),
    setDepth: vi.fn(),
  };
}

function createMockSprite() {
  return {
    destroy: vi.fn(),
    setPosition: vi.fn(),
    setDepth: vi.fn(),
    setVisible: vi.fn(),
    setScale: vi.fn(),
    setTint: vi.fn(),
    setTexture: vi.fn(),
    x: 0,
    y: 0,
  };
}

function createMockText() {
  return {
    setOrigin: vi.fn(),
    setDepth: vi.fn(),
    setAlpha: vi.fn(),
    setVisible: vi.fn(),
    setText: vi.fn(),
    setPosition: vi.fn(),
    destroy: vi.fn(),
  };
}

function getApproachVector(target: { col: number; row: number }): {
  head: { col: number; row: number };
  direction: "up" | "down" | "left" | "right";
} {
  if (target.col > 0) {
    return {
      head: { col: target.col - 1, row: target.row },
      direction: "right",
    };
  }
  if (target.col < GRID_COLS - 1) {
    return {
      head: { col: target.col + 1, row: target.row },
      direction: "left",
    };
  }
  if (target.row > 0) {
    return {
      head: { col: target.col, row: target.row - 1 },
      direction: "down",
    };
  }
  return {
    head: { col: target.col, row: Math.min(GRID_ROWS - 1, target.row + 1) },
    direction: "up",
  };
}

vi.mock("phaser", () => {
  class MockScene {
    scene = { start: vi.fn() };
    add = {
      graphics: vi.fn(() => createMockGraphics()),
      sprite: vi.fn(() => createMockSprite()),
      text: vi.fn(() => createMockText()),
      particles: vi.fn(() => ({
        explode: vi.fn(),
        destroy: vi.fn(),
      })),
    };
    input = {
      keyboard: {
        on: vi.fn(),
        off: vi.fn(),
      },
    };
    cameras = {
      main: {
        shake: vi.fn(),
        setBackgroundColor: vi.fn(),
      },
    };
    textures = {
      exists: vi.fn().mockReturnValue(true),
    };
    time = {
      delayedCall: vi.fn(),
    };
    children = {
      depthSort: vi.fn(),
    };
    game = {
      canvas: null,
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

import { MainScene } from "@/game/scenes/MainScene";

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

beforeEach(() => {
  vi.clearAllMocks();
  resetBridge();
});

describe("MainScene parasite hook wiring", () => {
  it("resets parasite runtime state when a run starts", () => {
    const scene = new MainScene();
    scene.create();
    const parasiteManager = scene.getParasiteManager();
    const resetSpy = vi.spyOn(parasiteManager, "resetRun");

    scene.enterPhase("playing");

    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it("routes movement integration through the parasite manager for snake ticks only", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const movementSpy = vi.spyOn(
      scene.getParasiteManager(),
      "onMovementTick",
    );
    const interval = scene.getSnake()!.getTicker().interval;
    scene.update(0, interval);

    expect(movementSpy).toHaveBeenCalled();
    expect(
      movementSpy.mock.calls.every(([context]) => context.actor === "snake"),
    ).toBe(true);
  });

  it("applies magnet pull + speed updates from movement hook results", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const parasiteState = createParasiteRuntimeState();
    parasiteState.activeSegments = [
      { id: "segment-magnet", type: ParasiteType.Magnet, attachedAtMs: 0 },
    ];
    scene.getParasiteManager().restoreState(parasiteState);

    const snake = scene.getSnake()!;
    snake.reset({ col: 5, row: 5 }, "right", 3);
    scene.getFood()!.setPosition({ col: 5, row: 6 });

    scene.update(0, snake.getTicker().interval);

    expect(scene.getFood()!.getPosition()).toEqual({ col: 4, row: 6 });
    expect(snake.getTicker().interval).toBeCloseTo(125 / 1.1, 6);
  });

  it("checks wall collisions through parasite manager before game-over finalization", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.reset({ col: GRID_COLS - 1, row: 10 }, "right", 1);
    const collisionSpy = vi.spyOn(
      scene.getParasiteManager(),
      "onCollisionCheck",
    );

    scene.update(0, snake.getTicker().interval);

    expect(collisionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "snake",
        kind: "wall",
      }),
    );
    expect(scene.getPhase()).toBe("gameOver");
  });

  it("absorbs wall collisions with shield segments and cancels game over", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    const endRunSpy = vi.spyOn(scene, "endRun");

    const parasiteState = createParasiteRuntimeState();
    parasiteState.activeSegments.push({
      id: "segment-shield",
      type: ParasiteType.Shield,
      attachedAtMs: 0,
    });
    scene.getParasiteManager().restoreState(parasiteState);

    const snake = scene.getSnake()!;
    snake.reset({ col: GRID_COLS - 1, row: 10 }, "right", 1);
    scene.update(0, snake.getTicker().interval);

    const stateAfterCollision = scene.getParasiteManager().getState();
    expect(scene.getPhase()).toBe("playing");
    expect(endRunSpy).not.toHaveBeenCalled();
    expect(stateAfterCollision.activeSegments).toEqual([]);
    expect(stateAfterCollision.flags.blockNextFoodPickup).toBe(true);
  });

  it("kills the snake on splitter obstacle contact without consuming shield", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const parasiteState = createParasiteRuntimeState();
    parasiteState.activeSegments.push({
      id: "segment-shield",
      type: ParasiteType.Shield,
      attachedAtMs: 0,
    });
    parasiteState.splitterObstacles.push({
      id: "obstacle-1",
      position: { col: 6, row: 5 },
      spawnedAtMs: 0,
    });
    scene.getParasiteManager().restoreState(parasiteState);

    const snake = scene.getSnake()!;
    snake.reset({ col: 5, row: 5 }, "right", 1);
    const collisionSpy = vi.spyOn(
      scene.getParasiteManager(),
      "onCollisionCheck",
    );

    scene.update(0, snake.getTicker().interval);

    expect(collisionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "snake",
        kind: "splitter-obstacle",
      }),
    );
    expect(scene.getPhase()).toBe("gameOver");
    expect(scene.getParasiteManager().getShieldSegmentCount()).toBe(1);
    expect(scene.getParasiteManager().getState().flags.blockNextFoodPickup).toBe(
      false,
    );
  });

  it("keeps existing wall/self collision priority over splitter obstacles", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const parasiteState = createParasiteRuntimeState();
    parasiteState.splitterObstacles.push({
      id: "obstacle-overlap",
      position: { col: 5, row: 5 },
      spawnedAtMs: 0,
    });
    scene.getParasiteManager().restoreState(parasiteState);

    const snake = scene.getSnake()!;
    snake.reset({ col: 5, row: 5 }, "right", 5);
    const interval = snake.getTicker().interval;
    const collisionSpy = vi.spyOn(
      scene.getParasiteManager(),
      "onCollisionCheck",
    );

    scene.update(0, interval);
    snake.bufferDirection("down");
    scene.update(0, interval);
    snake.bufferDirection("left");
    scene.update(0, interval);
    snake.bufferDirection("up");
    scene.update(0, interval);

    expect(scene.getPhase()).toBe("gameOver");
    expect(collisionSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "snake",
        kind: "self",
      }),
    );
    expect(collisionSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "snake",
        kind: "splitter-obstacle",
      }),
    );
  });

  it("blocks first food contact after shield absorb, then consumes on second contact", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const parasiteState = createParasiteRuntimeState();
    parasiteState.activeSegments.push({
      id: "segment-shield",
      type: ParasiteType.Shield,
      attachedAtMs: 0,
    });
    scene.getParasiteManager().restoreState(parasiteState);

    const snake = scene.getSnake()!;
    snake.reset({ col: GRID_COLS - 1, row: 10 }, "right", 1);
    scene.update(0, snake.getTicker().interval);
    expect(scene.getPhase()).toBe("playing");

    const scoreBefore = scene.getScore();
    const firstFoodPos = scene.getFood()!.getPosition();
    const firstApproach = getApproachVector(firstFoodPos);
    snake.reset(firstApproach.head, firstApproach.direction, 1);
    scene.update(0, snake.getTicker().interval);

    expect(scene.getScore()).toBe(scoreBefore);
    expect(scene.getFood()!.getPosition()).toEqual(firstFoodPos);
    expect(scene.getParasiteManager().getState().flags.blockNextFoodPickup).toBe(false);

    const secondApproach = getApproachVector(firstFoodPos);
    snake.reset(secondApproach.head, secondApproach.direction, 1);
    scene.update(0, snake.getTicker().interval);

    expect(scene.getScore()).toBe(scoreBefore + 1);
    expect(scene.getFood()!.getPosition()).not.toEqual(firstFoodPos);
  });

  it("routes food score gains through parasite scoring hook with food source metadata", () => {
    const scene = new MainScene();
    scene.create();
    scene.setRng(() => 0.5);
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const foodPos = scene.getFood()!.getPosition();
    expect(foodPos.col).toBeGreaterThan(0);
    snake.reset({ col: foodPos.col - 1, row: foodPos.row }, "right", 1);

    const scoreSpy = vi.spyOn(scene.getParasiteManager(), "onScoreEvent");
    scene.update(0, snake.getTicker().interval);

    expect(scoreSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "snake",
        source: "food",
      }),
    );
  });

  it("applies Splitter multiplier to food score gains via MainScene score path", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const parasiteState = createParasiteRuntimeState();
    parasiteState.activeSegments.push({
      id: "segment-splitter",
      type: ParasiteType.Splitter,
      attachedAtMs: 0,
    });
    scene.getParasiteManager().restoreState(parasiteState);

    const snake = scene.getSnake()!;
    const foodPos = scene.getFood()!.getPosition();
    const approach = getApproachVector(foodPos);
    snake.reset(approach.head, approach.direction, 1);

    scene.update(0, snake.getTicker().interval);

    expect(scene.getScore()).toBe(1.5);
  });

  it("invokes biome enter/exit/transition hooks on biome rotation", () => {
    const scene = new MainScene();
    scene.create();
    const parasiteManager = scene.getParasiteManager();
    const onEnter = vi.spyOn(parasiteManager, "onBiomeEnter");
    const onExit = vi.spyOn(parasiteManager, "onBiomeExit");
    const onTransition = vi.spyOn(parasiteManager, "onBiomeTransition");

    scene.enterPhase("playing");
    onEnter.mockClear();
    onExit.mockClear();
    onTransition.mockClear();
    scene.getSnake()!.getTicker().setInterval(60_000);

    scene.update(0, 45_000);

    expect(onExit).toHaveBeenCalledWith(Biome.NeonCity);
    expect(onTransition).toHaveBeenCalledWith({
      from: Biome.NeonCity,
      to: Biome.IceCavern,
    });
    expect(onEnter).toHaveBeenCalledWith(Biome.IceCavern);
  });

  it("spawns parasite pickups on empty cells and renders with a distinct texture key", () => {
    const scene = new MainScene();
    scene.create();
    scene.setRng(() => 0);
    scene.enterPhase("playing");

    scene.update(0, PARASITE_PICKUP_SPAWN_INTERVAL_MS);

    const pickup = scene.getParasiteManager().getState().pickup;
    expect(pickup).not.toBeNull();
    expect(scene.getSnake()!.isOnSnake(pickup!.position)).toBe(false);
    expect(pickup!.position).not.toEqual(scene.getFood()!.getPosition());

    const spriteCalls = (
      scene.add.sprite as ReturnType<typeof vi.fn>
    ).mock.calls;
    expect(
      spriteCalls.some(([, , texture]) => texture === TEXTURE_KEYS.PARASITE_PICKUP),
    ).toBe(true);
    expect(
      spriteCalls.some(([, , texture]) => texture === TEXTURE_KEYS.FOOD),
    ).toBe(true);
  });

  it("consumes snake-contacted pickups and tracks active segments with collected count", () => {
    const scene = new MainScene();
    scene.create();
    scene.setRng(() => 0);
    scene.enterPhase("playing");

    scene.update(0, PARASITE_PICKUP_SPAWN_INTERVAL_MS);

    const spawnedPickup = scene.getParasiteManager().getState().pickup;
    expect(spawnedPickup).not.toBeNull();

    const snake = scene.getSnake()!;
    const approach = getApproachVector(spawnedPickup!.position);
    snake.reset(approach.head, approach.direction, 1);

    scene.update(0, snake.getTicker().interval);

    const parasiteState = scene.getParasiteManager().getState();
    expect(parasiteState.pickup).toBeNull();
    expect(parasiteState.activeSegments).toHaveLength(1);
    expect(parasiteState.activeSegments[0]?.type).toBe(spawnedPickup!.type);
    expect(parasiteState.counters.collected).toBe(1);
  });

  it("renders pulsing parasite glows and tiny type labels above snake depth", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.getSnake()!.reset({ col: 10, row: 10 }, "right", 6);

    const parasiteState = createParasiteRuntimeState();
    parasiteState.activeSegments = [
      { id: "segment-magnet", type: ParasiteType.Magnet, attachedAtMs: 40 },
      { id: "segment-shield", type: ParasiteType.Shield, attachedAtMs: 80 },
      { id: "segment-splitter", type: ParasiteType.Splitter, attachedAtMs: 120 },
    ];
    parasiteState.timers.glowPulseElapsedMs = 180;
    scene.getParasiteManager().restoreState(parasiteState);

    scene.update(0, 16);

    const internals = scene as unknown as {
      parasiteSegmentGlowGraphics: ReturnType<typeof createMockGraphics> | null;
      parasiteSegmentIconTexts: ReturnType<typeof createMockText>[];
    };

    const glowGraphics = internals.parasiteSegmentGlowGraphics;
    expect(glowGraphics).not.toBeNull();
    expect(glowGraphics!.fillStyle).toHaveBeenCalledWith(
      PARASITE_COLORS[ParasiteType.Magnet],
      expect.any(Number),
    );
    expect(glowGraphics!.fillStyle).toHaveBeenCalledWith(
      PARASITE_COLORS[ParasiteType.Shield],
      expect.any(Number),
    );
    expect(glowGraphics!.fillStyle).toHaveBeenCalledWith(
      PARASITE_COLORS[ParasiteType.Splitter],
      expect.any(Number),
    );
    expect(glowGraphics!.fillCircle.mock.calls.length).toBeGreaterThanOrEqual(6);
    expect(glowGraphics!.setDepth).toHaveBeenCalledWith(
      RENDER_DEPTH.PARASITE_SEGMENT_GLOW,
    );

    const iconTexts = internals.parasiteSegmentIconTexts;
    expect(iconTexts).toHaveLength(3);
    const iconLabels = iconTexts.flatMap((icon) =>
      icon.setText.mock.calls.map(([label]) => label)
    );
    expect(iconLabels).toEqual(expect.arrayContaining(["Mg", "Sh", "Sp"]));
    for (const icon of iconTexts) {
      expect(icon.setDepth).toHaveBeenCalledWith(RENDER_DEPTH.PARASITE_SEGMENT_ICON);
      expect(icon.setVisible).toHaveBeenCalledWith(true);
    }

    expect(RENDER_DEPTH.PARASITE_SEGMENT_GLOW).toBeGreaterThan(RENDER_DEPTH.SNAKE);
    expect(RENDER_DEPTH.PARASITE_SEGMENT_ICON).toBeGreaterThan(
      RENDER_DEPTH.PARASITE_SEGMENT_GLOW,
    );
  });

  it("spawns splitter obstacles every 10 seconds while splitter is attached", () => {
    const scene = new MainScene();
    scene.create();
    scene.setRng(() => 0);
    scene.enterPhase("playing");

    const parasiteState = createParasiteRuntimeState();
    parasiteState.activeSegments.push({
      id: "segment-splitter",
      type: ParasiteType.Splitter,
      attachedAtMs: 0,
    });
    scene.getParasiteManager().restoreState(parasiteState);

    scene.update(0, SPLITTER_OBSTACLE_INTERVAL_MS - 1);
    expect(scene.getParasiteManager().getState().splitterObstacles).toHaveLength(0);

    scene.update(0, 1);
    const afterFirst = scene.getParasiteManager().getState().splitterObstacles;
    expect(afterFirst).toHaveLength(1);
    expect(scene.getSnake()!.isOnSnake(afterFirst[0]!.position)).toBe(false);
    expect(afterFirst[0]!.position).not.toEqual(scene.getFood()!.getPosition());

    scene.update(0, SPLITTER_OBSTACLE_INTERVAL_MS);
    expect(scene.getParasiteManager().getState().splitterObstacles).toHaveLength(2);
  });

  it("clears splitter obstacles on biome change and on run end", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const parasiteState = createParasiteRuntimeState();
    parasiteState.splitterObstacles.push({
      id: "obstacle-existing",
      position: { col: 2, row: 2 },
      spawnedAtMs: 500,
    });
    scene.getParasiteManager().restoreState(parasiteState);

    scene.getSnake()!.getTicker().setInterval(60_000);
    scene.update(0, 45_000);
    expect(scene.getParasiteManager().getState().splitterObstacles).toEqual([]);

    const withObstacle = createParasiteRuntimeState();
    withObstacle.splitterObstacles.push({
      id: "obstacle-existing-2",
      position: { col: 3, row: 3 },
      spawnedAtMs: 650,
    });
    scene.getParasiteManager().restoreState(withObstacle);
    scene.endRun();
    expect(scene.getParasiteManager().getState().splitterObstacles).toEqual([]);
  });
});
