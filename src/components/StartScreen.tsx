"use client";

import { useEffect, useState, useCallback } from "react";
import { gameBridge, type GamePhase } from "@/game/bridge";

/**
 * Pre-game start screen overlay.
 *
 * Displays the game title with an animated snake logo, a pulsing
 * "Press any key" prompt, and the persisted high score. Listens for
 * any keydown, click, or touch event to transition to the "playing" phase.
 *
 * Only visible during the "start" phase.
 */
export default function StartScreen() {
  const [phase, setPhase] = useState<GamePhase>(
    () => gameBridge.getState().phase,
  );
  const [highScore, setHighScore] = useState<number>(
    () => gameBridge.getState().highScore,
  );

  useEffect(() => {
    const onPhase = (p: GamePhase) => setPhase(p);
    const onHighScore = (hs: number) => setHighScore(hs);

    gameBridge.on("phaseChange", onPhase);
    gameBridge.on("highScoreChange", onHighScore);

    return () => {
      gameBridge.off("phaseChange", onPhase);
      gameBridge.off("highScoreChange", onHighScore);
    };
  }, []);

  const startGame = useCallback(() => {
    if (gameBridge.getState().phase !== "start") return;
    gameBridge.setPhase("playing");
  }, []);

  // Listen for any key / click / touch to start the game
  useEffect(() => {
    if (phase !== "start") return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore modifier-only keys and Tab (for a11y navigation)
      if (e.key === "Tab" || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      startGame();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [phase, startGame]);

  if (phase !== "start") return <div id="start-screen" />;

  return (
    <div
      id="start-screen"
      className="flex h-full w-full flex-col items-center justify-center"
      role="dialog"
      aria-label="Start screen"
      onClick={startGame}
      onTouchEnd={(e) => {
        e.preventDefault();
        startGame();
      }}
    >
      {/* Animated snake logo */}
      <div className="snake-logo mb-6" aria-hidden="true">
        <svg
          width="120"
          height="120"
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-[0_0_16px_rgba(0,240,255,0.5)]"
        >
          {/* Snake body path */}
          <path
            d="M30 90 Q30 60 50 60 Q70 60 70 40 Q70 20 90 20"
            stroke="var(--neon-cyan)"
            strokeWidth="8"
            strokeLinecap="round"
            fill="none"
            className="snake-path"
          />
          {/* Snake head */}
          <circle
            cx="90"
            cy="20"
            r="10"
            fill="var(--neon-cyan)"
            className="snake-head-glow"
          />
          {/* Snake eye */}
          <circle cx="93" cy="17" r="2.5" fill="var(--background)" />
          {/* Snake tongue */}
          <line
            x1="100"
            y1="20"
            x2="108"
            y2="16"
            stroke="var(--neon-pink)"
            strokeWidth="2"
            strokeLinecap="round"
            className="snake-tongue"
          />
          <line
            x1="100"
            y1="20"
            x2="108"
            y2="24"
            stroke="var(--neon-pink)"
            strokeWidth="2"
            strokeLinecap="round"
            className="snake-tongue"
          />
        </svg>
      </div>

      {/* Title */}
      <h1
        className="neon-glow-cyan mb-2 text-center font-mono text-4xl font-bold tracking-widest text-neon-cyan sm:text-5xl"
        data-testid="game-title"
      >
        EXQUISITE
      </h1>
      <h2
        className="neon-glow-pink mb-8 text-center font-mono text-5xl font-bold tracking-[0.3em] text-neon-pink sm:text-6xl"
        data-testid="game-subtitle"
      >
        SNAKE
      </h2>

      {/* High score display */}
      {highScore > 0 && (
        <p
          className="mb-8 font-mono text-sm tracking-wide text-neon-purple/80"
          data-testid="high-score"
        >
          HIGH SCORE{" "}
          <span className="tabular-nums text-neon-purple">{highScore}</span>
        </p>
      )}

      {/* Press any key prompt */}
      <p
        className="start-prompt font-mono text-sm tracking-widest text-foreground/60"
        data-testid="start-prompt"
      >
        PRESS ANY KEY TO START
      </p>
    </div>
  );
}
