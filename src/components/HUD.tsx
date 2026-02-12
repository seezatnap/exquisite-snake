"use client";

import { useEffect, useState } from "react";
import { gameBridge, type GamePhase } from "@/game/bridge";
import { BIOME_CONFIG, Biome } from "@/game/systems/BiomeManager";

type BiomeIconId = (typeof BIOME_CONFIG)[Biome]["icon"];

const BIOME_ICON_SYMBOLS: Record<BiomeIconId, string> = {
  city: "[]",
  snowflake: "*",
  flame: "^",
  vortex: "@",
};

function normalizeBiome(value: unknown): Biome {
  if (typeof value === "string" && value in BIOME_CONFIG) {
    return value as Biome;
  }
  return Biome.NeonCity;
}

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
  const [currentBiome, setCurrentBiome] = useState<Biome>(
    () => normalizeBiome(gameBridge.getState().currentBiome),
  );

  useEffect(() => {
    const onPhase = (p: GamePhase) => setPhase(p);
    const onScore = (s: number) => setScore(s);
    const onHighScore = (hs: number) => setHighScore(hs);
    const onBiomeChange = (biome: Biome) => setCurrentBiome(biome);

    gameBridge.on("phaseChange", onPhase);
    gameBridge.on("scoreChange", onScore);
    gameBridge.on("highScoreChange", onHighScore);
    gameBridge.on("biomeChange", onBiomeChange);

    return () => {
      gameBridge.off("phaseChange", onPhase);
      gameBridge.off("scoreChange", onScore);
      gameBridge.off("highScoreChange", onHighScore);
      gameBridge.off("biomeChange", onBiomeChange);
    };
  }, []);

  if (phase !== "playing") return <div id="hud" />;

  const biomeConfig = BIOME_CONFIG[currentBiome];
  const biomeIcon = BIOME_ICON_SYMBOLS[biomeConfig.icon];

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

      {/* Runtime + future slots */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-5 items-center gap-2 rounded border border-neon-cyan/60 bg-surface/80 px-2 text-[10px] uppercase tracking-wide text-neon-cyan"
          aria-label={`Current biome: ${biomeConfig.label}`}
          data-slot="biome"
          data-testid="hud-biome-indicator"
        >
          <span aria-hidden="true" className="font-bold" data-testid="hud-biome-icon">
            {biomeIcon}
          </span>
          <span className="text-foreground/80" data-testid="hud-biome-name">
            {biomeConfig.label}
          </span>
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
