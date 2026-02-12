"use client";

import { useEffect, useState } from "react";

type GamePhase = "start" | "playing" | "game-over";

type OverlayGameState = Readonly<{
  phase: GamePhase;
  score: number;
  highScore: number;
  elapsedSurvivalMs: number;
}>;

const INITIAL_STATE: OverlayGameState = Object.freeze({
  phase: "start",
  score: 0,
  highScore: 0,
  elapsedSurvivalMs: 0,
});

function clampNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function formatCounter(value: number): string {
  return clampNonNegativeInteger(value).toString().padStart(4, "0");
}

function formatTimeSurvived(elapsedSurvivalMs: number): string {
  const totalSeconds = Math.floor(
    clampNonNegativeInteger(elapsedSurvivalMs) / 1000,
  );
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function GameOver() {
  const [overlayState, setOverlayState] = useState<OverlayGameState>(INITIAL_STATE);
  const [requestReplay, setRequestReplay] = useState<(() => boolean) | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void import("@/game/scenes/MainScene")
      .then(
        ({
          getMainSceneStateSnapshot,
          requestMainSceneReplay,
          subscribeToMainSceneState,
        }) => {
          if (cancelled) {
            return;
          }

          const applyState = (nextState: OverlayGameState) => {
            setOverlayState({
              phase: nextState.phase,
              score: clampNonNegativeInteger(nextState.score),
              highScore: clampNonNegativeInteger(nextState.highScore),
              elapsedSurvivalMs: clampNonNegativeInteger(
                nextState.elapsedSurvivalMs,
              ),
            });
          };

          applyState(getMainSceneStateSnapshot());
          setRequestReplay(() => requestMainSceneReplay);
          unsubscribe = subscribeToMainSceneState(applyState);
        },
      )
      .catch(() => {
        // Keep the overlay resilient if scene bootstrapping is delayed.
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const handlePlayAgain = () => {
    requestReplay?.();
  };

  if (overlayState.phase !== "game-over") {
    return null;
  }

  return (
    <aside
      aria-label="Game over screen"
      className="w-full max-w-md rounded-3xl border border-neon-pink/55 bg-surface-0/90 p-6 text-center shadow-[0_0_38px_rgb(var(--neon-pink-rgb)/0.28)] backdrop-blur-md sm:p-8"
    >
      <p className="text-[0.7rem] uppercase tracking-[0.28em] text-neon-pink/90">
        Run Complete
      </p>
      <h2 className="mt-2 font-mono text-3xl uppercase tracking-[0.25em] text-neon-cyan sm:text-4xl">
        Game Over
      </h2>

      <div className="mt-6 grid grid-cols-1 gap-3 rounded-2xl border border-neon-cyan/30 bg-surface-1/75 p-4 text-left sm:grid-cols-3 sm:gap-4">
        <div>
          <p className="text-[0.58rem] uppercase tracking-[0.2em] text-neon-cyan/75">
            Final Score
          </p>
          <p className="mt-1 font-mono text-xl leading-none text-foreground">
            {formatCounter(overlayState.score)}
          </p>
        </div>

        <div>
          <p className="text-[0.58rem] uppercase tracking-[0.2em] text-neon-cyan/75">
            High Score
          </p>
          <p className="mt-1 font-mono text-xl leading-none text-neon-pink">
            {formatCounter(overlayState.highScore)}
          </p>
        </div>

        <div>
          <p className="text-[0.58rem] uppercase tracking-[0.2em] text-neon-cyan/75">
            Time Survived
          </p>
          <p className="mt-1 font-mono text-xl leading-none text-foreground">
            {formatTimeSurvived(overlayState.elapsedSurvivalMs)}
          </p>
        </div>
      </div>

      <button
        type="button"
        autoFocus
        onClick={handlePlayAgain}
        className="mt-7 inline-flex min-w-44 items-center justify-center rounded-xl border border-neon-pink/70 bg-neon-pink/15 px-5 py-2.5 font-mono text-sm uppercase tracking-[0.2em] text-neon-pink transition hover:bg-neon-pink/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
      >
        Play Again
      </button>
    </aside>
  );
}
