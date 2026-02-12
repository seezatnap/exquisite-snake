import { describe, it, expect, vi, beforeEach } from "vitest";
import { GameBridge, type GamePhase } from "@/game/bridge";

describe("GameBridge", () => {
  let bridge: GameBridge;

  beforeEach(() => {
    bridge = new GameBridge();
  });

  // ── Initial state ──────────────────────────────────────────

  it("starts with phase 'start'", () => {
    expect(bridge.getState().phase).toBe("start");
  });

  it("starts with score 0", () => {
    expect(bridge.getState().score).toBe(0);
  });

  it("starts with highScore 0", () => {
    expect(bridge.getState().highScore).toBe(0);
  });

  it("starts with elapsedTime 0", () => {
    expect(bridge.getState().elapsedTime).toBe(0);
  });

  // ── setPhase ───────────────────────────────────────────────

  it("setPhase updates state.phase", () => {
    bridge.setPhase("playing");
    expect(bridge.getState().phase).toBe("playing");
  });

  it("setPhase emits phaseChange event", () => {
    const listener = vi.fn();
    bridge.on("phaseChange", listener);
    bridge.setPhase("gameOver");
    expect(listener).toHaveBeenCalledWith("gameOver");
  });

  // ── setScore ───────────────────────────────────────────────

  it("setScore updates state.score", () => {
    bridge.setScore(42);
    expect(bridge.getState().score).toBe(42);
  });

  it("setScore emits scoreChange event", () => {
    const listener = vi.fn();
    bridge.on("scoreChange", listener);
    bridge.setScore(10);
    expect(listener).toHaveBeenCalledWith(10);
  });

  // ── setHighScore ───────────────────────────────────────────

  it("setHighScore updates state.highScore", () => {
    bridge.setHighScore(100);
    expect(bridge.getState().highScore).toBe(100);
  });

  it("setHighScore emits highScoreChange event", () => {
    const listener = vi.fn();
    bridge.on("highScoreChange", listener);
    bridge.setHighScore(99);
    expect(listener).toHaveBeenCalledWith(99);
  });

  // ── setElapsedTime ─────────────────────────────────────────

  it("setElapsedTime updates state.elapsedTime", () => {
    bridge.setElapsedTime(5000);
    expect(bridge.getState().elapsedTime).toBe(5000);
  });

  it("setElapsedTime emits elapsedTimeChange event", () => {
    const listener = vi.fn();
    bridge.on("elapsedTimeChange", listener);
    bridge.setElapsedTime(1234);
    expect(listener).toHaveBeenCalledWith(1234);
  });

  // ── resetRun ───────────────────────────────────────────────

  it("resetRun zeroes score and elapsedTime", () => {
    bridge.setScore(50);
    bridge.setElapsedTime(9999);
    bridge.resetRun();
    expect(bridge.getState().score).toBe(0);
    expect(bridge.getState().elapsedTime).toBe(0);
  });

  it("resetRun emits scoreChange and elapsedTimeChange with 0", () => {
    const scoreCb = vi.fn();
    const timeCb = vi.fn();
    bridge.on("scoreChange", scoreCb);
    bridge.on("elapsedTimeChange", timeCb);
    bridge.setScore(50);
    bridge.setElapsedTime(9999);

    scoreCb.mockClear();
    timeCb.mockClear();

    bridge.resetRun();
    expect(scoreCb).toHaveBeenCalledWith(0);
    expect(timeCb).toHaveBeenCalledWith(0);
  });

  it("resetRun does not affect highScore", () => {
    bridge.setHighScore(200);
    bridge.resetRun();
    expect(bridge.getState().highScore).toBe(200);
  });

  // ── on / off ───────────────────────────────────────────────

  it("off removes a listener", () => {
    const listener = vi.fn();
    bridge.on("scoreChange", listener);
    bridge.off("scoreChange", listener);
    bridge.setScore(10);
    expect(listener).not.toHaveBeenCalled();
  });

  it("supports multiple listeners on the same event", () => {
    const a = vi.fn();
    const b = vi.fn();
    bridge.on("phaseChange", a);
    bridge.on("phaseChange", b);
    bridge.setPhase("playing");
    expect(a).toHaveBeenCalledWith("playing");
    expect(b).toHaveBeenCalledWith("playing");
  });

  it("does not throw when removing a listener that was never added", () => {
    expect(() => bridge.off("scoreChange", vi.fn())).not.toThrow();
  });

  // ── Type coverage: all phases ──────────────────────────────

  it("supports all three game phases", () => {
    const phases: GamePhase[] = ["start", "playing", "gameOver"];
    for (const p of phases) {
      bridge.setPhase(p);
      expect(bridge.getState().phase).toBe(p);
    }
  });
});

describe("gameBridge singleton", () => {
  it("exports a shared singleton instance", async () => {
    const mod1 = await import("@/game/bridge");
    const mod2 = await import("@/game/bridge");
    expect(mod1.gameBridge).toBe(mod2.gameBridge);
  });
});
