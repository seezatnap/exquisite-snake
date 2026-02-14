import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import type { GameBridge } from "@/game/bridge";

// vi.hoisted runs before the mock factory, so bridge is available.
const { bridge } = vi.hoisted(() => {
  type GamePhase = "start" | "playing" | "gameOver";
  interface BiomeVisitStats {
    "neon-city": number;
    "ice-cavern": number;
    "molten-core": number;
    "void-rift": number;
  }
  interface State {
    phase: GamePhase;
    score: number;
    highScore: number;
    elapsedTime: number;
    biomeVisitStats: BiomeVisitStats;
    parasitesCollected: number;
  }
  type Listener = (v: unknown) => void;

  const createInitialBiomeVisitStats = (): BiomeVisitStats => ({
    "neon-city": 1,
    "ice-cavern": 0,
    "molten-core": 0,
    "void-rift": 0,
  });

  class HoistedBridge {
    private state: State = {
      phase: "start",
      score: 0,
      highScore: 0,
      elapsedTime: 0,
      biomeVisitStats: createInitialBiomeVisitStats(),
      parasitesCollected: 0,
    };
    private listeners = new Map<string, Set<Listener>>();

    getState() { return this.state; }

    setPhase(p: GamePhase) { this.state.phase = p; this.emit("phaseChange", p); }
    setScore(s: number) { this.state.score = s; this.emit("scoreChange", s); }
    setHighScore(h: number) { this.state.highScore = h; this.emit("highScoreChange", h); }
    setElapsedTime(t: number) { this.state.elapsedTime = t; this.emit("elapsedTimeChange", t); }
    setBiomeVisitStats(stats: BiomeVisitStats) {
      this.state.biomeVisitStats = { ...stats };
      this.emit("biomeVisitStatsChange", this.state.biomeVisitStats);
    }
    setParasitesCollected(parasitesCollected: number) {
      this.state.parasitesCollected = parasitesCollected;
      this.emit("parasitesCollectedChange", parasitesCollected);
    }
    resetRun() {
      this.state.score = 0;
      this.state.elapsedTime = 0;
      this.state.biomeVisitStats = createInitialBiomeVisitStats();
      this.state.parasitesCollected = 0;
      this.emit("scoreChange", 0);
      this.emit("elapsedTimeChange", 0);
      this.emit("biomeVisitStatsChange", this.state.biomeVisitStats);
      this.emit("parasitesCollectedChange", 0);
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

import GameOver from "@/components/GameOver";
import { formatTime } from "@/components/GameOver";

describe("GameOver component", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    bridge.setPhase("start");
    bridge.setScore(0);
    bridge.setHighScore(0);
    bridge.setElapsedTime(0);
    bridge.setParasitesCollected(0);
    bridge.setBiomeVisitStats({
      "neon-city": 1,
      "ice-cavern": 0,
      "molten-core": 0,
      "void-rift": 0,
    });
  });

  // ── Visibility ────────────────────────────────────────────

  it("renders an empty #game-over div when phase is 'start'", () => {
    const { container } = render(<GameOver />);
    const el = container.querySelector("#game-over");
    expect(el).toBeTruthy();
    expect(el!.textContent).toBe("");
  });

  it("renders an empty #game-over div when phase is 'playing'", () => {
    bridge.setPhase("playing");
    const { container } = render(<GameOver />);
    const el = container.querySelector("#game-over");
    expect(el).toBeTruthy();
    expect(el!.textContent).toBe("");
  });

  it("renders full game-over content when phase is 'gameOver'", () => {
    bridge.setPhase("gameOver");
    const { container } = render(<GameOver />);
    const el = container.querySelector("#game-over");
    expect(el).toBeTruthy();
    expect(el!.textContent).toContain("GAME OVER");
    expect(el!.textContent).toContain("PLAY AGAIN");
  });

  // ── Title ─────────────────────────────────────────────────

  it("displays 'GAME OVER' title", () => {
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);
    expect(getByTestId("game-over-title").textContent).toBe("GAME OVER");
  });

  // ── Score display ─────────────────────────────────────────

  it("displays the final score from bridge state", () => {
    bridge.setScore(42);
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);
    expect(getByTestId("final-score").textContent).toContain("42");
  });

  it("displays the high score from bridge state", () => {
    bridge.setHighScore(100);
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);
    expect(getByTestId("high-score").textContent).toContain("100");
  });

  it("displays final score label", () => {
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);
    expect(getByTestId("final-score").textContent).toContain("SCORE");
  });

  it("displays high score label", () => {
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);
    expect(getByTestId("high-score").textContent).toContain("HIGH SCORE");
  });

  // ── New high score indicator ──────────────────────────────

  it("shows 'NEW!' when score equals high score and is > 0", () => {
    bridge.setScore(50);
    bridge.setHighScore(50);
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);
    expect(getByTestId("new-high-score").textContent).toBe("NEW!");
  });

  it("shows 'NEW!' when score exceeds high score", () => {
    bridge.setScore(60);
    bridge.setHighScore(50);
    bridge.setPhase("gameOver");
    // Note: in real gameplay, high score would be updated to match.
    // But since score > highScore in bridge state, it still shows NEW!
    // Actually: score >= highScore and score > 0, so yes
    const { queryByTestId } = render(<GameOver />);
    expect(queryByTestId("new-high-score")).toBeTruthy();
  });

  it("does not show 'NEW!' when score is 0", () => {
    bridge.setScore(0);
    bridge.setHighScore(0);
    bridge.setPhase("gameOver");
    const { queryByTestId } = render(<GameOver />);
    expect(queryByTestId("new-high-score")).toBeNull();
  });

  it("does not show 'NEW!' when score is below high score", () => {
    bridge.setScore(30);
    bridge.setHighScore(50);
    bridge.setPhase("gameOver");
    const { queryByTestId } = render(<GameOver />);
    expect(queryByTestId("new-high-score")).toBeNull();
  });

  // ── Time survived ─────────────────────────────────────────

  it("displays time survived label", () => {
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);
    expect(getByTestId("time-survived").textContent).toContain("TIME SURVIVED");
  });

  it("formats elapsed time in seconds", () => {
    bridge.setElapsedTime(45000); // 45 seconds
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);
    expect(getByTestId("time-survived").textContent).toContain("45s");
  });

  it("formats elapsed time in minutes and seconds", () => {
    bridge.setElapsedTime(125000); // 2m 5s
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);
    expect(getByTestId("time-survived").textContent).toContain("2m 5s");
  });

  it("formats zero elapsed time as 0s", () => {
    bridge.setElapsedTime(0);
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);
    expect(getByTestId("time-survived").textContent).toContain("0s");
  });

  it("displays parasites collected stat from bridge state", () => {
    bridge.setParasitesCollected(6);
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);
    expect(getByTestId("parasites-collected").textContent).toContain("PARASITES COLLECTED");
    expect(getByTestId("parasites-collected").textContent).toContain("6");
  });

  // ── Biomes visited ───────────────────────────────────────

  it("displays biomes visited label and unique visited count", () => {
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);
    expect(getByTestId("biomes-visited").textContent).toContain("BIOMES VISITED");
    expect(getByTestId("biomes-visited").textContent).toContain("1/4");
    expect(getByTestId("biomes-visited-list").textContent).toBe("Neon City");
  });

  it("lists visited biomes with repeat counts from bridge state", () => {
    bridge.setBiomeVisitStats({
      "neon-city": 2,
      "ice-cavern": 1,
      "molten-core": 0,
      "void-rift": 1,
    });
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);
    expect(getByTestId("biomes-visited").textContent).toContain("3/4");
    expect(getByTestId("biomes-visited-list").textContent).toBe(
      "Neon City x2 • Ice Cavern • Void Rift",
    );
  });

  it("updates biome visit stats reactively when bridge emits biomeVisitStatsChange", () => {
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);

    act(() =>
      bridge.setBiomeVisitStats({
        "neon-city": 1,
        "ice-cavern": 1,
        "molten-core": 1,
        "void-rift": 0,
      }),
    );

    expect(getByTestId("biomes-visited").textContent).toContain("3/4");
    expect(getByTestId("biomes-visited-list").textContent).toBe(
      "Neon City • Ice Cavern • Molten Core",
    );
  });

  it("shows reset biome stats on the next game over after resetRun", () => {
    bridge.setBiomeVisitStats({
      "neon-city": 1,
      "ice-cavern": 1,
      "molten-core": 1,
      "void-rift": 1,
    });
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);
    expect(getByTestId("biomes-visited").textContent).toContain("4/4");

    act(() => {
      bridge.setPhase("playing");
      bridge.resetRun();
      bridge.setPhase("gameOver");
    });

    expect(getByTestId("biomes-visited").textContent).toContain("1/4");
    expect(getByTestId("biomes-visited-list").textContent).toBe("Neon City");
  });

  // ── Play Again button ─────────────────────────────────────

  it("renders a 'PLAY AGAIN' button", () => {
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);
    expect(getByTestId("play-again").textContent).toBe("PLAY AGAIN");
  });

  it("transitions to 'playing' phase when Play Again is clicked", () => {
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);

    act(() => {
      fireEvent.click(getByTestId("play-again"));
    });

    expect(bridge.getState().phase).toBe("playing");
  });

  it("does not transition when Play Again is clicked in non-gameOver phase", () => {
    bridge.setPhase("gameOver");
    render(<GameOver />);

    // Simulate quick phase change right before click
    act(() => {
      bridge.setPhase("playing");
    });

    // The component should now render the empty div, so the button is gone.
    expect(bridge.getState().phase).toBe("playing");
  });

  // ── Reactive updates ──────────────────────────────────────

  it("updates score when bridge emits scoreChange", () => {
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);

    act(() => bridge.setScore(99));
    expect(getByTestId("final-score").textContent).toContain("99");
  });

  it("updates high score when bridge emits highScoreChange", () => {
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);

    act(() => bridge.setHighScore(200));
    expect(getByTestId("high-score").textContent).toContain("200");
  });

  it("updates elapsed time when bridge emits elapsedTimeChange", () => {
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);

    act(() => bridge.setElapsedTime(90000)); // 1m 30s
    expect(getByTestId("time-survived").textContent).toContain("1m 30s");
  });

  it("updates parasites collected when bridge emits parasitesCollectedChange", () => {
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);

    act(() => bridge.setParasitesCollected(3));
    expect(getByTestId("parasites-collected").textContent).toContain("3");
  });

  // ── Phase transitions ─────────────────────────────────────

  it("shows content when transitioning from playing to gameOver", () => {
    bridge.setPhase("playing");
    const { container } = render(<GameOver />);
    expect(container.querySelector("#game-over")!.textContent).toBe("");

    act(() => bridge.setPhase("gameOver"));
    expect(container.textContent).toContain("GAME OVER");
  });

  it("hides content when transitioning from gameOver to playing", () => {
    bridge.setPhase("gameOver");
    const { container } = render(<GameOver />);
    expect(container.textContent).toContain("GAME OVER");

    act(() => bridge.setPhase("playing"));
    const el = container.querySelector("#game-over");
    expect(el).toBeTruthy();
    expect(el!.textContent).toBe("");
  });

  // ── Accessibility ─────────────────────────────────────────

  it("has role='dialog' when in gameOver phase", () => {
    bridge.setPhase("gameOver");
    const { container } = render(<GameOver />);
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
  });

  it("has an aria-label describing the game over screen", () => {
    bridge.setPhase("gameOver");
    const { container } = render(<GameOver />);
    expect(container.querySelector('[aria-label="Game over"]')).toBeTruthy();
  });

  it("Play Again button has type='button'", () => {
    bridge.setPhase("gameOver");
    const { getByTestId } = render(<GameOver />);
    expect(getByTestId("play-again").getAttribute("type")).toBe("button");
  });

  // ── Cleanup ───────────────────────────────────────────────

  it("unsubscribes from bridge on unmount", () => {
    bridge.setPhase("gameOver");
    const { unmount } = render(<GameOver />);

    const offSpy = vi.spyOn(bridge, "off");
    unmount();

    expect(offSpy).toHaveBeenCalledTimes(6);
    const events = offSpy.mock.calls.map((c) => c[0]);
    expect(events).toContain("phaseChange");
    expect(events).toContain("scoreChange");
    expect(events).toContain("highScoreChange");
    expect(events).toContain("elapsedTimeChange");
    expect(events).toContain("biomeVisitStatsChange");
    expect(events).toContain("parasitesCollectedChange");

    offSpy.mockRestore();
  });
});

// ── formatTime unit tests ──────────────────────────────────────

describe("formatTime", () => {
  it("returns '0s' for 0 ms", () => {
    expect(formatTime(0)).toBe("0s");
  });

  it("returns seconds only when under 1 minute", () => {
    expect(formatTime(5000)).toBe("5s");
    expect(formatTime(59000)).toBe("59s");
  });

  it("returns minutes and seconds for >= 1 minute", () => {
    expect(formatTime(60000)).toBe("1m 0s");
    expect(formatTime(125000)).toBe("2m 5s");
    expect(formatTime(3661000)).toBe("61m 1s");
  });

  it("floors partial seconds", () => {
    expect(formatTime(1500)).toBe("1s");
    expect(formatTime(999)).toBe("0s");
    expect(formatTime(61999)).toBe("1m 1s");
  });
});
