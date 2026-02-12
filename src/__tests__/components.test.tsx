import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
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
