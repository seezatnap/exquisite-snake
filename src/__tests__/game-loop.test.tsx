import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { createElement } from "react";
import type { GameBridge } from "@/game/bridge";

// ── Shared hoisted bridge mock ──────────────────────────────────
const { bridge } = vi.hoisted(() => {
  type GamePhase = "start" | "playing" | "gameOver";
  interface State {
    phase: GamePhase;
    score: number;
    highScore: number;
    elapsedTime: number;
  }
  type Listener = (v: unknown) => void;

  class HoistedBridge {
    private state: State = { phase: "start", score: 0, highScore: 0, elapsedTime: 0 };
    private listeners = new Map<string, Set<Listener>>();

    getState() { return this.state; }

    setPhase(p: GamePhase) { this.state.phase = p; this.emit("phaseChange", p); }
    setScore(s: number) { this.state.score = s; this.emit("scoreChange", s); }
    setHighScore(h: number) { this.state.highScore = h; this.emit("highScoreChange", h); }
    setElapsedTime(t: number) { this.state.elapsedTime = t; this.emit("elapsedTimeChange", t); }
    resetRun() {
      this.state.score = 0;
      this.state.elapsedTime = 0;
      this.emit("scoreChange", 0);
      this.emit("elapsedTimeChange", 0);
    }

    on(event: string, fn: Listener) {
      let set = this.listeners.get(event);
      if (!set) { set = new Set(); this.listeners.set(event, set); }
      set.add(fn);
    }
    off(event: string, fn: Listener) { this.listeners.get(event)?.delete(fn); }
    private emit(event: string, value: unknown) {
      this.listeners.get(event)?.forEach((fn) => fn(value));
    }
  }

  return { bridge: new HoistedBridge() as unknown as GameBridge };
});

vi.mock("@/game/bridge", () => ({
  gameBridge: bridge,
  GameBridge: Object,
}));

// Mock next/dynamic to render a stub Game component
vi.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const DynamicComponent = () =>
      createElement("div", { "data-testid": "dynamic-game", id: "game-container" });
    DynamicComponent.displayName = "DynamicGame";
    return DynamicComponent;
  },
}));

import Home from "@/app/page";
import StartScreen from "@/components/StartScreen";
import GameOver from "@/components/GameOver";

describe("Game loop integration", () => {
  beforeEach(() => {
    bridge.setPhase("start");
    bridge.setScore(0);
    bridge.setHighScore(0);
    bridge.setElapsedTime(0);
  });

  afterEach(() => {
    cleanup();
  });

  // ── Full loop: start → playing → gameOver → replay ──────────

  it("completes a full game loop: start → playing → gameOver → playing", () => {
    render(<Home />);

    // Phase 1: Start screen visible
    expect(bridge.getState().phase).toBe("start");

    // Press a key to start the game
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });
    expect(bridge.getState().phase).toBe("playing");

    // Simulate game over
    act(() => bridge.setPhase("gameOver"));
    expect(bridge.getState().phase).toBe("gameOver");

    // Press Enter to play again
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });
    expect(bridge.getState().phase).toBe("playing");
  });

  it("completes loop: start → playing → gameOver → start (via Escape)", () => {
    render(<Home />);

    // Start → playing
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });
    expect(bridge.getState().phase).toBe("playing");

    // playing → gameOver
    act(() => bridge.setPhase("gameOver"));
    expect(bridge.getState().phase).toBe("gameOver");

    // gameOver → start (via Escape)
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(bridge.getState().phase).toBe("start");

    // start → playing again
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    });
    expect(bridge.getState().phase).toBe("playing");
  });

  // ── Overlay visibility by phase ─────────────────────────────

  it("shows StartScreen content during 'start' phase", () => {
    const { container } = render(<Home />);
    const startScreen = container.querySelector("#start-screen")!;
    expect(startScreen.textContent).toContain("EXQUISITE");
    expect(startScreen.textContent).toContain("SNAKE");
  });

  it("hides StartScreen and GameOver during 'playing' phase", () => {
    bridge.setPhase("playing");
    const { container } = render(<Home />);
    const startScreen = container.querySelector("#start-screen")!;
    const gameOver = container.querySelector("#game-over")!;
    expect(startScreen.textContent).toBe("");
    expect(gameOver.textContent).toBe("");
  });

  it("shows GameOver content during 'gameOver' phase", () => {
    bridge.setPhase("gameOver");
    const { container } = render(<Home />);
    const gameOver = container.querySelector("#game-over")!;
    expect(gameOver.textContent).toContain("GAME OVER");
    expect(gameOver.textContent).toContain("PLAY AGAIN");
  });

  it("shows HUD only during 'playing' phase", () => {
    const { container } = render(<Home />);

    // start phase — HUD empty
    expect(container.querySelector("#hud")!.textContent).toBe("");

    // playing phase — HUD shows score
    act(() => bridge.setPhase("playing"));
    expect(container.querySelector("#hud")!.textContent).toContain("SCORE");

    // gameOver phase — HUD empty
    act(() => bridge.setPhase("gameOver"));
    expect(container.querySelector("#hud")!.textContent).toBe("");
  });
});

