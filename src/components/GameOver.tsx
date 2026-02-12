"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { gameBridge, type GamePhase } from "@/game/bridge";

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

  const playAgainRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const onPhase = (p: GamePhase) => setPhase(p);
    const onScore = (s: number) => setScore(s);
    const onHighScore = (hs: number) => setHighScore(hs);
    const onElapsedTime = (t: number) => setElapsedTime(t);

    gameBridge.on("phaseChange", onPhase);
    gameBridge.on("scoreChange", onScore);
    gameBridge.on("highScoreChange", onHighScore);
    gameBridge.on("elapsedTimeChange", onElapsedTime);

    return () => {
      gameBridge.off("phaseChange", onPhase);
      gameBridge.off("scoreChange", onScore);
      gameBridge.off("highScoreChange", onHighScore);
      gameBridge.off("elapsedTimeChange", onElapsedTime);
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

  if (phase !== "gameOver") return <div id="game-over" />;

  const isNewHighScore = score > 0 && score >= highScore;

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
      </div>

      {/* Play Again button */}
      <button
        ref={playAgainRef}
        className="neon-border-cyan rounded border px-6 py-3 font-mono text-sm font-bold tracking-widest text-neon-cyan transition-all hover:bg-neon-cyan/10 focus-visible:bg-neon-cyan/10"
        data-testid="play-again"
        onClick={playAgain}
        type="button"
      >
        PLAY AGAIN
      </button>
    </div>
  );
}

export { formatTime };
