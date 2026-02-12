import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import type { GameBridge } from "@/game/bridge";
import { Biome } from "@/game/systems/BiomeManager";

// vi.hoisted runs before the mock factory, so bridge is available.
const { bridge } = vi.hoisted(() => {
  type GamePhase = "start" | "playing" | "gameOver";
  type Biome = "neon-city" | "ice-cavern" | "molten-core" | "void-rift";
  interface State {
    phase: GamePhase;
    score: number;
    highScore: number;
    elapsedTime: number;
    currentBiome: Biome;
  }
  type Listener = (v: unknown) => void;

  class HoistedBridge {
    private state: State = {
      phase: "start",
      score: 0,
      highScore: 0,
      elapsedTime: 0,
      currentBiome: "neon-city",
    };
    private listeners = new Map<string, Set<Listener>>();

    getState() { return this.state; }

    setPhase(p: GamePhase) { this.state.phase = p; this.emit("phaseChange", p); }
    setScore(s: number) { this.state.score = s; this.emit("scoreChange", s); }
    setHighScore(h: number) { this.state.highScore = h; this.emit("highScoreChange", h); }
    setElapsedTime(t: number) { this.state.elapsedTime = t; this.emit("elapsedTimeChange", t); }
    setCurrentBiome(b: Biome) { this.state.currentBiome = b; this.emit("biomeChange", b); }
    resetRun() {
      this.state.score = 0;
      this.state.elapsedTime = 0;
      this.state.currentBiome = "neon-city";
      this.emit("scoreChange", 0);
      this.emit("elapsedTimeChange", 0);
      this.emit("biomeChange", "neon-city");
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

import HUD from "@/components/HUD";

describe("HUD component", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    bridge.setPhase("start");
    bridge.setScore(0);
    bridge.setHighScore(0);
    bridge.setCurrentBiome(Biome.NeonCity);
  });

  // ── Visibility ────────────────────────────────────────────

  it("renders an empty #hud div when phase is 'start'", () => {
    const { container } = render(<HUD />);
    const hud = container.querySelector("#hud");
    expect(hud).toBeTruthy();
    expect(hud!.textContent).toBe("");
  });

  it("renders an empty #hud div when phase is 'gameOver'", () => {
    bridge.setPhase("gameOver");
    const { container } = render(<HUD />);
    const hud = container.querySelector("#hud");
    expect(hud).toBeTruthy();
    expect(hud!.textContent).toBe("");
  });

  it("renders full HUD content when phase is 'playing'", () => {
    bridge.setPhase("playing");
    const { container } = render(<HUD />);
    const hud = container.querySelector("#hud");
    expect(hud).toBeTruthy();
    expect(hud!.textContent).toContain("SCORE");
    expect(hud!.textContent).toContain("HI");
  });

  // ── Score display ─────────────────────────────────────────

  it("displays current score from bridge state", () => {
    bridge.setPhase("playing");
    bridge.setScore(42);
    const { container } = render(<HUD />);
    expect(container.textContent).toContain("42");
  });

  it("displays high score from bridge state", () => {
    bridge.setPhase("playing");
    bridge.setHighScore(100);
    const { container } = render(<HUD />);
    expect(container.textContent).toContain("100");
  });

  it("updates score when bridge emits scoreChange", () => {
    bridge.setPhase("playing");
    const { container } = render(<HUD />);

    act(() => bridge.setScore(7));
    expect(container.textContent).toContain("7");

    act(() => bridge.setScore(15));
    expect(container.textContent).toContain("15");
  });

  it("updates high score when bridge emits highScoreChange", () => {
    bridge.setPhase("playing");
    const { container } = render(<HUD />);

    act(() => bridge.setHighScore(50));
    expect(container.textContent).toContain("50");
  });

  // ── Phase transitions ─────────────────────────────────────

  it("shows HUD when transitioning from start to playing", () => {
    const { container } = render(<HUD />);
    const hud = container.querySelector("#hud");
    expect(hud).toBeTruthy();
    expect(hud!.textContent).toBe("");

    act(() => bridge.setPhase("playing"));
    expect(container.textContent).toContain("SCORE");
  });

  it("hides HUD content when transitioning from playing to gameOver", () => {
    bridge.setPhase("playing");
    const { container } = render(<HUD />);
    expect(container.textContent).toContain("SCORE");

    act(() => bridge.setPhase("gameOver"));
    const hud = container.querySelector("#hud");
    expect(hud).toBeTruthy();
    expect(hud!.textContent).toBe("");
  });

  // ── Biome indicator ───────────────────────────────────────

  it("renders biome indicator with current biome name and icon", () => {
    bridge.setPhase("playing");
    const { container } = render(<HUD />);
    const indicator = container.querySelector('[data-testid="hud-biome-indicator"]');
    expect(indicator).toBeTruthy();
    expect(indicator!.textContent).toContain("Neon City");
    expect(indicator!.textContent).toContain("[]");
  });

  it("refreshes biome indicator for all four biome transitions", () => {
    bridge.setPhase("playing");
    const { container } = render(<HUD />);
    const indicator = () => container.querySelector('[data-testid="hud-biome-indicator"]');

    act(() => bridge.setCurrentBiome(Biome.IceCavern));
    expect(indicator()!.textContent).toContain("Ice Cavern");
    expect(indicator()!.textContent).toContain("*");

    act(() => bridge.setCurrentBiome(Biome.MoltenCore));
    expect(indicator()!.textContent).toContain("Molten Core");
    expect(indicator()!.textContent).toContain("^");

    act(() => bridge.setCurrentBiome(Biome.VoidRift));
    expect(indicator()!.textContent).toContain("Void Rift");
    expect(indicator()!.textContent).toContain("@");

    act(() => bridge.setCurrentBiome(Biome.NeonCity));
    expect(indicator()!.textContent).toContain("Neon City");
    expect(indicator()!.textContent).toContain("[]");
  });

  it("renders rewind placeholder slot", () => {
    bridge.setPhase("playing");
    const { container } = render(<HUD />);
    expect(container.querySelector('[data-slot="rewind"]')).toBeTruthy();
  });

  it("renders parasites placeholder slot", () => {
    bridge.setPhase("playing");
    const { container } = render(<HUD />);
    expect(container.querySelector('[data-slot="parasites"]')).toBeTruthy();
  });

  it("placeholder slots are aria-hidden", () => {
    bridge.setPhase("playing");
    const { container } = render(<HUD />);
    const slots = container.querySelectorAll('[data-slot]:not([data-slot="biome"])');
    expect(slots.length).toBe(2);
    slots.forEach((slot) => {
      expect(slot.getAttribute("aria-hidden")).toBe("true");
    });
  });

  // ── Accessibility ─────────────────────────────────────────

  it("has role='status' when playing", () => {
    bridge.setPhase("playing");
    const { container } = render(<HUD />);
    expect(container.querySelector('[role="status"]')).toBeTruthy();
  });

  it("has an aria-label describing the HUD", () => {
    bridge.setPhase("playing");
    const { container } = render(<HUD />);
    expect(
      container.querySelector('[aria-label="Game HUD"]'),
    ).toBeTruthy();
  });

  // ── Cleanup ───────────────────────────────────────────────

  it("unsubscribes from bridge on unmount", () => {
    bridge.setPhase("playing");
    const { unmount } = render(<HUD />);

    const offSpy = vi.spyOn(bridge, "off");
    unmount();

    expect(offSpy).toHaveBeenCalledTimes(4);
    const events = offSpy.mock.calls.map((c) => c[0]);
    expect(events).toContain("phaseChange");
    expect(events).toContain("scoreChange");
    expect(events).toContain("highScoreChange");
    expect(events).toContain("biomeChange");

    offSpy.mockRestore();
  });
});
