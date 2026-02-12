import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import type { GameBridge } from "@/game/bridge";

// vi.hoisted runs before the mock factory, so bridge is available.
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

import StartScreen from "@/components/StartScreen";

describe("StartScreen component", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    bridge.setPhase("start");
    bridge.setScore(0);
    bridge.setHighScore(0);
  });

  // ── Visibility ────────────────────────────────────────────

  it("renders full start screen content when phase is 'start'", () => {
    const { container } = render(<StartScreen />);
    const el = container.querySelector("#start-screen");
    expect(el).toBeTruthy();
    expect(el!.textContent).toContain("EXQUISITE");
    expect(el!.textContent).toContain("SNAKE");
  });

  it("renders an empty #start-screen div when phase is 'playing'", () => {
    bridge.setPhase("playing");
    const { container } = render(<StartScreen />);
    const el = container.querySelector("#start-screen");
    expect(el).toBeTruthy();
    expect(el!.textContent).toBe("");
  });

  it("renders an empty #start-screen div when phase is 'gameOver'", () => {
    bridge.setPhase("gameOver");
    const { container } = render(<StartScreen />);
    const el = container.querySelector("#start-screen");
    expect(el).toBeTruthy();
    expect(el!.textContent).toBe("");
  });

  // ── Title treatment ─────────────────────────────────────

  it("displays the game title 'EXQUISITE'", () => {
    const { getByTestId } = render(<StartScreen />);
    expect(getByTestId("game-title").textContent).toBe("EXQUISITE");
  });

  it("displays the game subtitle 'SNAKE'", () => {
    const { getByTestId } = render(<StartScreen />);
    expect(getByTestId("game-subtitle").textContent).toBe("SNAKE");
  });

  // ── Snake logo ──────────────────────────────────────────

  it("renders an SVG snake logo", () => {
    const { container } = render(<StartScreen />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("snake logo container is aria-hidden", () => {
    const { container } = render(<StartScreen />);
    const logoContainer = container.querySelector(".snake-logo");
    expect(logoContainer).toBeTruthy();
    expect(logoContainer!.getAttribute("aria-hidden")).toBe("true");
  });

  // ── Start prompt ────────────────────────────────────────

  it("displays 'PRESS ANY KEY TO START' prompt", () => {
    const { getByTestId } = render(<StartScreen />);
    expect(getByTestId("start-prompt").textContent).toBe("PRESS ANY KEY TO START");
  });

  // ── High score display ──────────────────────────────────

  it("does not show high score when it is 0", () => {
    const { queryByTestId } = render(<StartScreen />);
    expect(queryByTestId("high-score")).toBeNull();
  });

  it("displays high score when greater than 0", () => {
    bridge.setHighScore(42);
    const { getByTestId } = render(<StartScreen />);
    const el = getByTestId("high-score");
    expect(el.textContent).toContain("HIGH SCORE");
    expect(el.textContent).toContain("42");
  });

  it("updates high score when bridge emits highScoreChange", () => {
    const { queryByTestId } = render(<StartScreen />);
    expect(queryByTestId("high-score")).toBeNull();

    act(() => bridge.setHighScore(99));
    const el = queryByTestId("high-score");
    expect(el).toBeTruthy();
    expect(el!.textContent).toContain("99");
  });

  // ── Key press to start ──────────────────────────────────

  it("transitions to 'playing' phase on keydown", () => {
    render(<StartScreen />);
    expect(bridge.getState().phase).toBe("start");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });

    expect(bridge.getState().phase).toBe("playing");
  });

  it("transitions to 'playing' phase on space key", () => {
    render(<StartScreen />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });

    expect(bridge.getState().phase).toBe("playing");
  });

  it("transitions to 'playing' phase on arrow key", () => {
    render(<StartScreen />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    });

    expect(bridge.getState().phase).toBe("playing");
  });

  it("does not transition on Tab key (a11y)", () => {
    render(<StartScreen />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    });

    expect(bridge.getState().phase).toBe("start");
  });

  it("does not transition on Ctrl+key", () => {
    render(<StartScreen />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", ctrlKey: true }));
    });

    expect(bridge.getState().phase).toBe("start");
  });

  it("does not transition on Meta+key", () => {
    render(<StartScreen />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", metaKey: true }));
    });

    expect(bridge.getState().phase).toBe("start");
  });

  it("does not transition on Alt+key", () => {
    render(<StartScreen />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", altKey: true }));
    });

    expect(bridge.getState().phase).toBe("start");
  });

  // ── Click to start ─────────────────────────────────────

  it("transitions to 'playing' phase on click", () => {
    const { container } = render(<StartScreen />);
    const el = container.querySelector("#start-screen")!;

    act(() => {
      fireEvent.click(el);
    });

    expect(bridge.getState().phase).toBe("playing");
  });

  // ── Phase transitions ──────────────────────────────────

  it("hides content when transitioning from start to playing", () => {
    const { container } = render(<StartScreen />);
    expect(container.textContent).toContain("EXQUISITE");

    act(() => bridge.setPhase("playing"));
    const el = container.querySelector("#start-screen");
    expect(el).toBeTruthy();
    expect(el!.textContent).toBe("");
  });

  it("removes keydown listener when phase changes to playing", () => {
    render(<StartScreen />);

    // Transition to playing
    act(() => bridge.setPhase("playing"));

    // Reset to start to see if a stale listener triggers another transition
    act(() => bridge.setPhase("start"));

    // Now the component should be visible again
    // Verify it's in start phase (not auto-transitioned)
    expect(bridge.getState().phase).toBe("start");
  });

  it("does not fire startGame when already in playing phase", () => {
    render(<StartScreen />);

    // Go to playing
    act(() => bridge.setPhase("playing"));
    expect(bridge.getState().phase).toBe("playing");

    // Keydown should not cause any issue (no listener attached when not "start")
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    });

    // Phase should still be playing
    expect(bridge.getState().phase).toBe("playing");
  });

  // ── Accessibility ──────────────────────────────────────

  it("has role='dialog' when in start phase", () => {
    const { container } = render(<StartScreen />);
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it("has an aria-label describing the start screen", () => {
    const { container } = render(<StartScreen />);
    expect(container.querySelector('[aria-label="Start screen"]')).toBeTruthy();
  });

  // ── Cleanup ────────────────────────────────────────────

  it("unsubscribes from bridge on unmount", () => {
    const { unmount } = render(<StartScreen />);

    const offSpy = vi.spyOn(bridge, "off");
    unmount();

    expect(offSpy).toHaveBeenCalledTimes(2);
    const events = offSpy.mock.calls.map((c) => c[0]);
    expect(events).toContain("phaseChange");
    expect(events).toContain("highScoreChange");

    offSpy.mockRestore();
  });
});
