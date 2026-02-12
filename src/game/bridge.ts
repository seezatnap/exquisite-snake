/**
 * Phaser ↔ React state bridge.
 *
 * A lightweight typed event emitter that Phaser scenes write to and React
 * overlays subscribe to.  Exported as a singleton so both sides import
 * the same instance.
 */

import { Biome, type BiomeVisitStats } from "./systems/BiomeManager";

// ── Game phases ─────────────────────────────────────────────────
export type GamePhase = "start" | "playing" | "gameOver";

// ── Bridge state shape ──────────────────────────────────────────
export interface GameState {
  phase: GamePhase;
  score: number;
  highScore: number;
  /** Elapsed survival time in milliseconds. */
  elapsedTime: number;
  /** Currently active biome. */
  currentBiome: Biome;
  /** Milliseconds remaining until next biome transition. */
  biomeTimeRemaining: number;
  /** Per-run biome visit stats snapshot. */
  biomeVisitStats: BiomeVisitStats;
}

// ── Event map: event name → payload ─────────────────────────────
export interface GameBridgeEvents {
  phaseChange: GamePhase;
  scoreChange: number;
  highScoreChange: number;
  elapsedTimeChange: number;
  biomeChange: Biome;
  biomeTimeRemainingChange: number;
  biomeVisitStatsChange: BiomeVisitStats;
}

export type GameBridgeEventName = keyof GameBridgeEvents;

type Listener<T> = (value: T) => void;

/**
 * Typed event emitter that also holds the latest snapshot of game state
 * so late-subscribing React components can read the current value
 * without waiting for the next event.
 */
/** Default biome visit stats (no visits). */
const DEFAULT_BIOME_VISIT_STATS: BiomeVisitStats = {
  visits: {
    [Biome.NeonCity]: 0,
    [Biome.IceCavern]: 0,
    [Biome.MoltenCore]: 0,
    [Biome.VoidRift]: 0,
  },
  uniqueCount: 0,
};

export class GameBridge {
  private state: GameState = {
    phase: "start",
    score: 0,
    highScore: 0,
    elapsedTime: 0,
    currentBiome: Biome.NeonCity,
    biomeTimeRemaining: 0,
    biomeVisitStats: DEFAULT_BIOME_VISIT_STATS,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners: Map<GameBridgeEventName, Set<Listener<any>>> = new Map();

  // ── Getters ─────────────────────────────────────────────────
  getState(): Readonly<GameState> {
    return this.state;
  }

  // ── Mutations (called by Phaser scenes) ─────────────────────
  setPhase(phase: GamePhase): void {
    this.state.phase = phase;
    this.emit("phaseChange", phase);
  }

  setScore(score: number): void {
    this.state.score = score;
    this.emit("scoreChange", score);
  }

  setHighScore(highScore: number): void {
    this.state.highScore = highScore;
    this.emit("highScoreChange", highScore);
  }

  setElapsedTime(elapsedTime: number): void {
    this.state.elapsedTime = elapsedTime;
    this.emit("elapsedTimeChange", elapsedTime);
  }

  setBiome(biome: Biome): void {
    this.state.currentBiome = biome;
    this.emit("biomeChange", biome);
  }

  setBiomeTimeRemaining(ms: number): void {
    this.state.biomeTimeRemaining = ms;
    this.emit("biomeTimeRemainingChange", ms);
  }

  setBiomeVisitStats(stats: BiomeVisitStats): void {
    this.state.biomeVisitStats = stats;
    this.emit("biomeVisitStatsChange", stats);
  }

  /** Reset score, elapsed time, and biome state (called on new game). */
  resetRun(): void {
    this.state.score = 0;
    this.state.elapsedTime = 0;
    this.state.currentBiome = Biome.NeonCity;
    this.state.biomeTimeRemaining = 0;
    this.state.biomeVisitStats = DEFAULT_BIOME_VISIT_STATS;
    this.emit("scoreChange", 0);
    this.emit("elapsedTimeChange", 0);
    this.emit("biomeChange", Biome.NeonCity);
    this.emit("biomeTimeRemainingChange", 0);
    this.emit("biomeVisitStatsChange", DEFAULT_BIOME_VISIT_STATS);
  }

  // ── Pub / Sub ───────────────────────────────────────────────
  on<K extends GameBridgeEventName>(
    event: K,
    listener: Listener<GameBridgeEvents[K]>,
  ): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
  }

  off<K extends GameBridgeEventName>(
    event: K,
    listener: Listener<GameBridgeEvents[K]>,
  ): void {
    this.listeners.get(event)?.delete(listener);
  }

  private emit<K extends GameBridgeEventName>(
    event: K,
    value: GameBridgeEvents[K],
  ): void {
    this.listeners.get(event)?.forEach((fn) => fn(value));
  }
}

/** Singleton bridge instance shared by Phaser and React. */
export const gameBridge = new GameBridge();
