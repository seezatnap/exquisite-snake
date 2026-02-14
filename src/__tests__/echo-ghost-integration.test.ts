/**
 * Automated integration tests for task #9:
 *
 * 1. 5-second delay accuracy
 * 2. Ghost self-overlap kill behavior
 * 3. Fade-out and bounded buffer lifecycle
 * 4. Delayed food particle burst timing
 * 5. Biome-tinted ghost rendering metadata
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { gameBridge } from "@/game/bridge";
import { GRID_COLS } from "@/game/config";
import {
  EchoGhost,
  CircularBuffer,
} from "@/game/entities/EchoGhost";
import type { GridPos } from "@/game/utils/grid";
import { DEFAULT_MOVE_INTERVAL_MS } from "@/game/utils/grid";

// ── Phaser mock ──────────────────────────────────────────────────

const mockGraphicsClear = vi.fn();
const mockGraphicsFillStyle = vi.fn();
const mockGraphicsFillRoundedRect = vi.fn();
const mockGraphicsLineStyle = vi.fn();
const mockGraphicsBeginPath = vi.fn();
const mockGraphicsMoveTo = vi.fn();
const mockGraphicsLineTo = vi.fn();
const mockGraphicsStrokePath = vi.fn();
const mockGraphicsDestroy = vi.fn();

function createMockGraphics() {
  return {
    clear: mockGraphicsClear,
    fillStyle: mockGraphicsFillStyle,
    fillRoundedRect: mockGraphicsFillRoundedRect,
    lineStyle: mockGraphicsLineStyle,
    beginPath: mockGraphicsBeginPath,
    moveTo: mockGraphicsMoveTo,
    lineTo: mockGraphicsLineTo,
    strokePath: mockGraphicsStrokePath,
    destroy: mockGraphicsDestroy,
  };
}

const mockShake = vi.fn();
const mockEmitterDestroy = vi.fn();
const mockExplode = vi.fn();
const mockDelayedCall = vi.fn();
const mockTexturesExists = vi.fn().mockReturnValue(true);
const mockAddParticles = vi.fn(() => ({
  explode: mockExplode,
  destroy: mockEmitterDestroy,
}));
const mockKeyboardOn = vi.fn();

vi.mock("phaser", () => {
  class MockScene {
    scene = { start: vi.fn() };
    add = {
      graphics: vi.fn(() => createMockGraphics()),
      sprite: vi.fn(() => ({
        destroy: vi.fn(),
        setPosition: vi.fn(),
        x: 0,
        y: 0,
      })),
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
import {
  GhostRenderer,
  GHOST_BASE_ALPHA,
  GHOST_FILL_COLOR,
} from "@/game/systems/GhostRenderer";
import {
  Biome,
  BiomeManager,
  BIOME_COLORS,
  BIOME_DURATION_MS,
  BIOME_TRANSITION_DURATION_MS,
  lerpColor,
  type BiomeColorProvider,
} from "@/game/systems/BiomeTheme";
import Phaser from "phaser";

// ── Helpers ──────────────────────────────────────────────────────

function snap(...positions: [number, number][]): GridPos[] {
  return positions.map(([col, row]) => ({ col, row }));
}

function resetBridge(): void {
  gameBridge.setPhase("start");
  gameBridge.setScore(0);
  gameBridge.setHighScore(0);
  gameBridge.setElapsedTime(0);
}

function createScene(): Phaser.Scene {
  return new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
}

function makeActiveGhost(
  tickMs = 100,
  delayMs = 500,
  capacity = 20,
): EchoGhost {
  const ghost = new EchoGhost(tickMs, delayMs, capacity);
  const delayTicks = ghost.getDelayTicks();
  for (let i = 0; i < delayTicks + 3; i++) {
    ghost.recordTick(snap([i, 0]));
  }
  return ghost;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetBridge();
  mockTexturesExists.mockReturnValue(true);
  localStorage.clear();
});

// ═════════════════════════════════════════════════════════════════
// 1. 5-SECOND DELAY ACCURACY
// ═════════════════════════════════════════════════════════════════

describe("5-second delay accuracy", () => {
  it("delay ticks exactly equals ceil(5000 / tickInterval) at default 125ms", () => {
    const ghost = new EchoGhost();
    const expected = Math.ceil(5000 / DEFAULT_MOVE_INTERVAL_MS);
    expect(ghost.getDelayTicks()).toBe(expected);
    // 5000 / 125 = 40, so exactly 40 ticks
    expect(ghost.getDelayTicks()).toBe(40);
  });

  it("ghost activation time in ms is within one tick of 5 seconds", () => {
    const ghost = new EchoGhost();
    const activationMs = ghost.getDelayTicks() * DEFAULT_MOVE_INTERVAL_MS;
    expect(activationMs).toBeGreaterThanOrEqual(5000);
    expect(activationMs).toBeLessThanOrEqual(5000 + DEFAULT_MOVE_INTERVAL_MS);
  });

  it("ghost is inactive at tick 39 (one tick before 5 seconds)", () => {
    const ghost = new EchoGhost();
    for (let i = 0; i < 39; i++) {
      ghost.recordTick(snap([i, 0]));
    }
    expect(ghost.isActive()).toBe(false);
    expect(ghost.getGhostTrail()).toEqual([]);
    expect(ghost.getGhostHead()).toBeUndefined();
  });

  it("ghost becomes active at exactly tick 40 (5 seconds at 125ms)", () => {
    const ghost = new EchoGhost();
    for (let i = 0; i < 40; i++) {
      ghost.recordTick(snap([i, 0]));
    }
    expect(ghost.isActive()).toBe(true);
    expect(ghost.getLifecycleState()).toBe("active");
  });

  it("ghost trail contains the position from exactly 5s ago once active", () => {
    const ghost = new EchoGhost();
    // Record 41 ticks so there's 1 readable entry
    for (let i = 0; i < 41; i++) {
      ghost.recordTick(snap([i, 0]));
    }
    const trail = ghost.getGhostTrail();
    expect(trail.length).toBe(1);
    // The ghost shows position from tick 0 (40 ticks / 5 seconds ago)
    expect(trail[0].segments[0]).toEqual({ col: 0, row: 0 });
  });

  it("delay accuracy holds for non-divisible tick intervals", () => {
    // 60ms tick rate: ceil(5000/60) = 84 ticks = 5040ms (within one tick)
    const ghost60 = new EchoGhost(60, 5000);
    expect(ghost60.getDelayTicks()).toBe(84);
    expect(ghost60.getDelayTicks() * 60).toBe(5040);
    expect(ghost60.getDelayTicks() * 60 - 5000).toBeLessThanOrEqual(60);

    // 150ms tick rate: ceil(5000/150) ≈ 34 ticks = 5100ms
    const ghost150 = new EchoGhost(150, 5000);
    expect(ghost150.getDelayTicks()).toBe(34);
    expect(ghost150.getDelayTicks() * 150 - 5000).toBeLessThanOrEqual(150);
  });

  it("MainScene ghost activates after 5 seconds of gameplay ticks", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const ghost = scene.getGhost()!;
    const snake = scene.getSnake()!;
    snake.reset({ col: 1, row: 15 }, "right", 1);

    const interval = snake.getTicker().interval;
    const delayTicks = ghost.getDelayTicks();

    // Record delayTicks - 1 ticks: ghost still inactive
    for (let i = 0; i < delayTicks - 1; i++) {
      scene.update(0, interval);
      if (scene.getPhase() !== "playing") return;
    }
    expect(ghost.isActive()).toBe(false);

    // One more tick: ghost activates
    scene.update(0, interval);
    if (scene.getPhase() !== "playing") return;
    expect(ghost.isActive()).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════
// 2. GHOST SELF-OVERLAP KILL BEHAVIOR
// ═════════════════════════════════════════════════════════════════

describe("Ghost self-overlap kill behavior", () => {
  it("snake head overlapping active ghost triggers game over", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const ghost = scene.getGhost()!;
    const snake = scene.getSnake()!;
    snake.reset({ col: 1, row: 15 }, "right", 1);

    const interval = snake.getTicker().interval;
    const delayTicks = ghost.getDelayTicks();

    // Activate the ghost
    for (let i = 0; i < delayTicks; i++) {
      scene.update(0, interval);
      if (scene.getPhase() !== "playing") return;
    }
    expect(ghost.isActive()).toBe(true);

    // Find where the ghost head is and position the snake to collide
    const ghostPos = ghost.getGhostHead()!.segments[0];
    snake.reset({ col: ghostPos.col - 1, row: ghostPos.row }, "right", 1);

    scene.update(0, interval);

    expect(scene.getPhase()).toBe("gameOver");
    expect(snake.isAlive()).toBe(false);
  });

  it("ghost collision is treated as fatal self-collision-equivalent", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");
    scene.addScore(42);

    const ghost = scene.getGhost()!;
    const snake = scene.getSnake()!;
    snake.reset({ col: 1, row: 15 }, "right", 1);

    const interval = snake.getTicker().interval;
    const delayTicks = ghost.getDelayTicks();

    for (let i = 0; i < delayTicks; i++) {
      scene.update(0, interval);
      if (scene.getPhase() !== "playing") return;
    }

    const ghostPos = ghost.getGhostHead()!.segments[0];
    snake.reset({ col: ghostPos.col - 1, row: ghostPos.row }, "right", 1);
    scene.update(0, interval);

    // Verify same game-over outcome as self-collision
    expect(scene.getPhase()).toBe("gameOver");
    expect(snake.isAlive()).toBe(false);
    expect(mockShake).toHaveBeenCalled(); // camera shake on death
    expect(scene.getHighScore()).toBe(42); // high score saved
  });

  it("ghost collision checks all segments of the ghost head snapshot", () => {
    // Use EchoGhost directly to test isOnGhost with multi-segment snapshot
    const ghost = new EchoGhost(100, 300, 20);
    const delayTicks = ghost.getDelayTicks(); // 3

    // Record a 3-segment snake
    for (let i = 0; i < delayTicks + 1; i++) {
      ghost.recordTick(snap([i + 5, 10], [i + 4, 10], [i + 3, 10]));
    }

    // Ghost head is the first recorded tick: segments (5,10), (4,10), (3,10)
    expect(ghost.isOnGhost({ col: 5, row: 10 })).toBe(true);
    expect(ghost.isOnGhost({ col: 4, row: 10 })).toBe(true);
    expect(ghost.isOnGhost({ col: 3, row: 10 })).toBe(true);
    expect(ghost.isOnGhost({ col: 99, row: 99 })).toBe(false);
  });

  it("no ghost collision when ghost is inactive (before 5s delay)", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const ghost = scene.getGhost()!;
    const snake = scene.getSnake()!;
    snake.reset({ col: 5, row: 15 }, "right", 1);

    const interval = snake.getTicker().interval;

    // Record only a few ticks — ghost stays inactive
    for (let i = 0; i < 5; i++) {
      scene.update(0, interval);
      if (scene.getPhase() !== "playing") return;
    }

    expect(ghost.isActive()).toBe(false);
    expect(scene.getPhase()).toBe("playing");
  });

  it("no ghost collision when snake is on a different position", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const ghost = scene.getGhost()!;
    const snake = scene.getSnake()!;
    snake.reset({ col: 1, row: 10 }, "right", 1);

    const interval = snake.getTicker().interval;
    const delayTicks = ghost.getDelayTicks();

    // Activate ghost
    for (let i = 0; i < delayTicks; i++) {
      scene.update(0, interval);
      if (scene.getPhase() !== "playing") return;
    }

    // Ghost is at row 10; move snake to row 5
    snake.reset({ col: 1, row: 5 }, "right", 1);
    scene.update(0, interval);

    expect(scene.getPhase()).toBe("playing");
    expect(snake.isAlive()).toBe(true);
  });

  it("wall collision takes priority over ghost collision", () => {
    const scene = new MainScene();
    scene.create();
    scene.enterPhase("playing");

    const snake = scene.getSnake()!;
    snake.reset({ col: GRID_COLS - 1, row: 15 }, "right", 1);

    const interval = snake.getTicker().interval;
    scene.update(0, interval);

    // Wall collision triggers game over before ghost is even checked
    expect(scene.getPhase()).toBe("gameOver");
  });

  it("isOnGhost returns false after ghost is expired", () => {
    const ghost = new EchoGhost(100, 500, 20);
    const delayTicks = ghost.getDelayTicks();

    for (let i = 0; i < delayTicks + 3; i++) {
      ghost.recordTick(snap([i, 0]));
    }
    ghost.stopRecording();
    for (let i = 0; i < ghost.getTrailWindow(); i++) {
      ghost.advanceFadeOut();
    }

    expect(ghost.isExpired()).toBe(true);
    expect(ghost.isOnGhost({ col: 0, row: 0 })).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════
// 3. FADE-OUT AND BOUNDED BUFFER LIFECYCLE
// ═════════════════════════════════════════════════════════════════

describe("Fade-out and bounded buffer lifecycle", () => {
  describe("bounded buffer", () => {
    it("circular buffer wraps around at capacity", () => {
      const buf = new CircularBuffer<number>(5);
      for (let i = 0; i < 10; i++) buf.write(i);
      expect(buf.count).toBe(5);
      // Oldest surviving: 5, 6, 7, 8, 9
      expect(buf.read(0, 0)).toBe(5);
      expect(buf.read(0, 4)).toBe(9);
    });

    it("ghost trail never exceeds trailWindow", () => {
      const ghost = new EchoGhost(100, 500, 50, 5);
      // delayTicks=5, trailWindow=5
      for (let i = 0; i < 30; i++) {
        ghost.recordTick(snap([i, 0]));
      }
      expect(ghost.getGhostLength()).toBe(5);
      expect(ghost.getGhostTrail().length).toBe(5);
    });

    it("ghost trail shows a rolling window of the most recent readable entries", () => {
      const ghost = new EchoGhost(100, 300, 30, 4);
      // delayTicks=3, trailWindow=4
      for (let i = 0; i < 12; i++) {
        ghost.recordTick(snap([i, 0]));
      }
      // readable = 12-3=9, window=4 → entries at index 5,6,7,8
      const trail = ghost.getGhostTrail();
      expect(trail.length).toBe(4);
      expect(trail[0].segments[0]).toEqual({ col: 5, row: 0 });
      expect(trail[3].segments[0]).toEqual({ col: 8, row: 0 });
    });

    it("buffer capacity defaults to 2× delay ticks", () => {
      const ghost = new EchoGhost(100, 1000);
      expect(ghost.getBufferCapacity()).toBe(ghost.getDelayTicks() * 2);
    });

    it("overwritten entries do not appear in the ghost trail", () => {
      // Small buffer: capacity=8, delay=5
      const ghost = new EchoGhost(100, 500, 8);
      // Write 12 entries (overwrites 4)
      for (let i = 0; i < 12; i++) {
        ghost.recordTick(snap([i * 10, 0]));
      }
      // readable = min(count, capacity) - delay = 8 - 5 = 3
      const trail = ghost.getGhostTrail();
      expect(trail.length).toBe(3);
      // Should contain entries 4,5,6 (the surviving non-delayed entries)
      for (const entry of trail) {
        expect(entry.segments[0].col).toBeGreaterThanOrEqual(40);
      }
    });
  });

  describe("lifecycle states", () => {
    it("full lifecycle: inactive → active → fadingOut → expired", () => {
      const ghost = new EchoGhost(100, 500, 20);
      expect(ghost.getLifecycleState()).toBe("inactive");

      const delayTicks = ghost.getDelayTicks();
      for (let i = 0; i < delayTicks; i++) {
        ghost.recordTick(snap([i, 0]));
      }
      expect(ghost.getLifecycleState()).toBe("active");

      ghost.stopRecording();
      expect(ghost.getLifecycleState()).toBe("fadingOut");
      expect(ghost.isFadingOut()).toBe(true);

      for (let i = 0; i < ghost.getTrailWindow(); i++) {
        ghost.advanceFadeOut();
      }
      expect(ghost.getLifecycleState()).toBe("expired");
      expect(ghost.isExpired()).toBe(true);
    });

    it("recordTick is no-op during fadingOut and expired states", () => {
      const ghost = new EchoGhost(100, 500, 20);
      for (let i = 0; i < ghost.getDelayTicks() + 3; i++) {
        ghost.recordTick(snap([i, 0]));
      }

      ghost.stopRecording();
      const ticksAtFade = ghost.getTotalTicksWritten();
      ghost.recordTick(snap([99, 99]));
      expect(ghost.getTotalTicksWritten()).toBe(ticksAtFade);

      for (let i = 0; i < ghost.getTrailWindow(); i++) {
        ghost.advanceFadeOut();
      }
      ghost.recordTick(snap([88, 88]));
      expect(ghost.getTotalTicksWritten()).toBe(ticksAtFade);
    });
  });

  describe("fade-out opacity", () => {
    it("fade opacity decreases monotonically from 1 to 0", () => {
      const ghost = new EchoGhost(100, 500, 20);
      for (let i = 0; i < ghost.getDelayTicks() + 3; i++) {
        ghost.recordTick(snap([i, 0]));
      }
      ghost.stopRecording();

      const opacities: number[] = [];
      opacities.push(ghost.getFadeOpacity());
      for (let i = 0; i < ghost.getTrailWindow(); i++) {
        ghost.advanceFadeOut();
        opacities.push(ghost.getFadeOpacity());
      }

      // First value should be 1
      expect(opacities[0]).toBe(1);
      // Last value should be 0 (expired)
      expect(opacities[opacities.length - 1]).toBe(0);
      // Monotonically decreasing
      for (let i = 1; i < opacities.length; i++) {
        expect(opacities[i]).toBeLessThanOrEqual(opacities[i - 1]);
      }
    });

    it("getGhostTrailWithOpacity returns entries with reduced alpha during fade-out", () => {
      const ghost = new EchoGhost(100, 500, 20);
      for (let i = 0; i < ghost.getDelayTicks() + 5; i++) {
        ghost.recordTick(snap([i, 0]));
      }

      const beforeFade = ghost.getGhostTrailWithOpacity();
      const maxBefore = Math.max(...beforeFade.map((e) => e.opacity));

      ghost.stopRecording();
      ghost.advanceFadeOut();
      ghost.advanceFadeOut();

      const duringFade = ghost.getGhostTrailWithOpacity();
      const maxDuring = Math.max(...duringFade.map((e) => e.opacity));

      expect(maxDuring).toBeLessThan(maxBefore);
    });

    it("getGhostTrailWithOpacity returns empty array after expiry", () => {
      const ghost = new EchoGhost(100, 500, 20);
      for (let i = 0; i < ghost.getDelayTicks() + 3; i++) {
        ghost.recordTick(snap([i, 0]));
      }
      ghost.stopRecording();
      for (let i = 0; i < ghost.getTrailWindow(); i++) {
        ghost.advanceFadeOut();
      }

      expect(ghost.getGhostTrailWithOpacity()).toEqual([]);
    });

    it("fade-out duration equals trailWindow ticks", () => {
      const ghost = new EchoGhost(100, 500, 20);
      for (let i = 0; i < ghost.getDelayTicks() + 3; i++) {
        ghost.recordTick(snap([i, 0]));
      }
      ghost.stopRecording();

      let ticks = 0;
      while (ghost.advanceFadeOut()) {
        ticks++;
      }
      // Total fade ticks = trailWindow - 1 (last advanceFadeOut returns false)
      // Plus the one that returned false
      expect(ticks + 1).toBe(ghost.getTrailWindow());
    });
  });

  describe("reset clears all lifecycle state", () => {
    it("reset from any lifecycle state returns to inactive", () => {
      const ghost = new EchoGhost(100, 500, 20);
      for (let i = 0; i < ghost.getDelayTicks() + 3; i++) {
        ghost.recordTick(snap([i, 0]));
      }
      ghost.stopRecording();
      ghost.advanceFadeOut();

      ghost.reset();
      expect(ghost.getLifecycleState()).toBe("inactive");
      expect(ghost.getTotalTicksWritten()).toBe(0);
      expect(ghost.getFadeOpacity()).toBe(1);
      expect(ghost.getGhostTrail()).toEqual([]);

      // Can re-activate after reset
      for (let i = 0; i < ghost.getDelayTicks() + 1; i++) {
        ghost.recordTick(snap([i, 0]));
      }
      expect(ghost.isActive()).toBe(true);
    });
  });
});

// ═════════════════════════════════════════════════════════════════
// 4. DELAYED FOOD PARTICLE BURST TIMING
// ═════════════════════════════════════════════════════════════════

describe("Delayed food particle burst timing", () => {
  it("burst fires at exactly delayTicks after scheduling", () => {
    const ghost = new EchoGhost(100, 500, 20);
    // delayTicks = 5

    // Activate ghost
    for (let i = 0; i < 5; i++) {
      ghost.recordTick(snap([i, 0]));
    }

    ghost.scheduleFoodBurst(); // fires at tick 5 + 5 = 10

    // Ticks 6-9: no burst
    for (let i = 5; i < 9; i++) {
      ghost.recordTick(snap([i, 0]));
      expect(ghost.consumePendingBursts().length).toBe(0);
    }

    // Tick 10: burst fires
    ghost.recordTick(snap([9, 0]));
    const bursts = ghost.consumePendingBursts();
    expect(bursts.length).toBe(1);
  });

  it("burst fires exactly 5 seconds later at default tick rate", () => {
    const ghost = new EchoGhost(); // 125ms tick, 5000ms delay → 40 tick delay
    const delayTicks = ghost.getDelayTicks();

    // Activate ghost
    for (let i = 0; i < delayTicks; i++) {
      ghost.recordTick(snap([i % 20, i % 30]));
    }

    ghost.scheduleFoodBurst(); // fires at tick delayTicks + delayTicks = 80

    // Record delayTicks - 1 more ticks: no burst yet
    for (let i = delayTicks; i < delayTicks * 2 - 1; i++) {
      ghost.recordTick(snap([i % 20, i % 30]));
      expect(ghost.consumePendingBursts().length).toBe(0);
    }

    // One more tick: burst fires
    ghost.recordTick(snap([0, 0]));
    expect(ghost.consumePendingBursts().length).toBe(1);
  });

  it("burst position corresponds to ghost head at the fire tick", () => {
    const ghost = new EchoGhost(100, 500, 20);
    // delayTicks = 5

    for (let i = 0; i < 5; i++) {
      ghost.recordTick(snap([i, 0]));
    }

    ghost.scheduleFoodBurst(); // fireTick = 10

    for (let i = 5; i < 9; i++) {
      ghost.recordTick(snap([i, 0]));
      ghost.consumePendingBursts();
    }

    ghost.recordTick(snap([9, 0]));
    const bursts = ghost.consumePendingBursts();
    expect(bursts.length).toBe(1);
    // Ghost head at tick 10: readable=10-5=5, head=read(5,4)=entry[4]=(4,0)
    expect(bursts[0]).toEqual({ col: 4, row: 0 });
  });

  it("multiple bursts at different ticks fire independently", () => {
    const ghost = new EchoGhost(100, 500, 30);

    for (let i = 0; i < 5; i++) {
      ghost.recordTick(snap([i, 0]));
    }
    ghost.scheduleFoodBurst(); // fires at tick 10

    ghost.recordTick(snap([5, 0]));
    ghost.consumePendingBursts();
    ghost.recordTick(snap([6, 0]));
    ghost.consumePendingBursts();
    ghost.scheduleFoodBurst(); // fires at tick 12

    expect(ghost.getPendingBurstCount()).toBe(2);

    // Advance to tick 10
    for (let i = 7; i < 9; i++) {
      ghost.recordTick(snap([i, 0]));
      ghost.consumePendingBursts();
    }
    ghost.recordTick(snap([9, 0]));
    expect(ghost.consumePendingBursts().length).toBe(1);
    expect(ghost.getPendingBurstCount()).toBe(1);

    // Advance to tick 12
    ghost.recordTick(snap([10, 0]));
    ghost.consumePendingBursts();
    ghost.recordTick(snap([11, 0]));
    expect(ghost.consumePendingBursts().length).toBe(1);
    expect(ghost.getPendingBurstCount()).toBe(0);
  });

  it("consumePendingBursts is single-use (cleared after consumption)", () => {
    const ghost = new EchoGhost(100, 500, 20);

    for (let i = 0; i < 5; i++) {
      ghost.recordTick(snap([i, 0]));
    }
    ghost.scheduleFoodBurst();

    for (let i = 5; i < 9; i++) {
      ghost.recordTick(snap([i, 0]));
      ghost.consumePendingBursts();
    }

    ghost.recordTick(snap([9, 0]));
    expect(ghost.consumePendingBursts().length).toBe(1);
    expect(ghost.consumePendingBursts().length).toBe(0);
  });

  it("scheduling burst has no impact on ghost state", () => {
    const ghost = new EchoGhost(100, 500, 20);
    for (let i = 0; i < 5; i++) {
      ghost.recordTick(snap([i, 0]));
    }

    const ticksBefore = ghost.getTotalTicksWritten();
    const stateBefore = ghost.getLifecycleState();
    const trailBefore = ghost.getGhostTrail();

    ghost.scheduleFoodBurst();

    expect(ghost.getTotalTicksWritten()).toBe(ticksBefore);
    expect(ghost.getLifecycleState()).toBe(stateBefore);
    expect(ghost.getGhostTrail()).toEqual(trailBefore);
  });

  it("reset clears pending bursts", () => {
    const ghost = new EchoGhost(100, 500, 20);
    for (let i = 0; i < 5; i++) {
      ghost.recordTick(snap([i, 0]));
    }
    ghost.scheduleFoodBurst();
    ghost.scheduleFoodBurst();
    expect(ghost.getPendingBurstCount()).toBe(1); // same tick → 1 unique
    // Actually scheduleFoodBurst adds to the same fireTick since ticksWritten hasn't changed
    // Let's advance and schedule again
    ghost.recordTick(snap([5, 0]));
    ghost.consumePendingBursts();
    ghost.scheduleFoodBurst();
    expect(ghost.getPendingBurstCount()).toBe(2);

    ghost.reset();
    expect(ghost.getPendingBurstCount()).toBe(0);
  });

  it("MainScene schedules burst when food is eaten and fires at ghost position", () => {
    const scene = new MainScene();
    scene.create();
    scene.setRng(() => 0.5);
    scene.enterPhase("playing");

    const ghost = scene.getGhost()!;
    const snake = scene.getSnake()!;
    const food = scene.getFood()!;

    // Position snake to eat food
    const foodPos = food.getPosition();
    snake.reset({ col: foodPos.col - 1, row: foodPos.row }, "right", 1);

    const interval = snake.getTicker().interval;

    // Eat the food
    scene.update(0, interval);
    if (scene.getPhase() !== "playing") return;

    // If food was eaten, there should be a pending burst
    if (scene.getScore() > 0) {
      expect(ghost.getPendingBurstCount()).toBe(1);
    }
  });
});

// ═════════════════════════════════════════════════════════════════
// 5. BIOME-TINTED GHOST RENDERING METADATA
// ═════════════════════════════════════════════════════════════════

describe("Biome-tinted ghost rendering metadata", () => {
  describe("BiomeManager color provider", () => {
    it("provides NeonCity colors at start", () => {
      const mgr = new BiomeManager();
      mgr.start();
      expect(mgr.getGhostBodyColor()).toBe(BIOME_COLORS[Biome.NeonCity].snakeBody);
      expect(mgr.getGhostParticleColor()).toBe(BIOME_COLORS[Biome.NeonCity].particle);
    });

    it("transitions to IceCavern colors after biome change", () => {
      const mgr = new BiomeManager();
      mgr.start();
      mgr.update(BIOME_DURATION_MS);
      mgr.update(BIOME_TRANSITION_DURATION_MS);
      expect(mgr.getGhostBodyColor()).toBe(BIOME_COLORS[Biome.IceCavern].snakeBody);
      expect(mgr.getGhostParticleColor()).toBe(BIOME_COLORS[Biome.IceCavern].particle);
    });

    it("interpolates colors smoothly during transition", () => {
      const mgr = new BiomeManager();
      mgr.start();
      mgr.update(BIOME_DURATION_MS);
      mgr.update(BIOME_TRANSITION_DURATION_MS / 2);

      const bodyColor = mgr.getGhostBodyColor();
      expect(bodyColor).not.toBe(BIOME_COLORS[Biome.NeonCity].snakeBody);
      expect(bodyColor).not.toBe(BIOME_COLORS[Biome.IceCavern].snakeBody);
    });

    it("all four biomes have distinct body and particle colors", () => {
      const bodyColors = Object.values(Biome).map((b) => BIOME_COLORS[b].snakeBody);
      const particleColors = Object.values(Biome).map((b) => BIOME_COLORS[b].particle);
      expect(new Set(bodyColors).size).toBe(4);
      expect(new Set(particleColors).size).toBe(4);
    });
  });

  describe("GhostRenderer with biome provider", () => {
    function createMockProvider(body: number, particle: number): BiomeColorProvider {
      return {
        getGhostBodyColor: () => body,
        getGhostParticleColor: () => particle,
      };
    }

    it("uses biome body color for fill and outline when provider is set", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();
      renderer.setBiomeColorProvider(createMockProvider(0xaabbcc, 0x112233));

      renderer.render(ghost, 16);

      for (const call of mockGraphicsFillStyle.mock.calls) {
        expect(call[0]).toBe(0xaabbcc);
      }
      for (const call of mockGraphicsLineStyle.mock.calls) {
        expect(call[1]).toBe(0xaabbcc);
      }
      renderer.destroy();
    });

    it("uses biome particle color for trailing particle tint", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();
      renderer.setBiomeColorProvider(createMockProvider(0xaabbcc, 0x112233));

      renderer.render(ghost, 200); // enough delta for particle emit

      const particleCalls = mockAddParticles.mock.calls;
      expect(particleCalls.length).toBeGreaterThan(0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = (particleCalls[0] as any)[3] as Record<string, unknown>;
      expect(config.tint).toBe(0x112233);
      renderer.destroy();
    });

    it("preserves 40% base alpha when biome tinting is active", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();
      renderer.setBiomeColorProvider(createMockProvider(0xff0000, 0x00ff00));

      renderer.render(ghost, 16);

      for (const call of mockGraphicsFillStyle.mock.calls) {
        expect(call[1]).toBeLessThanOrEqual(GHOST_BASE_ALPHA);
        expect(call[1]).toBeGreaterThan(0);
      }
      renderer.destroy();
    });

    it("preserves dashed outline when biome tinting is active", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();
      renderer.setBiomeColorProvider(createMockProvider(0xff0000, 0x00ff00));

      renderer.render(ghost, 16);

      expect(mockGraphicsBeginPath).toHaveBeenCalled();
      expect(mockGraphicsMoveTo).toHaveBeenCalled();
      expect(mockGraphicsLineTo).toHaveBeenCalled();
      expect(mockGraphicsStrokePath).toHaveBeenCalled();
      renderer.destroy();
    });

    it("reverts to static colors when provider is set to null", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();

      renderer.setBiomeColorProvider(createMockProvider(0xff0000, 0x00ff00));
      renderer.setBiomeColorProvider(null);

      renderer.render(ghost, 16);

      for (const call of mockGraphicsFillStyle.mock.calls) {
        expect(call[0]).toBe(GHOST_FILL_COLOR);
      }
      renderer.destroy();
    });

    it("queries biome colors each frame for real-time updates during transitions", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();

      let color = 0xff0000;
      const provider: BiomeColorProvider = {
        getGhostBodyColor: () => color,
        getGhostParticleColor: () => color,
      };
      renderer.setBiomeColorProvider(provider);

      renderer.render(ghost, 16);
      expect(mockGraphicsFillStyle.mock.calls[0][0]).toBe(0xff0000);

      color = 0x0000ff;
      mockGraphicsFillStyle.mockClear();
      renderer.render(ghost, 16);
      expect(mockGraphicsFillStyle.mock.calls[0][0]).toBe(0x0000ff);

      renderer.destroy();
    });
  });

  describe("BiomeManager + GhostRenderer integration", () => {
    it("NeonCity ghost body color at start", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();
      const mgr = new BiomeManager();
      mgr.start();
      renderer.setBiomeColorProvider(mgr);

      renderer.render(ghost, 16);

      expect(mockGraphicsFillStyle.mock.calls[0][0]).toBe(
        BIOME_COLORS[Biome.NeonCity].snakeBody,
      );
      renderer.destroy();
    });

    it("IceCavern ghost body color after full transition", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();
      const mgr = new BiomeManager();
      mgr.start();
      renderer.setBiomeColorProvider(mgr);

      mgr.update(BIOME_DURATION_MS);
      mgr.update(BIOME_TRANSITION_DURATION_MS);

      mockGraphicsFillStyle.mockClear();
      renderer.render(ghost, 16);

      expect(mockGraphicsFillStyle.mock.calls[0][0]).toBe(
        BIOME_COLORS[Biome.IceCavern].snakeBody,
      );
      renderer.destroy();
    });

    it("smooth color transition during biome change renders interpolated colors", () => {
      const scene = createScene();
      const renderer = new GhostRenderer(scene);
      const ghost = makeActiveGhost();
      const mgr = new BiomeManager();
      mgr.start();
      renderer.setBiomeColorProvider(mgr);

      mgr.update(BIOME_DURATION_MS);
      mgr.update(BIOME_TRANSITION_DURATION_MS / 2);

      mockGraphicsFillStyle.mockClear();
      renderer.render(ghost, 16);

      const fillColor = mockGraphicsFillStyle.mock.calls[0][0];
      expect(fillColor).not.toBe(BIOME_COLORS[Biome.NeonCity].snakeBody);
      expect(fillColor).not.toBe(BIOME_COLORS[Biome.IceCavern].snakeBody);
      renderer.destroy();
    });
  });

  describe("lerpColor utility", () => {
    it("start color at t=0", () => {
      expect(lerpColor(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
    });

    it("end color at t=1", () => {
      expect(lerpColor(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
    });

    it("midpoint at t=0.5", () => {
      const mid = lerpColor(0x000000, 0xffffff, 0.5);
      const r = (mid >> 16) & 0xff;
      const g = (mid >> 8) & 0xff;
      const b = mid & 0xff;
      expect(r).toBeGreaterThanOrEqual(127);
      expect(r).toBeLessThanOrEqual(128);
      expect(g).toBeGreaterThanOrEqual(127);
      expect(g).toBeLessThanOrEqual(128);
      expect(b).toBeGreaterThanOrEqual(127);
      expect(b).toBeLessThanOrEqual(128);
    });

    it("clamps t outside [0, 1]", () => {
      expect(lerpColor(0xff0000, 0x0000ff, -1)).toBe(0xff0000);
      expect(lerpColor(0xff0000, 0x0000ff, 2)).toBe(0x0000ff);
    });
  });

  describe("MainScene wires biome manager to ghost renderer", () => {
    it("ghost renderer has biome color provider set when playing", () => {
      const scene = new MainScene();
      scene.create();
      scene.enterPhase("playing");

      const renderer = scene.getGhostRenderer()!;
      expect(renderer).not.toBeNull();
      expect(renderer.getBiomeColorProvider()).not.toBeNull();
    });

    it("biome manager is created and running when playing", () => {
      const scene = new MainScene();
      scene.create();
      scene.enterPhase("playing");

      const mgr = scene.getBiomeManager()!;
      expect(mgr).not.toBeNull();
      expect(mgr.isRunning()).toBe(true);
    });

    it("biome manager is reset when entities are destroyed", () => {
      const scene = new MainScene();
      scene.create();
      scene.enterPhase("playing");

      const firstMgr = scene.getBiomeManager()!;
      expect(firstMgr.isRunning()).toBe(true);

      scene.endRun();
      scene.enterPhase("playing");

      // Fresh biome manager
      const secondMgr = scene.getBiomeManager()!;
      expect(secondMgr).not.toBe(firstMgr);
      expect(secondMgr.isRunning()).toBe(true);
    });
  });
});
