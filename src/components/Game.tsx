"use client";

import { useEffect, useRef } from "react";

export default function Game() {
  const gameRef = useRef<unknown>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Guard: don't create a second instance if one already exists
    if (gameRef.current) return;

    const parent = containerRef.current;
    if (!parent) return;

    let cancelled = false;

    async function init() {
      const [Phaser, { createGameConfig }, { Boot }, { MainScene }] =
        await Promise.all([
          import("phaser").then((m) => m.default),
          import("@/game/config"),
          import("@/game/scenes/Boot"),
          import("@/game/scenes/MainScene"),
        ]);

      if (cancelled) return;

      const config = createGameConfig(parent!, Phaser, [Boot, MainScene]);
      const game = new Phaser.Game(config);
      gameRef.current = game;
    }

    init();

    return () => {
      cancelled = true;
      // Destroy the Phaser instance on unmount to prevent duplicate canvases
      const game = gameRef.current as { destroy: (removeCanvas: boolean) => void } | null;
      if (game) {
        game.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return <div id="game-container" ref={containerRef} />;
}
