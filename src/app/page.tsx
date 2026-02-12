"use client";

import dynamic from "next/dynamic";
import HUD from "@/components/HUD";
import StartScreen from "@/components/StartScreen";
import GameOver from "@/components/GameOver";

const Game = dynamic(() => import("@/components/Game"), { ssr: false });

export default function Home() {
  return (
    <main className="relative flex min-h-screen items-center justify-center">
      {/* Layer 0: Phaser canvas */}
      <Game />

      {/* Layer 1: HUD overlay (always rendered, toggled by game state) */}
      <div className="pointer-events-none absolute inset-0 z-10">
        <HUD />
      </div>

      {/* Layer 2: Start screen overlay */}
      <div className="absolute inset-0 z-20">
        <StartScreen />
      </div>

      {/* Layer 3: Game Over overlay */}
      <div className="absolute inset-0 z-30">
        <GameOver />
      </div>
    </main>
  );
}
