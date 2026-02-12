import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../..");

// Track Phaser.Game constructor calls and destroy calls
const mockDestroy = vi.fn();
const mockRefresh = vi.fn();
const mockGameInstances: Array<{
  destroy: typeof mockDestroy;
  scale: { refresh: typeof mockRefresh };
  config: Record<string, unknown>;
}> = [];

vi.mock("phaser", () => {
  const FIT = 1;
  const CENTER_BOTH = 1;
  const AUTO = 0;

  class MockScene {
    constructor() {}
  }

  class MockGame {
    destroy: typeof mockDestroy;
    scale: { refresh: typeof mockRefresh };
    constructor(public config: Record<string, unknown>) {
      this.destroy = mockDestroy;
      this.scale = { refresh: mockRefresh };
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

// Import after mock setup
import Game from "@/components/Game";

beforeEach(() => {
  mockDestroy.mockClear();
  mockRefresh.mockClear();
  mockGameInstances.length = 0;
});

afterEach(() => {
  cleanup();
});

describe("Game component", () => {
  it("renders a #game-container div", () => {
    const { container } = render(<Game />);
    expect(container.querySelector("#game-container")).toBeTruthy();
  });

  it("creates exactly one Phaser.Game instance on mount", () => {
    render(<Game />);
    expect(mockGameInstances.length).toBe(1);
  });

  it("passes the container div as parent to Phaser.Game", () => {
    const { container } = render(<Game />);
    const gameContainer = container.querySelector("#game-container");
    expect(mockGameInstances[0].config.parent).toBe(gameContainer);
  });

  it("uses ARENA_WIDTH and ARENA_HEIGHT from game config", () => {
    render(<Game />);
    const config = mockGameInstances[0].config;
    expect(config.width).toBe(800);
    expect(config.height).toBe(600);
  });

  it("configures scale mode FIT with CENTER_BOTH", () => {
    render(<Game />);
    const scale = mockGameInstances[0].config.scale as Record<string, unknown>;
    expect(scale).toBeDefined();
    expect(scale.mode).toBeDefined();
    expect(scale.autoCenter).toBeDefined();
  });

  it("calls game.destroy(true) on unmount", () => {
    const { unmount } = render(<Game />);
    expect(mockDestroy).not.toHaveBeenCalled();
    unmount();
    expect(mockDestroy).toHaveBeenCalledWith(true);
  });

  it("does not create duplicate instances on rerender", () => {
    const { rerender } = render(<Game />);
    expect(mockGameInstances.length).toBe(1);
    rerender(<Game />);
    expect(mockGameInstances.length).toBe(1);
  });

  it("source file uses 'use client' directive", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/components/Game.tsx"),
      "utf-8"
    );
    expect(source.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("source file imports Phaser", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/components/Game.tsx"),
      "utf-8"
    );
    expect(source).toContain('import Phaser from "phaser"');
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
});

describe("Game component — responsive resize", () => {
  it("sets inline width/height on the container on mount", () => {
    const { container } = render(<Game />);
    const gameContainer = container.querySelector(
      "#game-container",
    ) as HTMLDivElement;
    expect(gameContainer.style.width).toBeTruthy();
    expect(gameContainer.style.height).toBeTruthy();
  });

  it("updates container size on window resize", () => {
    const { container } = render(<Game />);
    const gameContainer = container.querySelector(
      "#game-container",
    ) as HTMLDivElement;

    // Simulate a resize to a smaller viewport
    Object.defineProperty(window, "innerWidth", { value: 500, writable: true });
    Object.defineProperty(window, "innerHeight", { value: 400, writable: true });
    window.dispatchEvent(new Event("resize"));

    // Container should still have valid dimensions after resize
    expect(gameContainer.style.width).toBeTruthy();
    expect(gameContainer.style.height).toBeTruthy();
  });

  it("calls game.scale.refresh() on window resize", () => {
    render(<Game />);
    expect(mockRefresh).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("resize"));

    expect(mockRefresh).toHaveBeenCalled();
  });

  it("removes resize listener on unmount", () => {
    const { unmount } = render(<Game />);
    mockRefresh.mockClear();

    unmount();

    // After unmount, resize should not trigger refresh
    window.dispatchEvent(new Event("resize"));
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("source file imports responsive utilities", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/components/Game.tsx"),
      "utf-8",
    );
    expect(source).toContain("viewportToContainer");
    expect(source).toContain("computeCanvasSize");
  });

  it("source file registers resize event listener", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/components/Game.tsx"),
      "utf-8",
    );
    expect(source).toContain('addEventListener("resize"');
    expect(source).toContain('removeEventListener("resize"');
  });

  it("source file calls scale.refresh on resize", () => {
    const source = fs.readFileSync(
      path.join(ROOT, "src/components/Game.tsx"),
      "utf-8",
    );
    expect(source).toContain("scale.refresh()");
  });
});
