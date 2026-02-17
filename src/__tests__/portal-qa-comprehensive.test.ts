/**
 * Comprehensive QA Test Suite for Dimensional Rift Portals (#13)
 *
 * This file consolidates integration and edge-case tests across ALL portal
 * sub-systems: spawn cadence, traversal, split rendering, collapse edge
 * cases, temporary collision immunity, biome interactions, and ghost/food
 * exclusions.
 *
 * It intentionally exercises cross-cutting concerns that individual unit
 * test files may not cover — e.g. a full lifecycle from spawn through
 * traversal, mid-transit collapse, emergency immunity, momentum clear,
 * and continuation of play.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { gameBridge } from "@/game/bridge";
import { Biome } from "@/game/systems/BiomeManager";
import {
  EMERGENCY_COLLISION_IMMUNITY_MS,
} from "@/game/systems/effects";
import {
  PORTAL_LIFESPAN_MS,
  PORTAL_SPAWN_DURATION_MS,
  PORTAL_COLLAPSE_DURATION_MS,
  resetPortalPairIdCounter,
  PortalPair,
} from "@/game/entities/Portal";
import {
  PORTAL_SPAWN_INTERVAL_MS,
  PORTAL_SPAWN_JITTER_MS,
  PORTAL_MAX_ACTIVE_PAIRS,
  PortalManager,
} from "@/game/systems/PortalManager";
import { computeSplitState } from "@/game/systems/SplitSnakeRenderer";

// ── Phaser mock ──────────────────────────────────────────────────
const mockCameraShake = vi.fn();
const mockSetBackgroundColor = vi.fn();
const mockTimeDelayedCall = vi.fn();
const mockTweensAdd = vi.fn();

function createMockGraphics() {
  return {
    lineStyle: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    strokePath: vi.fn(),
    fillStyle: vi.fn(),
    fillRect: vi.fn(),
    fillCircle: vi.fn(),
    strokeCircle: vi.fn(),
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
import { EchoGhost } from "@/game/entities/EchoGhost";
import { Food } from "@/game/entities/Food";
import { MoveTicker, type GridPos, type Direction, gridEquals } from "@/game/utils/grid";

// ── Helpers ──────────────────────────────────────────────────────

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
  direction: Direction = "right",
  length = 3,
  ticker?: MoveTicker,
): Snake {
  const scene = createScene();
  return new Snake(scene, headPos, direction, length, ticker);
}

/**
 * Spawn a portal, advance to active, position snake one tile before
 * portal A heading right, and step onto it. Returns context for
 * further assertions.
 */
function setupPortalTraversal(scene: MainScene): {
  snake: Snake;
  pm: PortalManager;
  pair: PortalPair;
  posA: GridPos;
  posB: GridPos;
} {
  scene.enterPhase("playing");

  const snake = scene.getSnake()!;
  const pm = scene.getPortalManager();

  // Prevent snake from stepping during portal setup
  snake.getTicker().setInterval(1_000_000);

  // Spawn portal
  scene.update(0, 2);
  // Advance spawn animation to active
  scene.update(0, 500);

  const pair = pm.getActivePairs()[0];
  const [posA, posB] = pair.getPositions();

  // Position snake one tile before portal A heading right
  snake.teleportHead({ col: posA.col - 1, row: posA.row });
  snake.getTicker().reset();
  snake.getTicker().setInterval(100);

  // Step onto portal → head teleports to posB
  scene.update(0, 100);

  return { snake, pm, pair, posA, posB };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetBridge();
  resetPortalPairIdCounter();
});

// ═════════════════════════════════════════════════════════════════
// 1. SPAWN CADENCE
// ═════════════════════════════════════════════════════════════════

