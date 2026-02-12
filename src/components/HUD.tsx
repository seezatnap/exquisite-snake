"use client";

import { useEffect, useState } from "react";
import { gameBridge, type GamePhase } from "@/game/bridge";
import { Biome, BIOME_CONFIGS } from "@/game/systems/BiomeManager";

/** Per-biome accent colors for the HUD indicator. */
const BIOME_HUD_COLORS: Record<Biome, { text: string; border: string }> = {
  [Biome.NeonCity]: { text: "text-neon-cyan", border: "border-neon-cyan/50" },
  [Biome.IceCavern]: { text: "text-[#81d4fa]", border: "border-[#81d4fa]/50" },
  [Biome.MoltenCore]: { text: "text-[#ff9800]", border: "border-[#ff9800]/50" },
  [Biome.VoidRift]: { text: "text-neon-purple", border: "border-neon-purple/50" },
};

/**
 * HUD top bar overlay.
 *
 * Displays score, high score, and current biome indicator during gameplay.
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
  const [currentBiome, setCurrentBiome] = useState<Biome>(
    () => gameBridge.getState().currentBiome,
  );

  useEffect(() => {
    const onPhase = (p: GamePhase) => setPhase(p);
    const onScore = (s: number) => setScore(s);
    const onHighScore = (hs: number) => setHighScore(hs);
    const onBiome = (b: Biome) => setCurrentBiome(b);

    gameBridge.on("phaseChange", onPhase);
    gameBridge.on("scoreChange", onScore);
    gameBridge.on("highScoreChange", onHighScore);
    gameBridge.on("biomeChange", onBiome);

    return () => {
      gameBridge.off("phaseChange", onPhase);
      gameBridge.off("scoreChange", onScore);
      gameBridge.off("highScoreChange", onHighScore);
      gameBridge.off("biomeChange", onBiome);
    };
  }, []);

  if (phase !== "playing") return <div id="hud" />;

  const biomeConfig = BIOME_CONFIGS[currentBiome];
  const biomeColors = BIOME_HUD_COLORS[currentBiome];

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

      {/* Status slots */}
      <div className="flex items-center gap-3">
        {/* Biome indicator */}
        <div
          className={`flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs ${biomeColors.border} ${biomeColors.text}`}
          data-slot="biome"
          data-testid="hud-biome"
          data-biome={currentBiome}
          aria-label={`Current biome: ${biomeConfig.name}`}
        >
          <span data-testid="hud-biome-icon" aria-hidden="true">{biomeConfig.icon}</span>
          <span data-testid="hud-biome-name">{biomeConfig.name}</span>
        </div>
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
