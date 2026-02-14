/**
 * Integration tests for Echo Ghost system (Task #9).
 *
 * Covers the five required behaviors:
 *   1. 5-second delay accuracy
 *   2. Ghost self-overlap kill behavior
 *   3. Fade-out and bounded buffer lifecycle
 *   4. Delayed food particle burst timing
 *   5. Biome-tinted ghost rendering metadata
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { gameBridge } from "@/game/bridge";

const ROOT = path.resolve(__dirname, "../..");

// ── Phaser mock ──────────────────────────────────────────────────

const mockEmitterDestroy = vi.fn();
const mockEmitterStop = vi.fn();
const mockEmitterStart = vi.fn();
const mockEmitterSetPosition = vi.fn();
const mockTexturesExists = vi.fn().mockReturnValue(true);

function createMockEmitter() {
  return {
    destroy: mockEmitterDestroy,
    stop: mockEmitterStop,
    start: mockEmitterStart,
    setPosition: mockEmitterSetPosition,
    explode: vi.fn(),
    emitting: true,
    particleAlpha: 1,
    particleTint: 0xffffff,
  };
}

const mockAddParticles = vi.fn(() => createMockEmitter());

const mockSpriteDestroy = vi.fn();
const mockSpriteSetPosition = vi.fn();
const mockSpriteSetAlpha = vi.fn();
const mockSpriteSetVisible = vi.fn();
const mockSpriteSetTint = vi.fn();

function createMockSprite() {
  return {
    destroy: mockSpriteDestroy,
    setPosition: mockSpriteSetPosition,
    setAlpha: mockSpriteSetAlpha,
    setVisible: mockSpriteSetVisible,
    setTint: mockSpriteSetTint,
    visible: true,
    x: 0,
    y: 0,
  };
}

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

const mockKeyboardOn = vi.fn();

vi.mock("phaser", () => {
  class MockScene {
    scene = { start: vi.fn() };
    add = {
      graphics: () => mockGraphics,
      sprite: vi.fn(() => createMockSprite()),
      particles: mockAddParticles,
    };
    input = {
      keyboard: { on: mockKeyboardOn, off: vi.fn() },
    };
    cameras = { main: { shake: vi.fn() } };
    textures = { exists: mockTexturesExists };
    time = { delayedCall: vi.fn() };
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
import {
  EchoGhost,
  ECHO_DELAY_MS,
  FADE_DURATION_MS,
  delayTicks,
} from "@/game/entities/EchoGhost";
import { GhostFoodScheduler } from "@/game/systems/ghostFoodBurst";
import {
  EchoGhostRenderer,
  GHOST_BASE_ALPHA,
} from "@/game/systems/echoGhostRenderer";
import {
  BiomeManager,
  BIOME_CONFIGS,
  BIOME_ORDER,
  BIOME_SHIFT_INTERVAL_MS,
  BIOME_TRANSITION_MS,
} from "@/game/systems/BiomeManager";
import {
  DEFAULT_MOVE_INTERVAL_MS,
  gridToPixel,
  type GridPos,
} from "@/game/utils/grid";

// ── Helpers ──────────────────────────────────────────────────────

function seg(...positions: [number, number][]): GridPos[] {
  return positions.map(([col, row]) => ({ col, row }));
}

function resetBridge(): void {
  gameBridge.setPhase("start");
  gameBridge.setScore(0);
  gameBridge.setHighScore(0);
  gameBridge.setElapsedTime(0);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTexturesExists.mockReturnValue(true);
  resetBridge();
});

// =====================================================================
// 1. 5-SECOND DELAY ACCURACY
// =====================================================================

describe("5-second delay accuracy", () => {
  it("ECHO_DELAY_MS is exactly 5000", () => {
    expect(ECHO_DELAY_MS).toBe(5000);
  });

  it("delayTicks * tickInterval equals ECHO_DELAY_MS at default interval", () => {
    const ticks = delayTicks(DEFAULT_MOVE_INTERVAL_MS);
    expect(ticks * DEFAULT_MOVE_INTERVAL_MS).toBe(ECHO_DELAY_MS);
  });

  it("ghost activates at exactly tick 40 (5s at 125ms) in MainScene integration", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const ghost = scene.getEchoGhost()!;
    const interval = snake.getTicker().interval;

    // Zigzag the snake to stay in bounds for 40+ ticks
    snake.reset({ col: 1, row: 1 }, "right", 1);

    // 37 steps right (col 1 → 38)
    for (let i = 0; i < 37; i++) {
      scene.update(0, interval);
    }
    // At tick 39, still not active
    snake.bufferDirection("down");
    scene.update(0, interval); // tick 38
    scene.update(0, interval); // tick 39
    expect(ghost.isActive()).toBe(false);
    expect(ghost.getGhostTrail()).toBeNull();

    // At tick 40: exactly 5 seconds → becomes active
    scene.update(0, interval); // tick 40
    expect(ghost.isActive()).toBe(true);
    expect(ghost.getGhostTrail()).not.toBeNull();
  });

  it("ghost trail replays positions from exactly 5 seconds ago", () => {
    const ghost = new EchoGhost(DEFAULT_MOVE_INTERVAL_MS);
    const delay = ghost.delayInTicks; // 40

    // Record 41 frames: the ghost at tick 40 replays tick 0
    for (let i = 0; i <= delay; i++) {
      ghost.record(seg([i * 2, i]));
    }

    const trail = ghost.getGhostTrail()!;
    expect(trail).not.toBeNull();
    // Trail should show tick 1 (currentTick=41, target=1)
    expect(trail[0]).toEqual({ col: 2, row: 1 });
  });

  it("delay adapts correctly to different tick rates", () => {
    // At 100ms per tick → 50 ticks for 5 seconds
    const ghost100 = new EchoGhost(100);
    expect(ghost100.delayInTicks * 100).toBe(ECHO_DELAY_MS);

    // At 200ms per tick → 25 ticks for 5 seconds
    const ghost200 = new EchoGhost(200);
    expect(ghost200.delayInTicks * 200).toBe(ECHO_DELAY_MS);

    // At 50ms per tick → 100 ticks for 5 seconds
    const ghost50 = new EchoGhost(50);
    expect(ghost50.delayInTicks * 50).toBe(ECHO_DELAY_MS);
  });

  it("ghost is inactive at 4999ms worth of ticks and active at 5000ms", () => {
    // Using 125ms ticks: 39 ticks = 4875ms < 5000ms, 40 ticks = 5000ms
    const ghost = new EchoGhost(125);
    for (let i = 0; i < 39; i++) {
      ghost.record(seg([i, 0]));
    }
    expect(ghost.isActive()).toBe(false);

    ghost.record(seg([39, 0])); // tick 40 = 5000ms
    expect(ghost.isActive()).toBe(true);
  });

  it("delay uses ceiling for non-evenly-divisible intervals", () => {
    // 5000 / 130 ≈ 38.46 → ceil → 39 (ensures at least 5s)
    const ghost = new EchoGhost(130);
    expect(ghost.delayInTicks).toBe(39);
    // 39 * 130 = 5070ms ≥ 5000ms
    expect(ghost.delayInTicks * 130).toBeGreaterThanOrEqual(ECHO_DELAY_MS);
  });
});

// =====================================================================
// 2. GHOST SELF-OVERLAP KILL BEHAVIOR
// =====================================================================

describe("ghost self-overlap kill behavior", () => {
  it("snake dies when head exactly overlaps ghost head segment", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const ghost = scene.getEchoGhost()!;
    const interval = snake.getTicker().interval;

    // Build ghost trail: move right for 37, then down for 3 = 40 ticks
    snake.reset({ col: 1, row: 1 }, "right", 1);
    for (let i = 0; i < 37; i++) {
      scene.update(0, interval);
    }
    snake.bufferDirection("down");
    for (let i = 0; i < 3; i++) {
      scene.update(0, interval);
    }
    expect(ghost.isActive()).toBe(true);

    // Ghost trail from 40 ticks ago: head was at col=2, row=1
    const trail = ghost.getGhostTrail()!;
    expect(trail[0]).toEqual({ col: 2, row: 1 });

    // Place snake to step into ghost head position
    snake.reset({ col: 1, row: 1 }, "right", 1);
    scene.update(0, interval);

    expect(scene.getPhase()).toBe("gameOver");
    expect(snake.isAlive()).toBe(false);
  });

  it("snake dies when head overlaps any ghost body segment (not just head)", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const ghost = scene.getEchoGhost()!;
    const interval = snake.getTicker().interval;

    // Use a length-3 snake. Start at col=1 going right.
    // After step, segments trail: head at col=2, body at col=1, tail at col=0
    snake.reset({ col: 1, row: 1 }, "right", 3);

    // 35 steps right (head reaches col=36, staying in bounds)
    for (let i = 0; i < 35; i++) {
      scene.update(0, interval);
    }
    // Turn down for remaining ticks to reach 40 total
    snake.bufferDirection("down");
    for (let i = 0; i < 5; i++) {
      scene.update(0, interval);
    }
    expect(ghost.isActive()).toBe(true);

    const trail = ghost.getGhostTrail()!;
    expect(trail.length).toBe(3);

    // Ghost trail from tick 0: head at (2,1), body at (1,1), tail at (0,1)
    // Target the tail segment (trail[2])
    const bodySegment = trail[2];
    snake.reset(
      { col: bodySegment.col - 1, row: bodySegment.row },
      "right",
      1,
    );
    scene.update(0, interval);

    expect(scene.getPhase()).toBe("gameOver");
    expect(snake.isAlive()).toBe(false);
  });

  it("ghost collision triggers identical game-over flow as self-collision", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const interval = snake.getTicker().interval;

    snake.reset({ col: 1, row: 1 }, "right", 1);
    for (let i = 0; i < 37; i++) {
      scene.update(0, interval);
    }
    snake.bufferDirection("down");
    for (let i = 0; i < 3; i++) {
      scene.update(0, interval);
    }

    scene.addScore(100);
    const spySetPhase = vi.spyOn(gameBridge, "setPhase");

    // Trigger ghost collision
    snake.reset({ col: 1, row: 1 }, "right", 1);
    scene.update(0, interval);

    // Same outcomes: gameOver phase, snake killed, high score set
    expect(spySetPhase).toHaveBeenCalledWith("gameOver");
    expect(snake.isAlive()).toBe(false);
    expect(scene.getHighScore()).toBe(100);
  });

  it("no collision when snake head does not overlap ghost trail", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const ghost = scene.getEchoGhost()!;
    const interval = snake.getTicker().interval;

    snake.reset({ col: 1, row: 1 }, "right", 1);
    for (let i = 0; i < 37; i++) {
      scene.update(0, interval);
    }
    snake.bufferDirection("down");
    for (let i = 0; i < 3; i++) {
      scene.update(0, interval);
    }
    expect(ghost.isActive()).toBe(true);

    // Snake is far from ghost trail; continue moving down
    scene.update(0, interval);
    scene.update(0, interval);

    expect(scene.getPhase()).toBe("playing");
    expect(snake.isAlive()).toBe(true);
  });

  it("no ghost collision before ghost is active (warming phase)", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const ghost = scene.getEchoGhost()!;
    const interval = snake.getTicker().interval;

    snake.reset({ col: 10, row: 15 }, "right", 1);

    // Only 5 ticks — ghost still warming
    for (let i = 0; i < 5; i++) {
      scene.update(0, interval);
    }

    expect(ghost.isActive()).toBe(false);
    expect(scene.getPhase()).toBe("playing");
  });

  it("ghost collision stops ghost recording (for post-death drain)", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    const ghost = scene.getEchoGhost()!;
    const interval = snake.getTicker().interval;

    snake.reset({ col: 1, row: 1 }, "right", 1);
    for (let i = 0; i < 37; i++) {
      scene.update(0, interval);
    }
    snake.bufferDirection("down");
    for (let i = 0; i < 3; i++) {
      scene.update(0, interval);
    }

    expect(ghost.isRecordingStopped()).toBe(false);

    // Trigger ghost collision
    snake.reset({ col: 1, row: 1 }, "right", 1);
    scene.update(0, interval);

    expect(ghost.isRecordingStopped()).toBe(true);
  });
});

// =====================================================================
// 3. FADE-OUT AND BOUNDED BUFFER LIFECYCLE
// =====================================================================

describe("fade-out and bounded buffer lifecycle", () => {
  describe("bounded buffer — no indefinite growth", () => {
    it("buffer count never exceeds capacity during continuous recording", () => {
      const ghost = new EchoGhost(125);
      const capacity = ghost.capacity;

      for (let i = 0; i < capacity * 3; i++) {
        ghost.record(seg([i % 40, 0]));
        expect(ghost.getCount()).toBeLessThanOrEqual(capacity);
      }
    });

    it("oldest frames are overwritten in circular buffer", () => {
      const ghost = new EchoGhost(1000, 6); // delay=5, capacity=6
      const cap = ghost.capacity;

      for (let i = 0; i < cap; i++) {
        ghost.record(seg([i, 0]));
      }
      expect(ghost.getFrameAtTick(0)).not.toBeNull();

      ghost.record(seg([cap, 0]));
      expect(ghost.getFrameAtTick(0)).toBeNull(); // overwritten
      expect(ghost.getFrameAtTick(cap)!.segments[0].col).toBe(cap);
    });

    it("rolling replay window keeps ghost alive despite buffer wrapping", () => {
      const ghost = new EchoGhost(125);
      const capacity = ghost.capacity;
      const delay = ghost.delayInTicks;

      // Record well past buffer capacity
      for (let i = 0; i < capacity + delay + 20; i++) {
        ghost.record(seg([i % 40, 0]));
      }

      expect(ghost.isActive()).toBe(true);
      expect(ghost.getGhostTrail()).not.toBeNull();
      expect(ghost.getFrameAtTick(0)).toBeNull(); // old frame gone
    });
  });

  describe("lifecycle state transitions", () => {
    it("progresses warming → active → fading → inactive", () => {
      const ghost = new EchoGhost(1000, 10); // delay=5, cap=10, fade=1
      const delay = ghost.delayInTicks;

      // Warming
      expect(ghost.getLifecycleState()).toBe("warming");

      // Record enough to reach active
      for (let i = 0; i < delay + 3; i++) {
        ghost.record(seg([i, 0]));
      }
      expect(ghost.getLifecycleState()).toBe("active");

      // Stop recording → begins draining
      ghost.stopRecording();

      // Advance through active, into fading, and to inactive
      const observedStates = new Set<string>();
      for (let i = 0; i < 20; i++) {
        observedStates.add(ghost.getLifecycleState());
        if (ghost.getLifecycleState() === "inactive") break;
        ghost.advancePlayhead();
      }

      expect(observedStates.has("active")).toBe(true);
      expect(observedStates.has("fading")).toBe(true);
      expect(observedStates.has("inactive")).toBe(true);
    });
  });

  describe("fade-out opacity", () => {
    it("opacity is 0 during warming", () => {
      const ghost = new EchoGhost(125);
      expect(ghost.getOpacity()).toBe(0);
    });

    it("opacity is 1 during active state", () => {
      const ghost = new EchoGhost(125);
      for (let i = 0; i < ghost.delayInTicks + 5; i++) {
        ghost.record(seg([i, 0]));
      }
      expect(ghost.getOpacity()).toBe(1);
    });

    it("opacity decreases monotonically during fading", () => {
      const ghost = new EchoGhost(125); // fade=8
      const delay = ghost.delayInTicks;
      const fadeTicks = ghost.fadeDurationTicks;

      const totalFrames = delay + fadeTicks + 10;
      for (let i = 0; i < totalFrames; i++) {
        ghost.record(seg([i, 0]));
      }
      ghost.stopRecording();

      // Advance to fading state
      while (ghost.getLifecycleState() !== "fading") {
        ghost.advancePlayhead();
      }

      const opacities: number[] = [];
      while (ghost.getLifecycleState() === "fading") {
        opacities.push(ghost.getOpacity());
        ghost.advancePlayhead();
      }

      expect(opacities.length).toBeGreaterThan(0);
      for (let i = 1; i < opacities.length; i++) {
        expect(opacities[i]).toBeLessThanOrEqual(opacities[i - 1]);
      }
    });

    it("opacity is 0 once inactive", () => {
      const ghost = new EchoGhost(1000, 10);
      const delay = ghost.delayInTicks;

      for (let i = 0; i < delay + 2; i++) {
        ghost.record(seg([i, 0]));
      }
      ghost.stopRecording();

      for (let i = 0; i < 50; i++) {
        ghost.advancePlayhead();
      }
      expect(ghost.getLifecycleState()).toBe("inactive");
      expect(ghost.getOpacity()).toBe(0);
    });

    it("FADE_DURATION_MS is 1000", () => {
      expect(FADE_DURATION_MS).toBe(1000);
    });

    it("fadeDurationTicks = ceil(FADE_DURATION_MS / tickInterval)", () => {
      const ghost = new EchoGhost(125);
      expect(ghost.fadeDurationTicks).toBe(
        Math.ceil(FADE_DURATION_MS / 125),
      );
    });
  });

  describe("ghost does not extend indefinitely after death", () => {
    it("ghost reaches inactive within expected number of drain ticks", () => {
      const ghost = new EchoGhost(1000, 10); // delay=5, cap=10
      const delay = ghost.delayInTicks;
      const recordedFrames = delay + 4;

      for (let i = 0; i < recordedFrames; i++) {
        ghost.record(seg([i, 0]));
      }
      ghost.stopRecording();

      let drainTicks = 0;
      while (ghost.getLifecycleState() !== "inactive" && drainTicks < 200) {
        ghost.advancePlayhead();
        drainTicks++;
      }

      expect(ghost.getLifecycleState()).toBe("inactive");
      // Should not take more than recorded frames + delay to drain
      expect(drainTicks).toBeLessThanOrEqual(recordedFrames + delay);
    });

    it("MainScene drains ghost during gameOver and ghost reaches inactive", () => {
      const scene = new MainScene();
      scene.create();
      scene.enterPhase("playing");

      const snake = scene.getSnake()!;
      const ghost = scene.getEchoGhost()!;
      const interval = snake.getTicker().interval;

      // Build up ghost to active state
      snake.reset({ col: 1, row: 1 }, "right", 1);
      for (let i = 0; i < 37; i++) {
        scene.update(0, interval);
      }
      snake.bufferDirection("down");
      for (let i = 0; i < 3; i++) {
        scene.update(0, interval);
      }
      expect(ghost.getLifecycleState()).toBe("active");

      scene.endRun();

      // Drain during gameOver phase
      for (let i = 0; i < 200; i++) {
        if (ghost.getLifecycleState() === "inactive") break;
        scene.update(0, interval);
      }

      expect(ghost.getLifecycleState()).toBe("inactive");
      expect(ghost.getOpacity()).toBe(0);
    });

    it("new game after drain creates fresh ghost (zero ticks, warming)", () => {
      const scene = new MainScene();
      scene.create();
      scene.enterPhase("playing");

      const snake = scene.getSnake()!;
      const interval = snake.getTicker().interval;

      snake.reset({ col: 10, row: 15 }, "right", 1);
      for (let i = 0; i < 5; i++) {
        scene.update(0, interval);
      }

      scene.endRun();
      for (let i = 0; i < 20; i++) {
        scene.update(0, interval);
      }

      scene.enterPhase("playing");
      const newGhost = scene.getEchoGhost()!;
      expect(newGhost.getCurrentTick()).toBe(0);
      expect(newGhost.isRecordingStopped()).toBe(false);
      expect(newGhost.getLifecycleState()).toBe("warming");
    });
  });
});

// =====================================================================
// 4. DELAYED FOOD PARTICLE BURST TIMING
// =====================================================================

describe("delayed food particle burst timing", () => {
  describe("unit-level timing", () => {
    it("burst fires exactly at delayInTicks after scheduling", () => {
      const ghost = new EchoGhost(1000, 15); // delay=5
      const scheduler = new GhostFoodScheduler();
      const delay = ghost.delayInTicks;

      const eatTick = 3;

      // Record up to and including the eatTick
      for (let i = 0; i <= eatTick; i++) {
        ghost.record(seg([10 + i, 5]));
      }
      scheduler.schedule(eatTick);

      // Record more ticks. Burst fires when ghostFrame.tick == eatTick.
      // That happens when currentTick == eatTick + delay.
      // After recording tick N, currentTick = N + 1.
      // So burst fires after recording tick (eatTick + delay - 1).
      for (let i = eatTick + 1; i < eatTick + delay - 1; i++) {
        ghost.record(seg([10 + i, 5]));
        expect(scheduler.processTick(ghost)).toHaveLength(0);
      }

      // Record tick eatTick + delay - 1 → fires
      ghost.record(seg([10 + eatTick + delay - 1, 5]));
      const results = scheduler.processTick(ghost);
      expect(results).toHaveLength(1);
    });

    it("burst position matches ghost head at the scheduled tick", () => {
      const ghost = new EchoGhost(1000, 15); // delay=5
      const scheduler = new GhostFoodScheduler();
      const delay = ghost.delayInTicks;

      // Record with distinct positions per tick
      for (let i = 0; i < delay; i++) {
        ghost.record(seg([i * 3, i * 2]));
      }
      scheduler.schedule(0); // burst at tick 0

      const results = scheduler.processTick(ghost);
      expect(results).toHaveLength(1);

      const expected = gridToPixel({ col: 0, row: 0 });
      expect(results[0].x).toBe(expected.x);
      expect(results[0].y).toBe(expected.y);
    });

    it("missed bursts (past ticks) are discarded, not replayed", () => {
      const ghost = new EchoGhost(1000, 15);
      const scheduler = new GhostFoodScheduler();
      const delay = ghost.delayInTicks;

      for (let i = 0; i < delay + 5; i++) {
        ghost.record(seg([i, 0]));
      }
      // ghostFrame.tick = 5, but we schedule at tick 2 (already past)
      scheduler.schedule(2);

      const results = scheduler.processTick(ghost);
      expect(results).toHaveLength(0);
      expect(scheduler.getPendingCount()).toBe(0);
    });

    it("multiple bursts at different ticks fire at correct times", () => {
      const ghost = new EchoGhost(1000, 15);
      const scheduler = new GhostFoodScheduler();
      const delay = ghost.delayInTicks;

      scheduler.schedule(0);
      scheduler.schedule(2);

      for (let i = 0; i < delay; i++) {
        ghost.record(seg([i, 0]));
      }
      // ghostFrame.tick = 0 → first fires
      expect(scheduler.processTick(ghost)).toHaveLength(1);
      expect(scheduler.getPendingCount()).toBe(1);

      ghost.record(seg([delay, 0]));
      // ghostFrame.tick = 1 → nothing
      expect(scheduler.processTick(ghost)).toHaveLength(0);

      ghost.record(seg([delay + 1, 0]));
      // ghostFrame.tick = 2 → second fires
      expect(scheduler.processTick(ghost)).toHaveLength(1);
      expect(scheduler.getPendingCount()).toBe(0);
    });
  });

  describe("burst is purely cosmetic", () => {
    it("processTick does not mutate ghost state", () => {
      const ghost = new EchoGhost(1000, 15);
      const scheduler = new GhostFoodScheduler();
      const delay = ghost.delayInTicks;

      for (let i = 0; i < delay; i++) {
        ghost.record(seg([i, 0]));
      }
      scheduler.schedule(0);

      const tickBefore = ghost.getCurrentTick();
      const countBefore = ghost.getCount();
      const trailBefore = ghost.getGhostTrail();

      scheduler.processTick(ghost);

      expect(ghost.getCurrentTick()).toBe(tickBefore);
      expect(ghost.getCount()).toBe(countBefore);
      expect(ghost.getGhostTrail()).toEqual(trailBefore);
    });
  });

  describe("MainScene food-eat schedules burst", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/game/scenes/MainScene.ts"),
      "utf-8",
    );

    it("schedules burst with getCurrentTick() - 1 when food is eaten", () => {
      expect(source).toContain("ghostFoodScheduler.schedule(");
      expect(source).toContain("getCurrentTick() - 1");
    });

    it("processes bursts each tick and calls emitFoodParticles", () => {
      expect(source).toContain("ghostFoodScheduler.processTick(");
      expect(source).toContain("emitFoodParticles");
    });
  });
});

// =====================================================================
// 5. BIOME-TINTED GHOST RENDERING METADATA
// =====================================================================

describe("biome-tinted ghost rendering metadata", () => {
  // Helper: create a ghost with a full trail
  function createGhostWithTrail(trailLength: number = 3): EchoGhost {
    const ghost = new EchoGhost(125);
    for (let i = 0; i < ghost.delayInTicks + trailLength; i++) {
      const segments = [];
      for (let s = 0; s < trailLength; s++) {
        segments.push({ col: i + s, row: 5 });
      }
      ghost.record(segments);
    }
    return ghost;
  }

  function createRenderer() {
    const scene = new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
    const renderer = new EchoGhostRenderer(scene);
    return { scene, renderer };
  }

  describe("ghost sprites receive biome-specific tint", () => {
    it("applies neon ghost tint initially", () => {
      const { renderer } = createRenderer();
      const biome = new BiomeManager();
      renderer.setBiomeManager(biome);
      const ghost = createGhostWithTrail(3);

      renderer.update(ghost);

      expect(mockSpriteSetTint).toHaveBeenCalledWith(
        BIOME_CONFIGS.neon.ghostTint,
      );
    });

    it("applies toxic biome ghost tint after biome shift", () => {
      const { renderer } = createRenderer();
      const biome = new BiomeManager();
      renderer.setBiomeManager(biome);
      const ghost = createGhostWithTrail(3);

      biome.update(BIOME_SHIFT_INTERVAL_MS);
      biome.update(BIOME_TRANSITION_MS);

      renderer.update(ghost);

      expect(mockSpriteSetTint).toHaveBeenCalledWith(
        BIOME_CONFIGS.toxic.ghostTint,
      );
    });

    it("applies interpolated tint mid-transition", () => {
      const { renderer } = createRenderer();
      const biome = new BiomeManager();
      renderer.setBiomeManager(biome);
      const ghost = createGhostWithTrail(3);

      biome.update(BIOME_SHIFT_INTERVAL_MS);
      biome.update(BIOME_TRANSITION_MS / 2);

      renderer.update(ghost);

      const calledTint = mockSpriteSetTint.mock.calls[0][0];
      expect(calledTint).not.toBe(BIOME_CONFIGS.neon.ghostTint);
      expect(calledTint).not.toBe(BIOME_CONFIGS.toxic.ghostTint);
    });
  });

  describe("ghost trailing particles receive biome particle tint", () => {
    it("particle emitter uses biome particle tint", () => {
      const { renderer } = createRenderer();
      const biome = new BiomeManager();
      renderer.setBiomeManager(biome);
      const ghost = createGhostWithTrail(3);

      renderer.update(ghost);

      expect(mockAddParticles).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        "ghost-particle",
        expect.objectContaining({
          tint: BIOME_CONFIGS.neon.particleTint,
        }),
      );
    });

    it("particle tint updates when biome changes", () => {
      const { renderer } = createRenderer();
      const biome = new BiomeManager();
      renderer.setBiomeManager(biome);
      const ghost = createGhostWithTrail(3);

      renderer.update(ghost);

      // Shift to toxic biome
      biome.update(BIOME_SHIFT_INTERVAL_MS);
      biome.update(BIOME_TRANSITION_MS);

      // Record another tick to keep ghost alive
      ghost.record([
        { col: 99, row: 5 },
        { col: 98, row: 5 },
        { col: 97, row: 5 },
      ]);

      renderer.update(ghost);

      const emitter = renderer.getTrailEmitter();
      expect(emitter).not.toBeNull();
      expect(emitter!.particleTint).toBe(BIOME_CONFIGS.toxic.particleTint);
    });
  });

  describe("opacity and tinting are independent", () => {
    it("tint is applied alongside alpha (not replacing it)", () => {
      const { renderer } = createRenderer();
      const biome = new BiomeManager();
      renderer.setBiomeManager(biome);
      const ghost = createGhostWithTrail(3);

      renderer.update(ghost);

      expect(mockSpriteSetAlpha).toHaveBeenCalledWith(GHOST_BASE_ALPHA);
      expect(mockSpriteSetTint).toHaveBeenCalledWith(
        BIOME_CONFIGS.neon.ghostTint,
      );
    });

    it("base alpha is 40% as specified", () => {
      expect(GHOST_BASE_ALPHA).toBe(0.4);
    });

    it("effective alpha = GHOST_BASE_ALPHA * lifecycle opacity during fading", () => {
      const { renderer } = createRenderer();
      const biome = new BiomeManager();
      renderer.setBiomeManager(biome);
      const ghost = createGhostWithTrail(3);

      ghost.stopRecording();

      // Advance into fading with opacity < 1
      let advances = 0;
      while (ghost.getLifecycleState() !== "fading" && advances < 200) {
        ghost.advancePlayhead();
        advances++;
      }
      // Advance until opacity drops below 1
      let opacity = ghost.getOpacity();
      while (opacity >= 1 && advances < 200) {
        ghost.advancePlayhead();
        opacity = ghost.getOpacity();
        advances++;
      }

      expect(opacity).toBeGreaterThan(0);
      expect(opacity).toBeLessThan(1);

      renderer.update(ghost);

      const expectedAlpha = GHOST_BASE_ALPHA * opacity;
      expect(mockSpriteSetAlpha).toHaveBeenCalledWith(expectedAlpha);
    });
  });

  describe("biome config coverage", () => {
    it("each biome has distinct ghostTint and particleTint", () => {
      const ghostTints = new Set<number>();
      const particleTints = new Set<number>();

      for (const biome of BIOME_ORDER) {
        ghostTints.add(BIOME_CONFIGS[biome].ghostTint);
        particleTints.add(BIOME_CONFIGS[biome].particleTint);
      }

      expect(ghostTints.size).toBe(BIOME_ORDER.length);
      expect(particleTints.size).toBe(BIOME_ORDER.length);
    });

    it("all biomes in BIOME_ORDER have valid configs", () => {
      for (const biome of BIOME_ORDER) {
        const config = BIOME_CONFIGS[biome];
        expect(config).toBeDefined();
        expect(config.ghostTint).toBeTypeOf("number");
        expect(config.particleTint).toBeTypeOf("number");
        expect(config.name).toBeTypeOf("string");
      }
    });

    it("biome transitions are smooth (interpolated ghost tint changes)", () => {
      const mgr = new BiomeManager();

      mgr.update(BIOME_SHIFT_INTERVAL_MS);
      expect(mgr.isTransitioning()).toBe(true);

      // Ghost tint at start of transition
      const startTint = mgr.getGhostTint();

      // Advance halfway through transition
      mgr.update(BIOME_TRANSITION_MS / 2);
      const midTint = mgr.getGhostTint();

      // Complete transition
      mgr.update(BIOME_TRANSITION_MS / 2);
      const endTint = mgr.getGhostTint();

      // All three should be different (interpolated)
      expect(startTint).not.toBe(endTint);
      // Mid should be between start and end (different from both)
      expect(midTint).not.toBe(startTint);
      expect(midTint).not.toBe(endTint);
    });
  });

  describe("no biome manager fallback", () => {
    it("defaults to white (0xffffff) tint when no biome manager set", () => {
      const { renderer } = createRenderer();
      const ghost = createGhostWithTrail(3);

      renderer.update(ghost);

      expect(mockSpriteSetTint).toHaveBeenCalledWith(0xffffff);
    });
  });
});
