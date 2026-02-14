"use client";

import { useEffect, useState } from "react";
import { gameBridge, type GamePhase } from "@/game/bridge";
import { BIOME_CONFIG, Biome } from "@/game/systems/BiomeManager";
import { type ParasiteType } from "@/game/entities/Parasite";

type BiomeIconId = (typeof BIOME_CONFIG)[Biome]["icon"];

const BIOME_ICON_SYMBOLS: Record<BiomeIconId, string> = {
  city: "[]",
  snowflake: "*",
  flame: "^",
  vortex: "@",
};

const PARASITE_INDICATOR_BY_TYPE: Record<ParasiteType, string> = {
  magnet: "MG",
  shield: "SH",
  splitter: "SP",
};

const PARASITE_STYLE_BY_TYPE: Record<ParasiteType, string> = {
  magnet: "border-[#f5c542] text-[#f5c542] bg-[#f5c542]/10",
  shield: "border-[#4cf5ff] text-[#4cf5ff] bg-[#4cf5ff]/10",
  splitter: "border-[#58f78a] text-[#58f78a] bg-[#58f78a]/10",
};

const PARASITE_LABEL_BY_TYPE: Record<ParasiteType, string> = {
  magnet: "Magnet",
  shield: "Shield",
  splitter: "Splitter",
};

const HUD_PARASITE_SLOT_COUNT = 3;

function normalizeBiome(value: unknown): Biome {
  if (typeof value === "string" && value in BIOME_CONFIG) {
    return value as Biome;
  }
  return Biome.NeonCity;
}

function normalizeParasiteInventory(value: unknown): ParasiteType[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is ParasiteType =>
      entry === "magnet" || entry === "shield" || entry === "splitter",
  );
}

/**
 * HUD top bar overlay.
 *
 * Displays score and high score during gameplay, plus the biome indicator,
 * rewind placeholder slot, and live parasite inventory slots.
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
  const [activeParasites, setActiveParasites] = useState<ParasiteType[]>(
    () => normalizeParasiteInventory(gameBridge.getState().activeParasites),
  );

  useEffect(() => {
    const onPhase = (p: GamePhase) => setPhase(p);
    const onScore = (s: number) => setScore(s);
    const onHighScore = (hs: number) => setHighScore(hs);
    const onBiomeChange = (biome: Biome) => setCurrentBiome(biome);
    const onParasiteInventory = (types: ParasiteType[]) =>
      setActiveParasites(normalizeParasiteInventory(types));

    gameBridge.on("phaseChange", onPhase);
    gameBridge.on("scoreChange", onScore);
    gameBridge.on("highScoreChange", onHighScore);
    gameBridge.on("biomeChange", onBiomeChange);
    gameBridge.on("parasiteInventoryChange", onParasiteInventory);

    return () => {
      gameBridge.off("phaseChange", onPhase);
      gameBridge.off("scoreChange", onScore);
      gameBridge.off("highScoreChange", onHighScore);
      gameBridge.off("biomeChange", onBiomeChange);
      gameBridge.off("parasiteInventoryChange", onParasiteInventory);
    };
  }, []);

  if (phase !== "playing") return <div id="hud" />;

  const biomeConfig = BIOME_CONFIG[currentBiome];
  const biomeIcon = BIOME_ICON_SYMBOLS[biomeConfig.icon];
  const displayedParasites = activeParasites.slice(0, HUD_PARASITE_SLOT_COUNT);

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
        {/* Parasite inventory */}
        <div
          className="flex h-5 items-center gap-1 rounded border border-surface-bright/70 bg-surface/80 px-1"
          aria-label={`Active parasites: ${displayedParasites.length}/${HUD_PARASITE_SLOT_COUNT}`}
          data-slot="parasites"
          data-testid="hud-parasite-inventory"
        >
          {Array.from({ length: HUD_PARASITE_SLOT_COUNT }).map((_, index) => {
            const parasiteType = displayedParasites[index];
            if (!parasiteType) {
              return (
                <span
                  key={`empty-${index}`}
                  className="h-3 w-3 rounded border border-surface-bright/60"
                  data-active="false"
                  data-testid={`hud-parasite-slot-${index}`}
                />
              );
            }

            return (
              <span
                key={`${parasiteType}-${index}`}
                className={`inline-flex h-3 min-w-3 items-center justify-center rounded border px-[2px] text-[8px] font-bold leading-none ${PARASITE_STYLE_BY_TYPE[parasiteType]}`}
                data-active="true"
                data-parasite-type={parasiteType}
                data-testid={`hud-parasite-slot-${index}`}
                title={PARASITE_LABEL_BY_TYPE[parasiteType]}
              >
                {PARASITE_INDICATOR_BY_TYPE[parasiteType]}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
