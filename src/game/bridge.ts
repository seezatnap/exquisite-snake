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
import {
  PARASITE_MAX_SEGMENTS,
  type ParasiteType,
} from "./entities/Parasite";

function createInitialBiomeVisitStats(firstBiome: Biome = Biome.NeonCity): BiomeVisitStats {
  const stats: BiomeVisitStats = {
    [Biome.NeonCity]: 1,
    [Biome.IceCavern]: 0,
    [Biome.MoltenCore]: 0,
    [Biome.VoidRift]: 0,
  };
  if (firstBiome !== Biome.NeonCity) {
    stats[Biome.NeonCity] = 0;
    stats[firstBiome] = 1;
  }
  return stats;
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
  /** Ordered oldest->newest attached parasite types (max 3). */
  activeParasites: ParasiteType[];
  /** Total parasite pickups collected this run. */
  parasitesCollected: number;
}

// ── Event map: event name → payload ─────────────────────────────
export interface GameBridgeEvents {
  phaseChange: GamePhase;
  scoreChange: number;
  highScoreChange: number;
  elapsedTimeChange: number;
  biomeChange: Biome;
  biomeVisitStatsChange: BiomeVisitStats;
  activeParasitesChange: ParasiteType[];
  parasitesCollectedChange: number;
  biomeTransition: BiomeTransition;
  biomeEnter: Biome;
  biomeExit: Biome;
}

export interface ResetRunOptions {
  currentBiome?: Biome;
  biomeVisitStats?: BiomeVisitStats;
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
    activeParasites: [],
    parasitesCollected: 0,
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

  setActiveParasites(activeParasites: readonly ParasiteType[]): void {
    const next = [...activeParasites].slice(0, PARASITE_MAX_SEGMENTS);
    if (this.hasSameParasiteTypes(this.state.activeParasites, next)) {
      return;
    }
    this.state.activeParasites = next;
    this.emit("activeParasitesChange", [...next]);
  }

  setParasitesCollected(parasitesCollected: number): void {
    const next = Number.isFinite(parasitesCollected)
      ? Math.max(0, Math.floor(parasitesCollected))
      : 0;
    if (this.state.parasitesCollected === next) {
      return;
    }
    this.state.parasitesCollected = next;
    this.emit("parasitesCollectedChange", next);
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
  resetRun(options: ResetRunOptions = {}): void {
    const currentBiome = options.currentBiome ?? Biome.NeonCity;
    const visitStats = options.biomeVisitStats
      ? { ...options.biomeVisitStats }
      : createInitialBiomeVisitStats(currentBiome);

    this.state.score = 0;
    this.state.elapsedTime = 0;
    this.state.currentBiome = currentBiome;
    this.state.biomeVisitStats = visitStats;
    this.state.activeParasites = [];
    this.state.parasitesCollected = 0;
    this.emit("scoreChange", 0);
    this.emit("elapsedTimeChange", 0);
    this.emit("biomeChange", this.state.currentBiome);
    this.emit("biomeVisitStatsChange", this.state.biomeVisitStats);
    this.emit("activeParasitesChange", []);
    this.emit("parasitesCollectedChange", 0);
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

  private hasSameParasiteTypes(
    a: readonly ParasiteType[],
    b: readonly ParasiteType[],
  ): boolean {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }
}

/** Singleton bridge instance shared by Phaser and React. */
export const gameBridge = new GameBridge();