describe("GameOver keyboard navigation", () => {
  beforeEach(() => {
    bridge.setPhase("start");
    bridge.setScore(0);
    bridge.setHighScore(0);
    bridge.setElapsedTime(0);
  });

  afterEach(() => {
    cleanup();
  });

  it("Enter key transitions from gameOver to playing", () => {
    bridge.setPhase("gameOver");
    render(<GameOver />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });

    expect(bridge.getState().phase).toBe("playing");
  });

  it("Space key transitions from gameOver to playing", () => {
    bridge.setPhase("gameOver");
    render(<GameOver />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });

    expect(bridge.getState().phase).toBe("playing");
  });

  it("Escape key transitions from gameOver to start", () => {
    bridge.setPhase("gameOver");
    render(<GameOver />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(bridge.getState().phase).toBe("start");
  });

  it("does not attach keyboard listener when not in gameOver phase", () => {
    bridge.setPhase("playing");
    render(<GameOver />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });

    // Phase should remain playing (no gameOver keyboard handler active)
    expect(bridge.getState().phase).toBe("playing");
  });

  it("removes keyboard listener when leaving gameOver phase", () => {
    bridge.setPhase("gameOver");
    render(<GameOver />);

    // Transition to playing
    act(() => bridge.setPhase("playing"));

    // Now Enter should not trigger the gameOver handler
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(bridge.getState().phase).toBe("playing");
  });

  it("renders Return to Menu button", () => {
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);
    expect(getByTestId("return-to-start").textContent).toBe("MENU");
  });

  it("Return to Menu button transitions to start phase", () => {
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);

    act(() => {
      fireEvent.click(getByTestId("return-to-start"));
    });

    expect(bridge.getState().phase).toBe("start");
  });

  it("Return to Menu button has type='button'", () => {
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);
    expect(getByTestId("return-to-start").getAttribute("type")).toBe("button");
  });

  it("renders keyboard hint when in gameOver phase", () => {
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);
    const hint = getByTestId("keyboard-hint");
    expect(hint).toBeTruthy();
    expect(hint.getAttribute("aria-hidden")).toBe("true");
  });

  it("does not render keyboard hint when not in gameOver phase", () => {
    bridge.setPhase("playing");
    const { queryByTestId } = render(<GameOver />);
    expect(queryByTestId("keyboard-hint")).toBeNull();
  });
});

describe("Page overlay backdrops", () => {
  beforeEach(() => {
    bridge.setPhase("start");
    bridge.setScore(0);
    bridge.setHighScore(0);
    bridge.setElapsedTime(0);
  });

  afterEach(() => {
    cleanup();
  });

  it("applies overlay-backdrop class to start screen container during start phase", () => {
    const { container } = render(<Home />);
    const overlays = container.querySelectorAll(".overlay-backdrop");
    expect(overlays.length).toBeGreaterThanOrEqual(1);
  });

  it("applies overlay-backdrop class to game over container during gameOver phase", () => {
    bridge.setPhase("gameOver");
    const { container } = render(<Home />);
    const overlays = container.querySelectorAll(".overlay-backdrop");
    expect(overlays.length).toBeGreaterThanOrEqual(1);
  });

  it("applies pointer-events-none to inactive overlay containers during playing phase", () => {
    bridge.setPhase("playing");
    const { container } = render(<Home />);
    // Both start screen and game over containers should be pointer-events-none
    const startOverlay = container.querySelector(".z-20")!;
    const gameOverOverlay = container.querySelector(".z-30")!;
    expect(startOverlay.className).toContain("pointer-events-none");
    expect(gameOverOverlay.className).toContain("pointer-events-none");
  });

  it("page subscribes to bridge and updates overlay classes on phase change", () => {
    const { container } = render(<Home />);

    // Start phase: start overlay has backdrop
    expect(container.querySelector(".z-20")!.className).toContain("overlay-backdrop");
    expect(container.querySelector(".z-30")!.className).toContain("pointer-events-none");

    // Transition to playing
    act(() => bridge.setPhase("playing"));
    expect(container.querySelector(".z-20")!.className).toContain("pointer-events-none");
    expect(container.querySelector(".z-30")!.className).toContain("pointer-events-none");

    // Transition to gameOver
    act(() => bridge.setPhase("gameOver"));
    expect(container.querySelector(".z-20")!.className).toContain("pointer-events-none");
    expect(container.querySelector(".z-30")!.className).toContain("overlay-backdrop");
  });
});

describe("Focus management", () => {
  beforeEach(() => {
    bridge.setPhase("start");
    bridge.setScore(0);
    bridge.setHighScore(0);
    bridge.setElapsedTime(0);
  });

  afterEach(() => {
    cleanup();
  });

  it("Play Again button gets auto-focused when entering gameOver phase", async () => {
    vi.useFakeTimers();
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);

    const playAgainBtn = getByTestId("play-again");

    // Fast-forward the focus timeout
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(document.activeElement).toBe(playAgainBtn);
    vi.useRealTimers();
  });

  it("Play Again button is focusable with Tab key", () => {
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);
    const playAgainBtn = getByTestId("play-again");
    const menuBtn = getByTestId("return-to-start");

    // Both buttons should be in the tab order (no tabindex=-1)
    expect(playAgainBtn.getAttribute("tabindex")).not.toBe("-1");
    expect(menuBtn.getAttribute("tabindex")).not.toBe("-1");
  });

  it("StartScreen has role=dialog for accessibility", () => {
    const { container } = render(<StartScreen />);
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it("GameOver has role=dialog for accessibility", () => {
    bridge.setPhase("gameOver");
    const { container } = render(<GameOver />);
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });
});