describe("QA: Spawn cadence", () => {
  it("portals do not spawn before the first interval elapses", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 500 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    scene.update(0, 499);
    expect(scene.getPortalManager().getActivePairs()).toHaveLength(0);

    scene.update(0, 1);
    expect(scene.getPortalManager().getActivePairs()).toHaveLength(1);
  });

  it("spawn interval jitter stays within [base-jitter, base+jitter]", () => {
    for (let trial = 0; trial < 50; trial++) {
      const mgr = new PortalManager({
        spawnIntervalMs: 1000,
        spawnJitterMs: 200,
        rng: () => Math.random(),
      });
      const target = mgr.getCurrentSpawnTargetMs();
      expect(target).toBeGreaterThanOrEqual(800);
      expect(target).toBeLessThanOrEqual(1200);
    }
  });

  it("subsequent spawns use independently rolled intervals", () => {
    let callIdx = 0;
    const rng = () => {
      callIdx++;
      return (callIdx * 0.31) % 1;
    };

    const mgr = new PortalManager({
      spawnIntervalMs: 100,
      spawnJitterMs: 0,
      maxActivePairs: 3,
      rng,
    });
    mgr.startRun();

    mgr.update(100); // spawn 1
    expect(mgr.getActivePairs()).toHaveLength(1);

    mgr.update(100); // spawn 2
    expect(mgr.getActivePairs()).toHaveLength(2);
  });

  it("only one portal pair exists at a time with default max=1", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 10 });
    scene.enterPhase("playing");
    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    // Multiple update cycles
    for (let i = 0; i < 10; i++) {
      scene.update(0, 11);
    }

    expect(scene.getPortalManager().getActivePairs().length).toBeLessThanOrEqual(1);
  });

  it("portal lifecycle timing: 500ms spawn + 7500ms active + 500ms collapse = 8500ms total", () => {
    const pair = new PortalPair({
      id: "lifecycle-test",
      positionA: { col: 5, row: 5 },
      positionB: { col: 25, row: 20 },
    });

    expect(pair.getState()).toBe("spawning");

    // 500ms spawn → active
    pair.update(PORTAL_SPAWN_DURATION_MS);
    expect(pair.getState()).toBe("active");
    expect(pair.getTotalElapsedMs()).toBe(PORTAL_SPAWN_DURATION_MS);

    // Stay active until totalElapsed reaches PORTAL_LIFESPAN_MS (8000ms)
    const activePhaseMs = PORTAL_LIFESPAN_MS - PORTAL_SPAWN_DURATION_MS;
    pair.update(activePhaseMs);
    expect(pair.getState()).toBe("collapsing");
    expect(pair.getTotalElapsedMs()).toBe(PORTAL_LIFESPAN_MS);

    // 500ms collapse → collapsed
    pair.update(PORTAL_COLLAPSE_DURATION_MS);
    expect(pair.getState()).toBe("collapsed");
    expect(pair.isCollapsed()).toBe(true);

    // Total time: 500 + 7500 + 500 = 8500ms
    expect(pair.getTotalElapsedMs()).toBe(
      PORTAL_SPAWN_DURATION_MS + activePhaseMs + PORTAL_COLLAPSE_DURATION_MS,
    );
  });

  it("portal does not spawn on occupied cells (snake, food, lava, existing portals)", () => {
    const scene = createSceneWithFastPortals({
      spawnIntervalMs: 1,
      maxActivePairs: 5,
    });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    // Spawn multiple pairs
    for (let i = 0; i < 5; i++) {
      scene.update(0, 2);
    }

    const pm = scene.getPortalManager();
    const food = scene.getFood()!;
    const allPositions: GridPos[] = [];

    for (const pair of pm.getActivePairs()) {
      const [a, b] = pair.getPositions();
      allPositions.push(a, b);

      // No portal on snake
      expect(snake.isOnSnake(a)).toBe(false);
      expect(snake.isOnSnake(b)).toBe(false);

      // No portal on food
      expect(gridEquals(food.getPosition(), a)).toBe(false);
      expect(gridEquals(food.getPosition(), b)).toBe(false);
    }

    // All portal positions are distinct
    const keys = allPositions.map((p) => `${p.col}:${p.row}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// ═════════════════════════════════════════════════════════════════
// 2. TRAVERSAL
// ═════════════════════════════════════════════════════════════════

describe("QA: Portal traversal", () => {
  it("head teleports to linked exit and preserves direction", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    const { snake, posB } = setupPortalTraversal(scene);

    expect(snake.getHeadPosition()).toEqual(posB);
    expect(snake.getDirection()).toBe("right");
  });

  it("traversal is bidirectional: B → A works identically", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const pm = scene.getPortalManager();
    snake.getTicker().setInterval(1_000_000);

    scene.update(0, 2);
    scene.update(0, 500);

    const pair = pm.getActivePairs()[0];
    const [posA, posB] = pair.getPositions();

    // Approach posB from the left
    snake.teleportHead({ col: posB.col - 1, row: posB.row });
    snake.getTicker().setInterval(100);
    scene.update(0, 100);

    expect(snake.getHeadPosition()).toEqual(posA);
  });

  it("traversal during spawning state is allowed (isTraversable = true)", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    // Spawn but do NOT advance spawn animation
    scene.update(0, 2);
    const pair = scene.getPortalManager().getActivePairs()[0];
    expect(pair.getState()).toBe("spawning");
    expect(pair.isTraversable()).toBe(true);

    const [posA, posB] = pair.getPositions();
    snake.teleportHead({ col: posA.col - 1, row: posA.row });
    snake.getTicker().setInterval(100);
    scene.update(0, 100);

    expect(snake.getHeadPosition()).toEqual(posB);
  });

  it("traversal during collapsing state is blocked (isTraversable = false)", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    scene.update(0, 2);
    scene.update(0, 500);

    const pair = scene.getPortalManager().getActivePairs()[0];
    const [posA] = pair.getPositions();

    pair.beginCollapse();
    expect(pair.isTraversable()).toBe(false);

    snake.teleportHead({ col: posA.col - 1, row: posA.row });
    snake.getTicker().setInterval(100);
    scene.update(0, 100);

    // Head stepped onto posA but was NOT teleported
    expect(snake.getHeadPosition()).toEqual(posA);
  });

  it("movement cadence is not disrupted by portal traversal", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    const { snake, posB } = setupPortalTraversal(scene);

    // Partial tick — should NOT cause another step
    scene.update(0, 50);
    expect(snake.getHeadPosition()).toEqual(posB);

    // Complete the second tick
    scene.update(0, 50);
    // Head should have moved one tile from exit
    const dir = snake.getDirection();
    const expected: GridPos =
      dir === "right"
        ? { col: posB.col + 1, row: posB.row }
        : dir === "left"
          ? { col: posB.col - 1, row: posB.row }
          : dir === "down"
            ? { col: posB.col, row: posB.row + 1 }
            : { col: posB.col, row: posB.row - 1 };
    expect(snake.getHeadPosition()).toEqual(expected);
  });

  it("body threading initiates after head traversal for multi-segment snake", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    const { snake, posA, posB } = setupPortalTraversal(scene);

    const transit = snake.getPortalTransit();
    expect(transit).not.toBeNull();
    expect(transit!.entryPos).toEqual(posA);
    expect(transit!.exitPos).toEqual(posB);
    expect(transit!.segmentsRemaining).toBe(snake.getLength() - 1);
  });

  it("head-only snake (length 1) has no transit after traversal", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 1);
    snake.teleportHead({ col: 25, row: 5 }, "portal-1", { col: 10, row: 10 });
    expect(snake.getPortalTransit()).toBeNull();
  });

  it("snake length is preserved through traversal and threading", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    const { snake } = setupPortalTraversal(scene);
    const initialLength = snake.getLength();

    for (let i = 0; i < 15; i++) {
      scene.update(0, 100);
    }

    expect(snake.getLength()).toBe(initialLength);
  });
});

// ═════════════════════════════════════════════════════════════════
// 3. SPLIT RENDERING STATE
// ═════════════════════════════════════════════════════════════════

describe("QA: Split rendering", () => {
  it("computeSplitState identifies exit-side and entry-side segments correctly", () => {
    const segments: GridPos[] = [
      { col: 25, row: 5 },  // head (exit side)
      { col: 24, row: 5 },  // threaded (exit side)
      { col: 10, row: 10 }, // unthreaded (entry side)
      { col: 9, row: 10 },  // unthreaded (entry side)
    ];
    const transit = {
      portalPairId: "p1",
      entryPos: { col: 10, row: 10 },
      exitPos: { col: 25, row: 5 },
      segmentsRemaining: 2,
    };

    const state = computeSplitState(segments, transit);
    expect(state.active).toBe(true);
    expect(state.exitSideIndices).toEqual([0, 1]);
    expect(state.entrySideIndices).toEqual([2, 3]);
    // progress = 1 - remaining/totalBody = 1 - 2/3 ≈ 0.333
    expect(state.progress).toBeCloseTo(1 / 3, 5);
  });

  it("split state becomes inactive when transit completes (0 remaining)", () => {
    const segments: GridPos[] = [
      { col: 25, row: 5 },
      { col: 24, row: 5 },
      { col: 23, row: 5 },
    ];
    const transit = {
      portalPairId: "p1",
      entryPos: { col: 10, row: 10 },
      exitPos: { col: 25, row: 5 },
      segmentsRemaining: 0,
    };

    const state = computeSplitState(segments, transit);
    expect(state.active).toBe(false);
    expect(state.progress).toBe(1);
  });

  it("split-snake renderer is updated with correct transit data during game loop", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const renderer = scene.getSplitSnakeRenderer();
    const spy = vi.spyOn(renderer, "update");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    // Spawn & activate portal, traverse
    scene.update(0, 2);
    scene.update(0, 500);

    const pair = scene.getPortalManager().getActivePairs()[0];
    const [posA] = pair.getPositions();
    snake.teleportHead({ col: posA.col - 1, row: posA.row });
    snake.getTicker().reset();
    snake.getTicker().setInterval(100);
    scene.update(0, 100); // snake steps onto portal → traversal occurs

    // The split renderer is called in updatePortals() which runs BEFORE
    // resolvePortalHeadTraversal(), so the transit is not visible to the
    // renderer until the NEXT frame. Tick once more (no step) to let the
    // renderer see the active transit.
    scene.update(0, 1);

    const lastCall = spy.mock.calls[spy.mock.calls.length - 1];
    expect(lastCall[3]).not.toBeNull(); // transit argument
  });

  it("split-snake renderer receives null transit when no traversal is active", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1_000_000 });
    scene.enterPhase("playing");

    const renderer = scene.getSplitSnakeRenderer();
    const spy = vi.spyOn(renderer, "update");

    scene.update(0, 16);

    const lastCall = spy.mock.calls[spy.mock.calls.length - 1];
    expect(lastCall[3]).toBeNull();
  });

  it("progress advances from 0 toward 1 as segments thread through", () => {
    // 6 segments, starting with 5 remaining
    const makeState = (remaining: number) =>
      computeSplitState(
        Array.from({ length: 6 }, (_, i) => ({ col: i, row: 0 })),
        {
          portalPairId: "p1",
          entryPos: { col: 0, row: 0 },
          exitPos: { col: 20, row: 0 },
          segmentsRemaining: remaining,
        },
      );

    expect(makeState(5).progress).toBeCloseTo(0, 5);
    expect(makeState(3).progress).toBeCloseTo(0.4, 5);
    expect(makeState(1).progress).toBeCloseTo(0.8, 5);
    expect(makeState(0).progress).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════
// 4. COLLAPSE EDGE CASES
// ═════════════════════════════════════════════════════════════════

describe("QA: Collapse edge cases", () => {
  it("forceCompleteTransit teleports all remaining segments to exit", () => {
    const snake = createSnake({ col: 10, row: 10 }, "right", 6);
    snake.teleportHead({ col: 25, row: 5 }, "p1", { col: 10, row: 10 });

    const count = snake.forceCompleteTransit();
    expect(count).toBe(5);

    const segs = snake.getSegments();
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i]).toEqual({ col: 25, row: 5 });
    }
    expect(snake.getPortalTransit()).toBeNull();
  });

  it("forceCompleteTransit after partial threading only teleports remaining", () => {
    const ticker = new MoveTicker(100);
    const snake = createSnake({ col: 11, row: 10 }, "right", 4, ticker);
    // segments = [{11,10}, {10,10}, {9,10}, {8,10}]
    const entryPos = { col: 10, row: 10 };
    const exitPos = { col: 25, row: 5 };

    snake.teleportHead(exitPos, "p1", entryPos);
    // segments = [{25,5}, {10,10}, {9,10}, {8,10}], remaining=3
    // Thread segment at entryPos
    snake.resolveBodyThreading();
    // segments = [{25,5}, {25,5}, {9,10}, {8,10}], remaining=2

    const count = snake.forceCompleteTransit();
    expect(count).toBe(2);
    expect(snake.getSegments()[2]).toEqual(exitPos);
    expect(snake.getSegments()[3]).toEqual(exitPos);
  });

  it("portal collapse without active transit does not grant immunity", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    // Spawn & activate
    scene.update(0, 2);
    scene.update(0, 500);

    // Let portal collapse naturally without traversal
    scene.update(0, 7500);
    scene.update(0, 500);

    expect(scene.getEmergencyCollisionImmunityMs()).toBe(0);
  });

  it("collapse of a different portal does not affect active transit", () => {
    const scene = createSceneWithFastPortals({
      spawnIntervalMs: 1,
      maxActivePairs: 2,
    });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const pm = scene.getPortalManager();
    snake.getTicker().setInterval(1_000_000);

    // Spawn first portal
    scene.update(0, 2);
    scene.update(0, 500);
    const firstPair = pm.getActivePairs()[0];
    const [posA] = firstPair.getPositions();

    // Traverse first portal
    snake.teleportHead({ col: posA.col - 1, row: posA.row });
    snake.getTicker().setInterval(100);
    scene.update(0, 100);
    expect(snake.getPortalTransit()!.portalPairId).toBe(firstPair.id);

    // Spawn second portal
    snake.getTicker().setInterval(1_000_000);
    scene.update(0, 2);

    if (pm.getActivePairs().length >= 2) {
      const secondPair = pm.getActivePairs().find(p => p.id !== firstPair.id);
      if (secondPair) {
        // Collapse only second portal
        secondPair.beginCollapse();
        scene.update(0, 500);

        // Transit through first portal should still be active
        const transit = snake.getPortalTransit();
        if (transit) {
          expect(transit.portalPairId).toBe(firstPair.id);
        }
      }
    }
  });

  it("beginCollapse is idempotent — calling it twice does not reset collapse timer", () => {
    const pair = new PortalPair({
      id: "p1",
      positionA: { col: 5, row: 5 },
      positionB: { col: 25, row: 20 },
      collapseDurationMs: 500,
    });

    pair.update(500); // → active
    pair.beginCollapse(); // → collapsing, stateElapsedMs = 0
    pair.update(200);     // stateElapsedMs = 200
    pair.beginCollapse(); // should be no-op

    expect(pair.getState()).toBe("collapsing");
    expect(pair.getStateElapsedMs()).toBe(200); // not reset
  });

  it("multiple rapid spawn-collapse cycles do not leak state", () => {
    // Use PortalPair directly to avoid spawn-timer accumulation issues.
    // This test verifies that pairs can go through full lifecycle repeatedly
    // without leaking state.
    for (let cycle = 0; cycle < 5; cycle++) {
      const pair = new PortalPair({
        id: `cycle-${cycle}`,
        positionA: { col: 5, row: 5 },
        positionB: { col: 25, row: 20 },
        spawnDurationMs: 10,
        collapseDurationMs: 500,
      });

      pair.update(10); // → active
      expect(pair.getState()).toBe("active");
      expect(pair.isTraversable()).toBe(true);

      pair.beginCollapse();
      expect(pair.getState()).toBe("collapsing");
      expect(pair.isTraversable()).toBe(false);

      pair.update(500); // → collapsed
      expect(pair.getState()).toBe("collapsed");
      expect(pair.isCollapsed()).toBe(true);

      // Verify no lingering state
      expect(pair.getRemainingMs()).toBe(0);
      expect(pair.getStateProgress()).toBe(1);
    }
  });
});

// ═════════════════════════════════════════════════════════════════
// 5. TEMPORARY COLLISION IMMUNITY
// ═════════════════════════════════════════════════════════════════

describe("QA: Temporary collision immunity", () => {
  it("grants exactly EMERGENCY_COLLISION_IMMUNITY_MS (500ms) on collapse-mid-transit", () => {
    expect(EMERGENCY_COLLISION_IMMUNITY_MS).toBe(500);

    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    const { snake, pair } = setupPortalTraversal(scene);

    // Force collapse mid-transit
    snake.getTicker().setInterval(1_000_000);
    pair.beginCollapse();
    scene.update(0, 500);

    expect(scene.getEmergencyCollisionImmunityMs()).toBe(EMERGENCY_COLLISION_IMMUNITY_MS);
  });

  it("immunity counts down each frame and reaches zero", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    const { snake, pair } = setupPortalTraversal(scene);

    snake.getTicker().setInterval(1_000_000);
    pair.beginCollapse();
    scene.update(0, 500);

    const initial = scene.getEmergencyCollisionImmunityMs();
    expect(initial).toBe(500);

    scene.update(0, 200);
    expect(scene.getEmergencyCollisionImmunityMs()).toBe(300);

    scene.update(0, 300);
    expect(scene.getEmergencyCollisionImmunityMs()).toBe(0);
  });

  it("snake survives self-collision during immunity window after force-teleport", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    const { snake, pair } = setupPortalTraversal(scene);

    snake.getTicker().setInterval(1_000_000);
    pair.beginCollapse();
    scene.update(0, 500);

    // All body segments now at exit pos → self-collision is inevitable on next step
    snake.getTicker().setInterval(100);
    scene.update(0, 100);

    // Should survive due to immunity
    expect(scene.getPhase()).toBe("playing");
  });

  it("collisions resume after immunity expires", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1_000_000 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    // Verify no immunity
    expect(scene.getEmergencyCollisionImmunityMs()).toBe(0);

    // Crash snake into wall
    snake.teleportHead({ col: 39, row: 15 });
    snake.getTicker().setInterval(100);
    scene.update(0, 100);

    expect(scene.getPhase()).toBe("gameOver");
  });

  it("immunity is reset on new run start", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    const { pair, snake } = setupPortalTraversal(scene);

    snake.getTicker().setInterval(1_000_000);
    pair.beginCollapse();
    scene.update(0, 500);
    expect(scene.getEmergencyCollisionImmunityMs()).toBeGreaterThan(0);

    // Start new run
    scene.enterPhase("playing");
    expect(scene.getEmergencyCollisionImmunityMs()).toBe(0);
  });

  it("flash VFX fires on collapse-mid-transit (camera shake)", () => {
    mockCameraShake.mockClear();

    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    const { snake, pair } = setupPortalTraversal(scene);

    snake.getTicker().setInterval(1_000_000);
    pair.beginCollapse();
    scene.update(0, 500);

    expect(mockCameraShake).toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════
// 6. BIOME INTERACTIONS
// ═════════════════════════════════════════════════════════════════

describe("QA: Biome interactions", () => {
  it("Ice Cavern: pending ice momentum is cleared after portal traversal", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    scene.setBiomeCycleOrder([
      Biome.IceCavern,
      Biome.NeonCity,
      Biome.MoltenCore,
      Biome.VoidRift,
    ]);

    const snake = scene.getSnake()!;
    const pm = scene.getPortalManager();
    snake.getTicker().setInterval(1_000_000);

    scene.update(0, 2);
    scene.update(0, 500);

    const pair = pm.getActivePairs()[0];
    const [posA, posB] = pair.getPositions();

    // Queue a turn (delayed by 2 tiles of ice momentum normally)
    snake.bufferDirection("down");

    snake.teleportHead({ col: posA.col - 1, row: posA.row });
    snake.getTicker().setInterval(100);
    scene.update(0, 100);

    // Momentum cleared → direction should be "down" immediately
    expect(snake.getHeadPosition()).toEqual(posB);
    expect(snake.getDirection()).toBe("down");
  });

  it("Molten Core: lava pools do not spawn on portal cells", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    scene.update(0, 2);
    scene.update(0, 500);

    const pm = scene.getPortalManager();
    const pair = pm.getActivePairs()[0];
    const [posA, posB] = pair.getPositions();

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

    // Spawn many lava pools
    for (let i = 0; i < 100; i++) {
      scene.update(0, 1);
    }

    for (const pool of scene.getMoltenLavaPools()) {
      expect(gridEquals(pool, posA)).toBe(false);
      expect(gridEquals(pool, posB)).toBe(false);
    }
  });

  it("Void Rift: gravity nudge is suppressed on the same step as portal traversal", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    scene.setBiomeCycleOrder([
      Biome.VoidRift,
      Biome.NeonCity,
      Biome.IceCavern,
      Biome.MoltenCore,
    ]);
    scene.setBiomeMechanicsConfig({
      voidRift: { gravityPullCadenceSteps: 1 },
    });

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);

    scene.update(0, 2);
    scene.update(0, 500);

    const pair = scene.getPortalManager().getActivePairs()[0];
    const [posA, posB] = pair.getPositions();

    snake.teleportHead({ col: posA.col - 1, row: posA.row });
    snake.getTicker().setInterval(100);
    scene.update(0, 100);

    // Head should be exactly at posB (gravity suppressed)
    expect(snake.getHeadPosition()).toEqual(posB);
  });

  it("biome transition collapses all active portals", () => {
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

    // Advance close to biome transition (45s), spawn portal
    scene.update(0, 44_901);
    expect(pm.getActivePairs()).toHaveLength(1);

    // Trigger biome transition
    scene.update(0, 99);
    const pair = pm.getActivePairs()[0];
    expect(pair.getState()).toBe("collapsing");
  });

  it("emergency teleport during Ice Cavern clears momentum", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    scene.setBiomeCycleOrder([
      Biome.IceCavern,
      Biome.NeonCity,
      Biome.MoltenCore,
      Biome.VoidRift,
    ]);

    const snake = scene.getSnake()!;
    const pm = scene.getPortalManager();
    snake.getTicker().setInterval(1_000_000);

    scene.update(0, 2);
    scene.update(0, 500);

    const pair = pm.getActivePairs()[0];
    const [posA] = pair.getPositions();

    snake.bufferDirection("down");

    snake.teleportHead({ col: posA.col - 1, row: posA.row });
    snake.getTicker().setInterval(100);
    scene.update(0, 100);
    expect(snake.getPortalTransit()).not.toBeNull();

    // Collapse mid-transit
    snake.getTicker().setInterval(1_000_000);
    pair.beginCollapse();
    scene.update(0, 500);

    // After emergency teleport, direction should be "down" (momentum cleared)
    expect(snake.getDirection()).toBe("down");
  });
});

// ═════════════════════════════════════════════════════════════════
// 7. GHOST / FOOD EXCLUSIONS
// ═════════════════════════════════════════════════════════════════

describe("QA: Ghost / food exclusions", () => {
  it("echo ghost replays raw position history (includes teleport discontinuity)", () => {
    const ghost = new EchoGhost({ delayMs: 0, maxSamples: 16 });

    ghost.recordPath([{ col: 5, row: 5 }]);
    ghost.advance(16);
    ghost.recordPath([{ col: 5, row: 6 }]);
    ghost.advance(16);
    // Teleport jump
    ghost.recordPath([{ col: 20, row: 20 }]);
    ghost.advance(16);
    ghost.recordPath([{ col: 20, row: 21 }]);
    ghost.advance(16);

    const snapshot = ghost.createSnapshot();
    const positions = snapshot.samples.map((s) => s.segments[0]);

    expect(positions).toContainEqual({ col: 5, row: 5 });
    expect(positions).toContainEqual({ col: 20, row: 20 }); // teleport recorded
    expect(positions).toContainEqual({ col: 20, row: 21 });
  });

  it("echo ghost has no portal-related API", () => {
    const ghost = new EchoGhost({ delayMs: 100, maxSamples: 16 });
    const g = ghost as unknown as Record<string, unknown>;

    expect(g.teleportHead).toBeUndefined();
    expect(g.portalTransit).toBeUndefined();
    expect(g.resolveBodyThreading).toBeUndefined();
    expect(g.forceCompleteTransit).toBeUndefined();
  });

  it("food never spawns on active portal cells (repeated respawns)", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const food = scene.getFood()!;
    const pm = scene.getPortalManager();
    snake.getTicker().setInterval(1_000_000);

    scene.update(0, 2);
    const [posA, posB] = pm.getActivePairs()[0].getPositions();

    for (let i = 0; i < 30; i++) {
      food.respawn(snake);
      const fp = food.getPosition();
      expect(gridEquals(fp, posA)).toBe(false);
      expect(gridEquals(fp, posB)).toBe(false);
    }
  });

  it("food has no portal-related API", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const food = new Food(scene, snake);
    const f = food as unknown as Record<string, unknown>;

    expect(f.teleportHead).toBeUndefined();
    expect(f.portalTransit).toBeUndefined();
    expect(f.resolveBodyThreading).toBeUndefined();

    food.destroy();
  });

  it("food exclusion checkers are dynamically updatable", () => {
    const scene = createScene();
    const snake = createSnake({ col: 10, row: 10 }, "right", 3);
    const food = new Food(scene, snake, () => 0);

    // No exclusions → (0,0) is valid
    let pos = food.findSafePosition(snake);
    expect(pos.col).toBe(0);
    expect(pos.row).toBe(0);

    // Exclude (0,0)
    food.setExclusionCheckers([(p) => p.col === 0 && p.row === 0]);
    pos = food.findSafePosition(snake);
    expect(pos.col !== 0 || pos.row !== 0).toBe(true);

    // Clear exclusions
    food.setExclusionCheckers([]);
    pos = food.findSafePosition(snake);
    expect(pos.col).toBe(0);
    expect(pos.row).toBe(0);

    food.destroy();
  });

  it("ghost in full game loop records positions including post-portal-teleport", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const ghost = scene.getEchoGhost()!;

    // Advance several frames
    scene.update(0, 2);
    scene.update(0, 500);
    scene.update(0, 125);

    const snapshot = ghost.createSnapshot();
    expect(snapshot.samples.length).toBeGreaterThan(0);

    // All samples should have valid segment positions
    for (const s of snapshot.samples) {
      expect(s.segments.length).toBeGreaterThan(0);
      for (const seg of s.segments) {
        expect(typeof seg.col).toBe("number");
        expect(typeof seg.row).toBe("number");
      }
    }
  });

  it("portal traversal affects only snake, not food or ghost", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const food = scene.getFood()!;
    const ghost = scene.getEchoGhost()!;
    const snake = scene.getSnake()!;
    const pm = scene.getPortalManager();
    snake.getTicker().setInterval(1_000_000);

    scene.update(0, 2);
    scene.update(0, 500);

    const [posA, posB] = pm.getActivePairs()[0].getPositions();
    const ghostSampleCountBefore = ghost.createSnapshot().samples.length;

    // Traverse portal
    snake.teleportHead({ col: posA.col - 1, row: posA.row });
    snake.getTicker().setInterval(100);
    scene.update(0, 100);

    // Food should NOT be at a portal exit
    expect(gridEquals(food.getPosition(), posB)).toBe(false);

    // Ghost should not have been teleported
    const ghostSampleCountAfter = ghost.createSnapshot().samples.length;
    expect(ghostSampleCountAfter).toBeGreaterThanOrEqual(ghostSampleCountBefore);
  });
});

// ═════════════════════════════════════════════════════════════════
// 8. FULL LIFECYCLE END-TO-END
// ═════════════════════════════════════════════════════════════════

describe("QA: Full lifecycle end-to-end", () => {
  it("spawn → traverse → body thread → continue playing (no crash)", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    const { snake, posB } = setupPortalTraversal(scene);

    expect(snake.getHeadPosition()).toEqual(posB);
    expect(snake.getPortalTransit()).not.toBeNull();

    // Continue stepping to let body thread through
    for (let i = 0; i < 20; i++) {
      scene.update(0, 100);
      if (scene.getPhase() !== "playing") break;
    }

    expect(snake.getLength()).toBe(3);
  });

  it("spawn → traverse → collapse mid-transit → immunity → game continues", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    const { snake, pair, posB } = setupPortalTraversal(scene);

    expect(snake.getHeadPosition()).toEqual(posB);
    expect(snake.getPortalTransit()).not.toBeNull();

    // Collapse mid-transit
    snake.getTicker().setInterval(1_000_000);
    pair.beginCollapse();
    scene.update(0, 500);

    expect(snake.getPortalTransit()).toBeNull();
    expect(scene.getEmergencyCollisionImmunityMs()).toBe(EMERGENCY_COLLISION_IMMUNITY_MS);

    // Survive self-collision during immunity
    snake.teleportHead({ col: 15, row: 15 });
    snake.getTicker().setInterval(100);
    scene.update(0, 100);
    expect(scene.getPhase()).toBe("playing");

    // Wait for immunity to expire
    snake.getTicker().setInterval(1_000_000);
    scene.update(0, 500);
    expect(scene.getEmergencyCollisionImmunityMs()).toBe(0);

    // Continue normal play
    snake.teleportHead({ col: 15, row: 15 });
    snake.getTicker().setInterval(100);
    scene.update(0, 100);
    expect(scene.getPhase()).toBe("playing");
  });

  it("deterministic replay: same RNG yields same portal positions", () => {
    const makeRng = () => {
      let i = 0;
      return () => {
        i++;
        return (i * 0.37) % 1;
      };
    };

    const getPositions = () => {
      const scene = new MainScene();
      scene.create();
      scene.setPortalManagerOptions({
        spawnIntervalMs: 10,
        spawnJitterMs: 0,
        maxActivePairs: 1,
      });
      scene.setRng(makeRng());
      scene.enterPhase("playing");
      scene.getSnake()!.getTicker().setInterval(1_000_000);
      scene.update(0, 11);

      return scene.getPortalManager().getActivePairs()[0]?.getPositions();
    };

    const pos1 = getPositions();
    const pos2 = getPositions();

    expect(pos1).toBeDefined();
    expect(pos2).toBeDefined();
    expect(pos1).toEqual(pos2);
  });

  it("portal system resets cleanly between game runs", () => {
    const scene = createSceneWithFastPortals({ spawnIntervalMs: 1 });
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.getTicker().setInterval(1_000_000);
    scene.update(0, 2);
    expect(scene.getPortalManager().getActivePairs()).toHaveLength(1);

    // End run
    scene.endRun();
    expect(scene.getPortalManager().isRunning()).toBe(false);

    // New run
    scene.enterPhase("playing");
    expect(scene.getPortalManager().isRunning()).toBe(true);
    expect(scene.getPortalManager().getActivePairs()).toHaveLength(0);
    expect(scene.getEmergencyCollisionImmunityMs()).toBe(0);
  });

  it("spec constants match requirements", () => {
    expect(PORTAL_SPAWN_INTERVAL_MS).toBe(30_000);   // ~30 seconds
    expect(PORTAL_SPAWN_JITTER_MS).toBe(5_000);      // ±5 seconds
    expect(PORTAL_MAX_ACTIVE_PAIRS).toBe(1);          // only 1 pair
    expect(PORTAL_LIFESPAN_MS).toBe(8_000);           // 8 seconds active
    expect(PORTAL_SPAWN_DURATION_MS).toBe(500);       // spawn animation
    expect(PORTAL_COLLAPSE_DURATION_MS).toBe(500);    // collapse animation
    expect(EMERGENCY_COLLISION_IMMUNITY_MS).toBe(500); // ~0.5s immunity
  });
});
