/**
 * Phaser ↔ React state bridge.
 *
 * A lightweight typed event emitter that Phaser scenes write to and React
 * overlays subscribe to.  Exported as a singleton so both sides import
 * the same instance.
 */
import {
  Biome,
  type BiomeTransition,
  type BiomeVisitStats,
} from "./systems/BiomeManager";

function createInitialBiomeVisitStats(): BiomeVisitStats {
  return {
    [Biome.NeonCity]: 1,
    [Biome.IceCavern]: 0,
    [Biome.MoltenCore]: 0,
    [Biome.VoidRift]: 0,
  };
}

// ── Game phases ─────────────────────────────────────────────────
export type GamePhase = "start" | "playing" | "gameOver";

// ── Bridge state shape ──────────────────────────────────────────
export interface GameState {
  phase: GamePhase;
  score: number;
  highScore: number;
  /** Elapsed survival time in milliseconds. */
  elapsedTime: number;
  /** Active biome for the current run. */
  currentBiome: Biome;
  /** Per-biome visit counts for the current run. */
  biomeVisitStats: BiomeVisitStats;
}

// ── Event map: event name → payload ─────────────────────────────
export interface GameBridgeEvents {
  phaseChange: GamePhase;
  scoreChange: number;
  highScoreChange: number;
  elapsedTimeChange: number;
  biomeChange: Biome;
  biomeVisitStatsChange: BiomeVisitStats;
  biomeTransition: BiomeTransition;
  biomeEnter: Biome;
  biomeExit: Biome;
}

export type GameBridgeEventName = keyof GameBridgeEvents;

type Listener<T> = (value: T) => void;

/**
 * Typed event emitter that also holds the latest snapshot of game state
 * so late-subscribing React components can read the current value
 * without waiting for the next event.
 */
export class GameBridge {
  private state: GameState = {
    phase: "start",
    score: 0,
    highScore: 0,
    elapsedTime: 0,
    currentBiome: Biome.NeonCity,
    biomeVisitStats: createInitialBiomeVisitStats(),
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

  setCurrentBiome(currentBiome: Biome): void {
    this.state.currentBiome = currentBiome;
    this.emit("biomeChange", currentBiome);
  }

  setBiomeVisitStats(stats: BiomeVisitStats): void {
    const nextStats: BiomeVisitStats = { ...stats };
    this.state.biomeVisitStats = nextStats;
    this.emit("biomeVisitStatsChange", nextStats);
  }

  /**
   * Emit a biome transition record for subscribers that need both endpoints.
   */
  emitBiomeTransition(transition: BiomeTransition): void {
    this.emit("biomeTransition", transition);
  }

  emitBiomeEnter(biome: Biome): void {
    this.emit("biomeEnter", biome);
  }

  emitBiomeExit(biome: Biome): void {
    this.emit("biomeExit", biome);
  }

  /** Reset all per-run state (called on new game). */
  resetRun(): void {
    this.state.score = 0;
    this.state.elapsedTime = 0;
    this.state.currentBiome = Biome.NeonCity;
    this.state.biomeVisitStats = createInitialBiomeVisitStats();
    this.emit("scoreChange", 0);
    this.emit("elapsedTimeChange", 0);
    this.emit("biomeChange", this.state.currentBiome);
    this.emit("biomeVisitStatsChange", this.state.biomeVisitStats);
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
