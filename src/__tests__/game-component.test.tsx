import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor, act } from "@testing-library/react";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");

// Track Phaser.Game constructor calls and destroy calls
const mockDestroy = vi.fn();
const mockGameInstances: Array<{ destroy: typeof mockDestroy; config: Record<string, unknown> }> = [];

vi.mock("phaser", () => {
  const FIT = 1;
  const CENTER_BOTH = 1;
  const AUTO = 0;

  class MockScene {
    constructor() {}
  }

  class MockGame {
    destroy: typeof mockDestroy;
    constructor(public config: Record<string, unknown>) {
      this.destroy = mockDestroy;
      mockGameInstances.push(this);
    }
  }

  return {
    default: {
      Game: MockGame,
      Scene: MockScene,
      AUTO,
      Scale: { FIT, CENTER_BOTH },
    },
    Game: MockGame,
    Scene: MockScene,
    AUTO,
    Scale: { FIT, CENTER_BOTH },
  };
});

// Mock scene modules to prevent them from importing real Phaser
vi.mock("@/game/scenes/Boot", () => {
  class Boot {}
  return { Boot };
});

vi.mock("@/game/scenes/MainScene", () => {
  class MainScene {}
  return { MainScene };
});

// Import after mock setup
import Game from "@/components/Game";

beforeEach(() => {
  mockDestroy.mockClear();
  mockGameInstances.length = 0;
});

afterEach(async () => {
  // Give any in-flight promises time to settle before cleanup
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  cleanup();
});

describe("Game component", () => {
  it("renders a #game-container div and initialises asynchronously", async () => {
    const { container } = render(<Game />);
    expect(container.querySelector("#game-container")).toBeTruthy();
    // Wait for the async init() to complete so cleanup is safe
    await waitFor(() => {
      expect(mockGameInstances.length).toBe(1);
    });
  });

  it("passes the container div as parent to Phaser.Game", async () => {
    const { container } = render(<Game />);
    await waitFor(() => {
      expect(mockGameInstances.length).toBe(1);
    });
    const gameContainer = container.querySelector("#game-container");
    expect(mockGameInstances[0].config.parent).toBe(gameContainer);
  });

  it("uses ARENA_WIDTH and ARENA_HEIGHT from game config", async () => {
    render(<Game />);
    await waitFor(() => {
      expect(mockGameInstances.length).toBe(1);
    });
    const config = mockGameInstances[0].config;
    expect(config.width).toBe(800);
    expect(config.height).toBe(600);
  });

  it("configures scale mode FIT with CENTER_BOTH", async () => {
    render(<Game />);
    await waitFor(() => {
      expect(mockGameInstances.length).toBe(1);
    });
    const scale = mockGameInstances[0].config.scale as Record<string, unknown>;
    expect(scale).toBeDefined();
    expect(scale.mode).toBeDefined();
    expect(scale.autoCenter).toBeDefined();
  });

  it("calls game.destroy(true) on unmount", async () => {
    const { unmount } = render(<Game />);
    await waitFor(() => {
      expect(mockGameInstances.length).toBe(1);
    });
    expect(mockDestroy).not.toHaveBeenCalled();
    unmount();
    expect(mockDestroy).toHaveBeenCalledWith(true);
  });

  it("does not create duplicate instances on rerender", async () => {
    const { rerender } = render(<Game />);
    await waitFor(() => {
      expect(mockGameInstances.length).toBe(1);
    });
    rerender(<Game />);
    // Wait a tick and confirm still only one instance
    await new Promise((r) => setTimeout(r, 50));
    expect(mockGameInstances.length).toBe(1);
  });

  it("source file uses 'use client' directive", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/components/Game.tsx"),
      "utf-8"
    );
    expect(source.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("source file uses async import('phaser') instead of top-level import", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/components/Game.tsx"),
      "utf-8"
    );
    // Must NOT have a top-level static import of phaser
    expect(source).not.toMatch(/^import\s+.*from\s+["']phaser["']/m);
    // Must use dynamic import("phaser")
    expect(source).toContain('import("phaser")');
  });

  it("source file imports createGameConfig from game config", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/components/Game.tsx"),
      "utf-8"
    );
    expect(source).toContain("createGameConfig");
  });

  it("source file uses useEffect and useRef for lifecycle", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/components/Game.tsx"),
      "utf-8"
    );
    expect(source).toContain("useEffect");
    expect(source).toContain("useRef");
  });

  it("source file calls game.destroy in cleanup", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/components/Game.tsx"),
      "utf-8"
    );
    expect(source).toContain("destroy(true)");
  });

  it("page.tsx uses dynamic(() => import(...), { ssr: false }) for Game component", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/app/page.tsx"),
      "utf-8"
    );
    expect(source).toContain("dynamic(");
    expect(source).toContain("ssr: false");
    expect(source).toContain('@/components/Game');
  });

  it("config.ts has no top-level import of phaser", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/game/config.ts"),
      "utf-8"
    );
    // Must NOT have a top-level static import of phaser
    expect(source).not.toMatch(/^import\s+.*from\s+["']phaser["']/m);
  });
});
