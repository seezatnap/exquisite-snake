"use client";

import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { createGameConfig } from "@/game/config";

export default function Game() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Guard: don't create a second instance if one already exists
    if (gameRef.current) return;

    const parent = containerRef.current;
    if (!parent) return;

    const game = new Phaser.Game(createGameConfig(parent));

    gameRef.current = game;

    return () => {
      // Destroy the Phaser instance on unmount to prevent duplicate canvases
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div id="game-container" ref={containerRef} />;
}
