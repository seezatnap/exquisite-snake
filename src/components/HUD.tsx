"use client";

import { useEffect, useState } from "react";
import { gameBridge, type GamePhase } from "@/game/bridge";

/**
 * HUD top bar overlay.
 *
 * Displays score and high score during gameplay, with reserved placeholder
 * slots for future biome indicator, rewind cooldown, and parasite inventory.
 * Subscribes to the Phaser↔React bridge for real-time state updates.
 *
 * Only visible during the "playing" phase.
 */
export default function HUD() {
  const [phase, setPhase] = useState<GamePhase>(
    () => gameBridge.getState().phase,
  );
  const [score, setScore] = useState<number>(
    () => gameBridge.getState().score,
  );
  const [highScore, setHighScore] = useState<number>(
    () => gameBridge.getState().highScore,
  );

  useEffect(() => {
    const onPhase = (p: GamePhase) => setPhase(p);
    const onScore = (s: number) => setScore(s);
    const onHighScore = (hs: number) => setHighScore(hs);

    gameBridge.on("phaseChange", onPhase);
    gameBridge.on("scoreChange", onScore);
    gameBridge.on("highScoreChange", onHighScore);

    return () => {
      gameBridge.off("phaseChange", onPhase);
      gameBridge.off("scoreChange", onScore);
      gameBridge.off("highScoreChange", onHighScore);
    };
  }, []);

  if (phase !== "playing") return <div id="hud" />;

  return (
    <div
      id="hud"
      className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-2 font-mono text-sm"
      role="status"
      aria-label="Game HUD"
    >
      {/* Score */}
      <div className="flex items-center gap-4">
        <span className="neon-glow-cyan text-neon-cyan">
          SCORE<span className="ml-2 tabular-nums">{score}</span>
        </span>
        <span className="text-neon-pink/60">
          HI<span className="ml-1 tabular-nums">{highScore}</span>
        </span>
      </div>

      {/* Future placeholder slots */}
      <div className="flex items-center gap-3">
        {/* Biome indicator — Phase 2+ */}
        <div
          className="h-5 w-16 rounded border border-surface-bright opacity-30"
          aria-hidden="true"
          data-slot="biome"
        />
        {/* Rewind cooldown — Phase 2+ */}
        <div
          className="h-5 w-10 rounded border border-surface-bright opacity-30"
          aria-hidden="true"
          data-slot="rewind"
        />
        {/* Parasite inventory — Phase 2+ */}
        <div
          className="h-5 w-10 rounded border border-surface-bright opacity-30"
          aria-hidden="true"
          data-slot="parasites"
        />
      </div>
    </div>
  );
}
