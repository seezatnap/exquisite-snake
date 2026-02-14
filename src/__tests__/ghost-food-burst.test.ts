import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { EchoGhost } from "../game/entities/EchoGhost";
import type { GridPos } from "../game/utils/grid";

const ROOT = path.resolve(__dirname, "../..");

// ── Helper ───────────────────────────────────────────────────────

/** Build a minimal snake snapshot from a list of [col, row] pairs. */
function snap(...positions: [number, number][]): GridPos[] {
  return positions.map(([col, row]) => ({ col, row }));
}

// ── Phaser mock ──────────────────────────────────────────────────

const mockEmitterDestroy = vi.fn();
const mockExplode = vi.fn();
const mockDelayedCall = vi.fn();
const mockTexturesExists = vi.fn().mockReturnValue(true);

function createMockEmitter() {
  return {
    explode: mockExplode,
    destroy: mockEmitterDestroy,
  };
}

const mockAddParticles = vi.fn(() => createMockEmitter());

const mockSceneStart = vi.fn();
const mockDestroy = vi.fn();
const mockSetPosition = vi.fn();

vi.mock("phaser", () => {
  class MockScene {
    scene = { start: mockSceneStart };
    add = {
      graphics: () => ({}),
      sprite: vi.fn(() => ({ destroy: mockDestroy, setPosition: mockSetPosition, x: 0, y: 0 })),
      particles: mockAddParticles,
    };
    input = { keyboard: { on: vi.fn() } };
    cameras = { main: { shake: vi.fn() } };
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

// Import after mock
import Phaser from "phaser";
import {
  emitGhostFoodParticles,
  GHOST_FOOD_PARTICLE_COUNT,
  GHOST_FOOD_PARTICLE_LIFESPAN,
  GHOST_FOOD_PARTICLE_ALPHA,
} from "@/game/systems/effects";

beforeEach(() => {
  vi.clearAllMocks();
  mockTexturesExists.mockReturnValue(true);
});

// ── EchoGhost ghost-food burst scheduling ────────────────────────

describe("EchoGhost ghost-food burst scheduling", () => {
  it("scheduleFoodBurst registers a pending burst at currentTick + delayTicks", () => {
    const g = new EchoGhost(100, 500, 20);
    // delayTicks = 5

    // Record 3 ticks
    for (let i = 0; i < 3; i++) {
      g.recordTick(snap([i, 0]));
    }

    g.scheduleFoodBurst();
    expect(g.getPendingBurstCount()).toBe(1);
  });

  it("burst fires at exactly delayTicks after scheduling", () => {
    // delayTicks = 5, capacity = 20
    const g = new EchoGhost(100, 500, 20);

    // Record 5 ticks to activate the ghost
    for (let i = 0; i < 5; i++) {
      g.recordTick(snap([i, 0]));
    }
    expect(g.getLifecycleState()).toBe("active");

    // Schedule a burst at tick 5 (current) → fires at tick 10
    g.scheduleFoodBurst();
    expect(g.getPendingBurstCount()).toBe(1);

    // Record ticks 6–9, bursts should not fire yet
    for (let i = 5; i < 9; i++) {
      g.recordTick(snap([i, 0]));
      const bursts = g.consumePendingBursts();
      expect(bursts.length).toBe(0);
    }

    // Tick 10: burst fires
    g.recordTick(snap([9, 0]));
    const bursts = g.consumePendingBursts();
    expect(bursts.length).toBe(1);
    expect(g.getPendingBurstCount()).toBe(0);
  });

  it("burst position corresponds to the ghost head at the fire tick", () => {
    // delayTicks = 5, capacity = 20
    const g = new EchoGhost(100, 500, 20);

    // Record ticks: ticksWritten goes 1..5 after these 5 calls
    for (let i = 0; i < 5; i++) {
      g.recordTick(snap([i, 0]));
    }

    // Schedule burst at ticksWritten=5 → fireTick = 5 + 5 = 10
    g.scheduleFoodBurst();

    // Record 4 more ticks (ticksWritten goes 6,7,8,9) — burst shouldn't fire yet
    for (let i = 5; i < 9; i++) {
      g.recordTick(snap([i, 0]));
      const b = g.consumePendingBursts();
      expect(b.length).toBe(0);
    }

    // Tick that makes ticksWritten=10 → burst fires
    g.recordTick(snap([9, 0]));
    const bursts = g.consumePendingBursts();

    expect(bursts.length).toBe(1);
    // Ghost head at ticksWritten=10: readable = 10-5=5, head = read(5, 4) = entry[4] = (4, 0)
    expect(bursts[0]).toEqual({ col: 4, row: 0 });
  });

  it("multiple bursts can be scheduled and fire at different ticks", () => {
    const g = new EchoGhost(100, 500, 20);

    // Record ticks: ticksWritten = 1..5
    for (let i = 0; i < 5; i++) {
      g.recordTick(snap([i, 0]));
    }

    // Schedule burst at ticksWritten=5 → fires at tick 10
    g.scheduleFoodBurst();

    // Record 2 more ticks: ticksWritten = 6, 7
    g.recordTick(snap([5, 0]));
    g.consumePendingBursts();
    g.recordTick(snap([6, 0]));
    g.consumePendingBursts();

    // Schedule burst at ticksWritten=7 → fires at tick 12
    g.scheduleFoodBurst();
    expect(g.getPendingBurstCount()).toBe(2);

    // Advance: ticksWritten = 8, 9 (no bursts yet)
    for (let i = 7; i < 9; i++) {
      g.recordTick(snap([i, 0]));
      g.consumePendingBursts();
    }

    // ticksWritten = 10 → first burst fires
    g.recordTick(snap([9, 0]));
    let bursts = g.consumePendingBursts();
    expect(bursts.length).toBe(1);
    expect(g.getPendingBurstCount()).toBe(1);

    // ticksWritten = 11 (no burst)
    g.recordTick(snap([10, 0]));
    g.consumePendingBursts();

    // ticksWritten = 12 → second burst fires
    g.recordTick(snap([11, 0]));
    bursts = g.consumePendingBursts();
    expect(bursts.length).toBe(1);
    expect(g.getPendingBurstCount()).toBe(0);
  });

  it("consumePendingBursts returns empty array when no bursts are ready", () => {
    const g = new EchoGhost(100, 500, 20);
    for (let i = 0; i < 5; i++) {
      g.recordTick(snap([i, 0]));
    }

    const bursts = g.consumePendingBursts();
    expect(bursts.length).toBe(0);
  });

  it("consumePendingBursts clears the ready list (one-time consumption)", () => {
    const g = new EchoGhost(100, 500, 20);

    // ticksWritten = 1..5
    for (let i = 0; i < 5; i++) {
      g.recordTick(snap([i, 0]));
    }

    // fireTick = 5 + 5 = 10
    g.scheduleFoodBurst();

    // Advance to just before fire tick: ticksWritten = 6..9
    for (let i = 5; i < 9; i++) {
      g.recordTick(snap([i, 0]));
      g.consumePendingBursts();
    }

    // ticksWritten = 10 → burst fires
    g.recordTick(snap([9, 0]));
    const bursts1 = g.consumePendingBursts();
    expect(bursts1.length).toBe(1);

    // Second consume returns empty
    const bursts2 = g.consumePendingBursts();
    expect(bursts2.length).toBe(0);
  });

  it("reset clears all pending bursts", () => {
    const g = new EchoGhost(100, 500, 20);
    // ticksWritten = 1..5
    for (let i = 0; i < 5; i++) {
      g.recordTick(snap([i, 0]));
    }
    g.scheduleFoodBurst(); // fireTick = 10

    // Record one more tick so next schedule has different fireTick
    g.recordTick(snap([5, 0])); // ticksWritten = 6
    g.consumePendingBursts();
    g.scheduleFoodBurst(); // fireTick = 11
    expect(g.getPendingBurstCount()).toBe(2);

    g.reset();
    expect(g.getPendingBurstCount()).toBe(0);
  });

  it("burst fires once ghost is active even if scheduled while inactive", () => {
    const g = new EchoGhost(100, 500, 20);
    // delayTicks = 5

    // Record only 1 tick (not enough to activate): ticksWritten = 1
    g.recordTick(snap([0, 0]));
    g.scheduleFoodBurst(); // fireTick = 1 + 5 = 6

    // Record ticks: ticksWritten = 2,3,4,5 (ghost becomes active at 5)
    for (let i = 1; i < 5; i++) {
      g.recordTick(snap([i, 0]));
      const b = g.consumePendingBursts();
      expect(b.length).toBe(0);
    }

    // ticksWritten = 6 → burst fires (ghost is now active, has a head)
    g.recordTick(snap([5, 0]));
    const bursts = g.consumePendingBursts();
    expect(bursts.length).toBe(1);
    // Ghost head at ticksWritten=6: readable = 6-5 = 1, head = read(5, 0) = entry[0] = (0,0)
    expect(bursts[0]).toEqual({ col: 0, row: 0 });
  });

  it("5-second delay accuracy: burst fires after exactly 5 seconds of ticks", () => {
    // Using default tick rate of 125ms: 5000/125 = 40 ticks
    const g = new EchoGhost();
    const delayTicks = g.getDelayTicks(); // 40

    // Activate ghost first
    for (let i = 0; i < delayTicks; i++) {
      g.recordTick(snap([i, 0]));
    }

    // Schedule burst at tick 40 → fires at tick 80
    g.scheduleFoodBurst();

    // Record ticks 41–79, no burst should fire
    for (let i = delayTicks; i < delayTicks * 2 - 1; i++) {
      g.recordTick(snap([i % 20, i % 30]));
      const bursts = g.consumePendingBursts();
      expect(bursts.length).toBe(0);
    }

    // Tick 80: burst fires
    g.recordTick(snap([19, 29]));
    const bursts = g.consumePendingBursts();
    expect(bursts.length).toBe(1);
  });

  it("no score or state impact — burst is purely positional data", () => {
    const g = new EchoGhost(100, 500, 20);
    for (let i = 0; i < 5; i++) {
      g.recordTick(snap([i, 0]));
    }

    const ticksBefore = g.getTotalTicksWritten();
    const stateBefore = g.getLifecycleState();
    const trailBefore = g.getGhostTrail();

    g.scheduleFoodBurst();

    // Scheduling does not modify any game state
    expect(g.getTotalTicksWritten()).toBe(ticksBefore);
    expect(g.getLifecycleState()).toBe(stateBefore);
    expect(g.getGhostTrail()).toEqual(trailBefore);
  });
});

// ── emitGhostFoodParticles effect tests ──────────────────────────

describe("emitGhostFoodParticles", () => {
  it("creates a particle emitter at the given position", () => {
    const scene = new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
    emitGhostFoodParticles(scene, 200, 300);

    expect(mockAddParticles).toHaveBeenCalledWith(
      200,
      300,
      "particle",
      expect.objectContaining({
        lifespan: GHOST_FOOD_PARTICLE_LIFESPAN,
        quantity: GHOST_FOOD_PARTICLE_COUNT,
        emitting: false,
      }),
    );
  });

  it("uses reduced alpha to match ghost aesthetics", () => {
    const scene = new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
    emitGhostFoodParticles(scene, 0, 0);

    expect(mockAddParticles).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        alpha: { start: GHOST_FOOD_PARTICLE_ALPHA, end: 0 },
      }),
    );
  });

  it("calls explode with ghost food particle count", () => {
    const scene = new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
    emitGhostFoodParticles(scene, 50, 75);

    expect(mockExplode).toHaveBeenCalledWith(GHOST_FOOD_PARTICLE_COUNT, 0, 0);
  });

  it("schedules emitter destruction after particles expire", () => {
    const scene = new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
    emitGhostFoodParticles(scene, 0, 0);

    expect(mockDelayedCall).toHaveBeenCalledWith(
      GHOST_FOOD_PARTICLE_LIFESPAN + 50,
      expect.any(Function),
    );

    const destroyCallback = mockDelayedCall.mock.calls[0][1];
    destroyCallback();
    expect(mockEmitterDestroy).toHaveBeenCalled();
  });

  it("returns the emitter instance", () => {
    const scene = new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
    const emitter = emitGhostFoodParticles(scene, 0, 0);

    expect(emitter).not.toBeNull();
    expect(emitter!.explode).toBeDefined();
  });

  it("returns null when particle texture is missing", () => {
    mockTexturesExists.mockReturnValue(false);
    const scene = new Phaser.Scene({ key: "Test" }) as unknown as Phaser.Scene;
    const emitter = emitGhostFoodParticles(scene, 0, 0);

    expect(emitter).toBeNull();
    expect(mockAddParticles).not.toHaveBeenCalled();
  });
});

