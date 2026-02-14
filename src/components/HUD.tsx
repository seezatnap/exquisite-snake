"use client";

import { useEffect, useState } from "react";
import { gameBridge, type GamePhase } from "@/game/bridge";
import {
  PARASITE_MAX_SEGMENTS,
  ParasiteType,
} from "@/game/entities/Parasite";
import { BIOME_CONFIG, Biome } from "@/game/systems/BiomeManager";

type BiomeIconId = (typeof BIOME_CONFIG)[Biome]["icon"];

const BIOME_ICON_SYMBOLS: Record<BiomeIconId, string> = {
  city: "[]",
  snowflake: "*",
  flame: "^",
  vortex: "@",
};

const PARASITE_SLOT_META: Record<
  ParasiteType,
  {
    label: string;
    indicator: string;
    className: string;
  }
> = {
  [ParasiteType.Magnet]: {
    label: "Magnet",
    indicator: "MG",
    className: "border-amber-300/70 bg-amber-400/20 text-amber-100",
  },
  [ParasiteType.Shield]: {
    label: "Shield",
    indicator: "SH",
    className: "border-cyan-300/70 bg-cyan-400/20 text-cyan-100",
  },
  [ParasiteType.Splitter]: {
    label: "Splitter",
    indicator: "SP",
    className: "border-emerald-300/70 bg-emerald-400/20 text-emerald-100",
  },
};

function normalizeBiome(value: unknown): Biome {
  if (typeof value === "string" && value in BIOME_CONFIG) {
    return value as Biome;
  }
  return Biome.NeonCity;
}

function normalizeActiveParasites(value: unknown): ParasiteType[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is ParasiteType =>
      entry === ParasiteType.Magnet ||
      entry === ParasiteType.Shield ||
      entry === ParasiteType.Splitter
    )
    .slice(0, PARASITE_MAX_SEGMENTS);
}

/**
 * HUD top bar overlay.
 *
 * Displays score and high score during gameplay, plus biome and parasite state.
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
    () => normalizeActiveParasites(gameBridge.getState().activeParasites),
  );

  useEffect(() => {
    const onPhase = (p: GamePhase) => setPhase(p);
    const onScore = (s: number) => setScore(s);
    const onHighScore = (hs: number) => setHighScore(hs);
    const onBiomeChange = (biome: Biome) => setCurrentBiome(biome);
    const onActiveParasitesChange = (parasites: ParasiteType[]) =>
      setActiveParasites(normalizeActiveParasites(parasites));

    gameBridge.on("phaseChange", onPhase);
    gameBridge.on("scoreChange", onScore);
    gameBridge.on("highScoreChange", onHighScore);
    gameBridge.on("biomeChange", onBiomeChange);
    gameBridge.on("activeParasitesChange", onActiveParasitesChange);

    return () => {
      gameBridge.off("phaseChange", onPhase);
      gameBridge.off("scoreChange", onScore);
      gameBridge.off("highScoreChange", onHighScore);
      gameBridge.off("biomeChange", onBiomeChange);
      gameBridge.off("activeParasitesChange", onActiveParasitesChange);
    };
  }, []);

  if (phase !== "playing") return <div id="hud" />;

  const biomeConfig = BIOME_CONFIG[currentBiome];
  const biomeIcon = BIOME_ICON_SYMBOLS[biomeConfig.icon];
  const activeParasiteLabels = activeParasites.map(
    (type) => PARASITE_SLOT_META[type].label,
  );
  const parasiteInventoryAriaLabel = activeParasiteLabels.length > 0
    ? `Active parasites: ${activeParasiteLabels.join(", ")}`
    : "Active parasites: none";

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
        <div
          className="flex h-5 items-center gap-1 rounded border border-surface-bright/70 bg-surface/80 px-1"
          aria-label={parasiteInventoryAriaLabel}
          data-slot="parasites"
          data-testid="hud-parasite-inventory"
        >
          {Array.from({ length: PARASITE_MAX_SEGMENTS }, (_, index) => {
            const parasiteType = activeParasites[index] ?? null;
            const parasiteMeta = parasiteType ? PARASITE_SLOT_META[parasiteType] : null;
            return (
              <div
                key={`parasite-slot-${index}`}
                className={`flex h-4 min-w-6 items-center justify-center rounded border text-[9px] font-bold tracking-wide ${
                  parasiteMeta
                    ? parasiteMeta.className
                    : "border-surface-bright/40 text-foreground/25"
                }`}
                data-parasite-type={parasiteType ?? "empty"}
                data-testid={`hud-parasite-slot-${index}`}
              >
                {parasiteMeta ? parasiteMeta.indicator : "·"}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
