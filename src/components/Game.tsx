"use client";

import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { ARENA_WIDTH, ARENA_HEIGHT } from "@/game/config";

export default function Game() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Guard: don't create a second instance if one already exists
    if (gameRef.current) return;

    const parent = containerRef.current;
    if (!parent) return;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: ARENA_WIDTH,
      height: ARENA_HEIGHT,
      parent,
      backgroundColor: "#0a0a0a",
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      // Scenes will be added by tasks #4 and #5
      scene: [],
    });

    gameRef.current = game;

    return () => {
      // Destroy the Phaser instance on unmount to prevent duplicate canvases
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div id="game-container" ref={containerRef} />;
}
