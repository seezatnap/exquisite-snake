import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { gameBridge } from "@/game/bridge";
import { GRID_COLS, GRID_ROWS } from "@/game/config";
import {
  PARASITE_PICKUP_SPAWN_INTERVAL_MS,
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

import HUD from "@/components/HUD";
import GameOver from "@/components/GameOver";
import { MainScene } from "@/game/scenes/MainScene";

function resetBridge(): void {
  gameBridge.setPhase("start");
  gameBridge.setScore(0);
  gameBridge.setHighScore(0);
  gameBridge.setElapsedTime(0);
  gameBridge.setActiveParasites([]);
  gameBridge.setParasitesCollected(0);
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

afterEach(() => {
  cleanup();
});

describe("Task #13 parasite integration regressions", () => {
  it("keeps echo ghost excluded from parasite pickup/obstacle collisions", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const parasiteState = createParasiteRuntimeState();
    parasiteState.pickup = {
      id: "pickup-echo",
      type: ParasiteType.Magnet,
      position: { col: 1, row: 1 },
      spawnedAtMs: 0,
    };
    parasiteState.splitterObstacles.push({
      id: "obstacle-echo",
      position: { col: 2, row: 1 },
      spawnedAtMs: 0,
    });
    scene.getParasiteManager().restoreState(parasiteState);
    scene.update(0, 0);

    const snake = scene.getSnake()!;
    snake.reset({ col: 10, row: 10 }, "right", 1);

    const pickupContactSpy = vi.spyOn(scene.getParasiteManager(), "onPickupContact");
    const collisionSpy = vi.spyOn(scene.getParasiteManager(), "onCollisionCheck");
    const echoGhost = scene.getEchoGhost()!;
    vi.spyOn(echoGhost, "isActive").mockReturnValue(true);
    vi.spyOn(echoGhost, "getPlaybackSegments").mockReturnValue([
      { col: 1, row: 1 },
      { col: 2, row: 1 },
    ]);

    scene.update(0, snake.getTicker().interval);

    const state = scene.getParasiteManager().getState();
    expect(scene.getPhase()).toBe("playing");
    expect(state.pickup?.id).toBe("pickup-echo");
    expect(state.splitterObstacles).toEqual([
      {
        id: "obstacle-echo",
        position: { col: 2, row: 1 },
        spawnedAtMs: 0,
      },
    ]);
    expect(state.counters.collected).toBe(0);
    expect(
      pickupContactSpy.mock.calls.every(([context]) => context.actor === "snake"),
    ).toBe(true);
    expect(collisionSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        actor: "echo-ghost",
      }),
    );
  });

  it("updates HUD parasite inventory on attach, FIFO shed, and shield break", () => {
    const scene = new MainScene();
    scene.create();
    scene.setRng(() => 0.99);
    scene.enterPhase("playing");

    const { container } = render(<HUD />);

    const parasiteState = createParasiteRuntimeState();
    parasiteState.activeSegments = [
      { id: "segment-oldest", type: ParasiteType.Magnet, attachedAtMs: 10 },
      { id: "segment-middle", type: ParasiteType.Shield, attachedAtMs: 20 },
      { id: "segment-newest", type: ParasiteType.Splitter, attachedAtMs: 30 },
    ];
    parasiteState.pickup = {
      id: "pickup-next",
      type: ParasiteType.Magnet,
      position: { col: 6, row: 6 },
      spawnedAtMs: 40,
    };
    scene.getParasiteManager().restoreState(parasiteState);
    act(() => {
      scene.update(0, 0);
    });

    expect(container.querySelector('[data-testid="hud-parasite-slot-0"]')!.textContent).toBe("MG");
    expect(container.querySelector('[data-testid="hud-parasite-slot-1"]')!.textContent).toBe("SH");
    expect(container.querySelector('[data-testid="hud-parasite-slot-2"]')!.textContent).toBe("SP");

    const snake = scene.getSnake()!;
    const consumeApproach = getApproachVector({ col: 6, row: 6 });
    act(() => {
      snake.reset(consumeApproach.head, consumeApproach.direction, 1);
      scene.update(0, snake.getTicker().interval);
    });

    expect(gameBridge.getState().activeParasites).toEqual([
      ParasiteType.Shield,
      ParasiteType.Splitter,
      ParasiteType.Magnet,
    ]);
    expect(container.querySelector('[data-testid="hud-parasite-slot-0"]')!.textContent).toBe("SH");
    expect(container.querySelector('[data-testid="hud-parasite-slot-1"]')!.textContent).toBe("SP");
    expect(container.querySelector('[data-testid="hud-parasite-slot-2"]')!.textContent).toBe("MG");

    act(() => {
      snake.reset({ col: GRID_COLS - 1, row: 10 }, "right", 1);
      scene.update(0, snake.getTicker().interval);
    });

    expect(scene.getPhase()).toBe("playing");
    expect(gameBridge.getState().activeParasites).toEqual([
      ParasiteType.Splitter,
      ParasiteType.Magnet,
    ]);
    expect(container.querySelector('[data-testid="hud-parasite-slot-0"]')!.textContent).toBe("SP");
    expect(container.querySelector('[data-testid="hud-parasite-slot-1"]')!.textContent).toBe("MG");
    expect(container.querySelector('[data-testid="hud-parasite-slot-2"]')!.textContent).toBe("·");
  });

  it("shows run parasite total on Game Over after lethal splitter-obstacle collision", () => {
    const scene = new MainScene();
    scene.create();
    scene.setRng(() => 0);
    scene.enterPhase("playing");

    const { getByTestId } = render(<GameOver />);
    const snake = scene.getSnake()!;

    act(() => {
      scene.update(0, PARASITE_PICKUP_SPAWN_INTERVAL_MS);
    });
    const pickup = scene.getParasiteManager().getState().pickup;
    expect(pickup).not.toBeNull();
    const pickupApproach = getApproachVector(pickup!.position);
    act(() => {
      snake.reset(pickupApproach.head, pickupApproach.direction, 1);
      scene.update(0, snake.getTicker().interval);
    });
    expect(gameBridge.getState().parasitesCollected).toBe(1);

    const withObstacle = scene.getParasiteManager().getState();
    withObstacle.splitterObstacles.push({
      id: "obstacle-lethal",
      position: { col: 8, row: 8 },
      spawnedAtMs: 0,
    });
    scene.getParasiteManager().restoreState(withObstacle);
    act(() => {
      scene.update(0, 0);
    });

    const obstacleApproach = getApproachVector({ col: 8, row: 8 });
    act(() => {
      snake.reset(obstacleApproach.head, obstacleApproach.direction, 1);
      scene.update(0, snake.getTicker().interval);
    });

    expect(scene.getPhase()).toBe("gameOver");
    expect(getByTestId("parasites-collected").textContent).toContain(
      "PARASITES COLLECTED",
    );
    expect(getByTestId("parasites-collected").textContent).toContain("1");
  });
});
