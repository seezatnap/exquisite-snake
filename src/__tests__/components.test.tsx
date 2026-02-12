import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// Mock Phaser before importing Game, since Game now imports Phaser
vi.mock("phaser", () => {
  class MockGame {
    constructor() {}
    destroy() {}
  }
  return {
    default: {
      Game: MockGame,
      AUTO: 0,
      Scale: { FIT: 1, CENTER_BOTH: 1 },
    },
    Game: MockGame,
    AUTO: 0,
    Scale: { FIT: 1, CENTER_BOTH: 1 },
  };
});

import Game from "@/components/Game";
import HUD from "@/components/HUD";
import StartScreen from "@/components/StartScreen";
import GameOver from "@/components/GameOver";

describe("Component scaffolds", () => {
  it("Game component renders without crashing", () => {
    const { container } = render(<Game />);
    expect(container.querySelector("#game-container")).toBeTruthy();
  });

  it("HUD component renders without crashing", () => {
    const { container } = render(<HUD />);
    expect(container.querySelector("#hud")).toBeTruthy();
  });

  it("StartScreen component renders without crashing", () => {
    const { container } = render(<StartScreen />);
    expect(container.querySelector("#start-screen")).toBeTruthy();
  });

  it("GameOver component renders without crashing", () => {
    const { container } = render(<GameOver />);
    expect(container.querySelector("#game-over")).toBeTruthy();
  });
});
