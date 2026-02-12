"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import HUD from "@/components/HUD";
import StartScreen from "@/components/StartScreen";
import GameOver from "@/components/GameOver";
import { gameBridge, type GamePhase } from "@/game/bridge";

const Game = dynamic(() => import("@/components/Game"), { ssr: false });

export default function Home() {
  const [phase, setPhase] = useState<GamePhase>(
    () => gameBridge.getState().phase,
  );

  useEffect(() => {
    const onPhase = (p: GamePhase) => setPhase(p);
    gameBridge.on("phaseChange", onPhase);
    return () => {
      gameBridge.off("phaseChange", onPhase);
    };
  }, []);

  // Prevent Phaser from capturing keys while an overlay is active
  const suppressGameInput = useCallback(
    (e: React.KeyboardEvent) => {
      if (phase !== "playing") {
        e.stopPropagation();
      }
    },
    [phase],
  );

  return (
    <main className="game-wrapper relative min-h-screen">
      {/* Layer 0: Phaser canvas with arena grid overlay */}
      <div className="arena-grid">
        <Game />
      </div>

      {/* Layer 1: HUD overlay (always rendered, toggled by game state) */}
      <div className="pointer-events-none absolute inset-0 z-10">
        <HUD />
      </div>

      {/* Layer 2: Start screen overlay */}
      <div
        className={`absolute inset-0 z-20 ${phase === "start" ? "overlay-backdrop" : "pointer-events-none"}`}
        onKeyDown={suppressGameInput}
      >
        <StartScreen />
      </div>

      {/* Layer 3: Game Over overlay */}
      <div
        className={`absolute inset-0 z-30 ${phase === "gameOver" ? "overlay-backdrop" : "pointer-events-none"}`}
        onKeyDown={suppressGameInput}
      >
        <GameOver />
      </div>
    </main>
  );
}
