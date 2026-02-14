"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { gameBridge, type GamePhase } from "@/game/bridge";
import {
  BIOME_CYCLE_ORDER,
  BIOME_CONFIG,
  type BiomeVisitStats,
} from "@/game/systems/BiomeManager";

/**
 * Format milliseconds into a human-readable "Xm Ys" or "Xs" string.
 */
function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function normalizeParasitesCollected(value: unknown): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(Number(value)));
}

/**
 * Post-game overlay displayed after the player dies.
 *
 * Shows final score, high score, time survived, and a "Play Again"
 * button that resets the scene and re-enters the playing phase.
 *
 * Only visible during the "gameOver" phase. Follows the same bridge
 * subscription pattern as StartScreen and HUD.
 */
export default function GameOver() {
  const [phase, setPhase] = useState<GamePhase>(
    () => gameBridge.getState().phase,
  );
  const [score, setScore] = useState<number>(
    () => gameBridge.getState().score,
  );
  const [highScore, setHighScore] = useState<number>(
    () => gameBridge.getState().highScore,
  );
  const [elapsedTime, setElapsedTime] = useState<number>(
    () => gameBridge.getState().elapsedTime,
  );
  const [biomeVisitStats, setBiomeVisitStats] = useState<BiomeVisitStats>(
    () => gameBridge.getState().biomeVisitStats,
  );
  const [parasitesCollected, setParasitesCollected] = useState<number>(
    () => normalizeParasitesCollected(gameBridge.getState().parasitesCollected),
  );

  const playAgainRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onPhase = (p: GamePhase) => setPhase(p);
    const onScore = (s: number) => setScore(s);
    const onHighScore = (hs: number) => setHighScore(hs);
    const onElapsedTime = (t: number) => setElapsedTime(t);
    const onBiomeVisitStats = (stats: BiomeVisitStats) =>
      setBiomeVisitStats(stats);
    const onParasitesCollected = (count: number) =>
      setParasitesCollected(normalizeParasitesCollected(count));

    gameBridge.on("phaseChange", onPhase);
    gameBridge.on("scoreChange", onScore);
    gameBridge.on("highScoreChange", onHighScore);
    gameBridge.on("elapsedTimeChange", onElapsedTime);
    gameBridge.on("biomeVisitStatsChange", onBiomeVisitStats);
    gameBridge.on("parasitesCollectedChange", onParasitesCollected);

    return () => {
      gameBridge.off("phaseChange", onPhase);
      gameBridge.off("scoreChange", onScore);
      gameBridge.off("highScoreChange", onHighScore);
      gameBridge.off("elapsedTimeChange", onElapsedTime);
      gameBridge.off("biomeVisitStatsChange", onBiomeVisitStats);
      gameBridge.off("parasitesCollectedChange", onParasitesCollected);
    };
  }, []);

  // Auto-focus the Play Again button when entering gameOver phase
  useEffect(() => {
    if (phase === "gameOver") {
      // Use a short timeout to ensure the DOM has rendered
      const id = setTimeout(() => playAgainRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [phase]);

  const playAgain = useCallback(() => {
    if (gameBridge.getState().phase !== "gameOver") return;
    gameBridge.setPhase("playing");
  }, []);

  const returnToStart = useCallback(() => {
    if (gameBridge.getState().phase !== "gameOver") return;
    gameBridge.setPhase("start");
  }, []);

  // Keyboard shortcuts: Enter/Space → play again, Escape → start screen
  useEffect(() => {
    if (phase !== "gameOver") return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        playAgain();
      } else if (e.key === "Escape") {
        e.preventDefault();
        returnToStart();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, playAgain, returnToStart]);

  if (phase !== "gameOver") return <div id="game-over" />;

  const isNewHighScore = score > 0 && score >= highScore;
  const visitedBiomes = BIOME_CYCLE_ORDER.filter(
    (biome) => biomeVisitStats[biome] > 0,
  );
  const biomesVisitedText = visitedBiomes
    .map((biome) => {
      const visits = biomeVisitStats[biome];
      if (visits > 1) {
        return `${BIOME_CONFIG[biome].label} x${visits}`;
      }
      return BIOME_CONFIG[biome].label;
    })
    .join(" • ");

  return (
    <div
      id="game-over"
      className="flex h-full w-full flex-col items-center justify-center"
      role="dialog"
      aria-label="Game over"
    >
      {/* Game Over title */}
      <h2
        className="neon-glow-pink mb-6 font-mono text-4xl font-bold tracking-widest text-neon-pink sm:text-5xl"
        data-testid="game-over-title"
      >
        GAME OVER
      </h2>

      {/* Stats panel */}
      <div className="surface-panel mb-8 flex flex-col items-center gap-3 px-8 py-6">
        {/* Final score */}
        <div className="text-center" data-testid="final-score">
          <span className="font-mono text-xs tracking-wide text-foreground/50">
            SCORE
          </span>
          <p className="neon-glow-cyan font-mono text-3xl font-bold tabular-nums text-neon-cyan">
            {score}
          </p>
        </div>

        {/* High score */}
        <div className="text-center" data-testid="high-score">
          <span className="font-mono text-xs tracking-wide text-foreground/50">
            HIGH SCORE
          </span>
          <p className="font-mono text-lg tabular-nums text-neon-purple">
            {highScore}
          </p>
          {isNewHighScore && (
            <span
              className="neon-glow-pink font-mono text-xs font-bold tracking-wide text-neon-pink"
              data-testid="new-high-score"
            >
              NEW!
            </span>
          )}
        </div>

        {/* Time survived */}
        <div className="text-center" data-testid="time-survived">
          <span className="font-mono text-xs tracking-wide text-foreground/50">
            TIME SURVIVED
          </span>
          <p className="font-mono text-lg tabular-nums text-foreground/80">
            {formatTime(elapsedTime)}
          </p>
        </div>

        {/* Biomes visited */}
        <div className="text-center" data-testid="biomes-visited">
          <span className="font-mono text-xs tracking-wide text-foreground/50">
            BIOMES VISITED
          </span>
          <p className="font-mono text-lg tabular-nums text-foreground/80">
            {visitedBiomes.length}/{BIOME_CYCLE_ORDER.length}
          </p>
          <p
            className="font-mono text-xs text-foreground/60"
            data-testid="biomes-visited-list"
          >
            {biomesVisitedText || "None"}
          </p>
        </div>

        {/* Parasites collected */}
        <div className="text-center" data-testid="parasites-collected">
          <span className="font-mono text-xs tracking-wide text-foreground/50">
            PARASITES COLLECTED
          </span>
          <p className="font-mono text-lg tabular-nums text-foreground/80">
            {parasitesCollected}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col items-center gap-3">
        <button
          ref={playAgainRef}
          className="neon-border-cyan rounded border px-6 py-3 font-mono text-sm font-bold tracking-widest text-neon-cyan transition-all hover:bg-neon-cyan/10 focus-visible:bg-neon-cyan/10"
          data-testid="play-again"
          onClick={playAgain}
          type="button"
        >
          PLAY AGAIN
        </button>
        <button
          className="rounded border border-surface-bright px-4 py-2 font-mono text-xs tracking-wide text-foreground/50 transition-all hover:border-neon-pink/40 hover:text-foreground/80 focus-visible:border-neon-pink/40 focus-visible:text-foreground/80"
          data-testid="return-to-start"
          onClick={returnToStart}
          type="button"
        >
          MENU
        </button>
      </div>

      {/* Keyboard hint */}
      <p
        className="mt-4 font-mono text-[10px] tracking-wide text-foreground/30"
        data-testid="keyboard-hint"
        aria-hidden="true"
      >
        ENTER — PLAY &nbsp;&nbsp; ESC — MENU
      </p>
    </div>
  );
}

export { formatTime };
