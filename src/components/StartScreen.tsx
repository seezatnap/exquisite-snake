"use client";

import { useEffect, useMemo, useState } from "react";
import { loadHighScore } from "@/game/utils/storage";

type StartPhase = "start" | "playing" | "game-over";

const LOGO_SEGMENT_OFFSETS = [-110, -86, -63, -41, -20, 0, 20, 41, 63, 86, 110];

function clampNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

export default function StartScreen() {
  const [phase, setPhase] = useState<StartPhase>("start");
  const [highScore, setHighScore] = useState(0);
  const [requestStart, setRequestStart] = useState<(() => boolean) | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    setHighScore(loadHighScore());

    void import("@/game/scenes/MainScene")
      .then(
        ({
          getMainSceneStateSnapshot,
          requestMainSceneStart,
          subscribeToMainSceneState,
        }) => {
          if (cancelled) {
            return;
          }

          const applyState = ({
            phase: nextPhase,
            highScore: nextHighScore,
          }: {
            phase: StartPhase;
            highScore: number;
          }) => {
            setPhase(nextPhase);
            setHighScore((currentHighScore) =>
              Math.max(currentHighScore, clampNonNegativeInteger(nextHighScore)),
            );
          };

          applyState(getMainSceneStateSnapshot());
          setRequestStart(() =>
            typeof requestMainSceneStart === "function"
              ? requestMainSceneStart
              : null,
          );
          unsubscribe = subscribeToMainSceneState(applyState);
        },
      )
      .catch(() => {
        // Keep UI responsive if scene bootstrapping is not ready yet.
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const displayHighScore = useMemo(
    () => clampNonNegativeInteger(highScore).toString().padStart(4, "0"),
    [highScore],
  );

  const handleStart = () => {
    requestStart?.();
  };

  if (phase !== "start") {
    return null;
  }

  return (
    <aside
      aria-label="Start screen"
      className="w-full max-w-xl rounded-3xl border border-neon-cyan/45 bg-surface-0/88 p-6 text-center shadow-[0_0_36px_rgb(var(--neon-cyan-rgb)/0.2)] backdrop-blur-sm sm:p-8"
    >
      <div
        aria-hidden="true"
        className="relative mx-auto mb-5 h-16 w-full max-w-sm overflow-hidden rounded-2xl border border-neon-cyan/30 bg-surface-1/70"
      >
        {LOGO_SEGMENT_OFFSETS.map((offset, index) => (
          <span
            key={offset}
            className={`absolute top-1/2 block -translate-y-1/2 rounded-full border border-neon-cyan/35 bg-neon-pink/90 shadow-[0_0_16px_rgb(var(--neon-pink-rgb)/0.8)] ${
              index === LOGO_SEGMENT_OFFSETS.length - 1
                ? "h-4 w-4 animate-pulse"
                : "h-3.5 w-3.5 animate-pulse"
            }`}
            style={{
              left: "50%",
              marginLeft: `${offset}px`,
              animationDelay: `${index * 95}ms`,
              animationDuration: "1450ms",
            }}
          />
        ))}
      </div>

      <h1 className="font-mono text-3xl uppercase tracking-[0.32em] text-neon-cyan drop-shadow-[0_0_10px_rgb(var(--neon-cyan-rgb)/0.7)] sm:text-4xl">
        <span className="inline-block animate-pulse">Exquisite Snake</span>
      </h1>

      <p className="mt-5 text-xs uppercase tracking-[0.35em] text-neon-pink/90 sm:text-sm">
        Press any key
      </p>

      <p className="mt-2 text-[0.65rem] uppercase tracking-[0.22em] text-foreground/65">
        to begin your run
      </p>

      <button
        type="button"
        autoFocus
        onClick={handleStart}
        className="mt-6 inline-flex min-w-44 items-center justify-center rounded-xl border border-neon-cyan/70 bg-neon-cyan/10 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.22em] text-neon-cyan transition hover:bg-neon-cyan/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-pink focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
      >
        Start Run
      </button>

      <div className="mx-auto mt-6 inline-flex min-w-44 items-baseline justify-center gap-3 rounded-xl border border-neon-pink/35 bg-surface-1/75 px-4 py-2">
        <p className="text-[0.62rem] uppercase tracking-[0.24em] text-neon-pink/80">
          High Score
        </p>
        <p className="font-mono text-2xl leading-none text-foreground">
          {displayHighScore}
        </p>
      </div>
    </aside>
  );
}