// ── Ghost food particle constant tuning ──────────────────────────

describe("ghost food burst constants are tuned", () => {
  it("ghost food particle count is fewer than regular (subdued effect)", () => {
    expect(GHOST_FOOD_PARTICLE_COUNT).toBeLessThanOrEqual(12);
    expect(GHOST_FOOD_PARTICLE_COUNT).toBeGreaterThanOrEqual(4);
  });

  it("ghost food particle lifespan is reasonable", () => {
    expect(GHOST_FOOD_PARTICLE_LIFESPAN).toBeGreaterThanOrEqual(200);
    expect(GHOST_FOOD_PARTICLE_LIFESPAN).toBeLessThanOrEqual(600);
  });

  it("ghost food particle alpha is translucent (< 1)", () => {
    expect(GHOST_FOOD_PARTICLE_ALPHA).toBeGreaterThan(0);
    expect(GHOST_FOOD_PARTICLE_ALPHA).toBeLessThan(1);
  });
});

// ── MainScene integration checks ─────────────────────────────────

describe("MainScene integrates ghost-food burst", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/game/scenes/MainScene.ts"),
    "utf-8",
  );

  it("imports emitGhostFoodParticles from effects module", () => {
    expect(source).toContain("emitGhostFoodParticles");
    expect(source).toContain("systems/effects");
  });

  it("imports gridToPixel for position conversion", () => {
    expect(source).toContain("gridToPixel");
  });

  it("calls scheduleFoodBurst when food is eaten", () => {
    expect(source).toContain("scheduleFoodBurst");
  });

  it("calls consumePendingBursts to check for ready bursts", () => {
    expect(source).toContain("consumePendingBursts");
  });

  it("calls emitGhostFoodParticles for pending bursts", () => {
    expect(source).toContain("emitGhostFoodParticles(this,");
  });

  it("scheduleFoodBurst is called only after food is eaten", () => {
    const eatIndex = source.indexOf("if (eaten)");
    const scheduleIndex = source.indexOf("scheduleFoodBurst");
    expect(eatIndex).toBeGreaterThan(-1);
    expect(scheduleIndex).toBeGreaterThan(eatIndex);
  });

  it("ghost-food bursts are consumed after recordTick (so ghost head is current)", () => {
    const recordIndex = source.indexOf("recordTick");
    const consumeIndex = source.indexOf("consumePendingBursts");
    expect(recordIndex).toBeGreaterThan(-1);
    expect(consumeIndex).toBeGreaterThan(recordIndex);
  });
});

// ── effects.ts source file checks ────────────────────────────────

describe("effects.ts exports ghost-food burst function", () => {
  const source = fs.readFileSync(
    path.join(ROOT, "src/game/systems/effects.ts"),
    "utf-8",
  );

  it("exports emitGhostFoodParticles function", () => {
    expect(source).toMatch(/export\s+function\s+emitGhostFoodParticles/);
  });

  it("guards against missing texture in emitGhostFoodParticles", () => {
    // Count texture guard occurrences — should have at least 2 (one for each effect fn)
    const matches = source.match(/textures\.exists/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it("schedules cleanup of ghost food particle emitter", () => {
    // The function should have its own delayedCall for cleanup
    const matches = source.match(/delayedCall/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});
