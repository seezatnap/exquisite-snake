"use client";

import { useEffect, useRef } from "react";
import {
  viewportToContainer,
  computeCanvasSize,
} from "@/game/utils/responsive";

/**
 * Apply responsive dimensions to the game container so Phaser's
 * FIT scale mode has correctly-sized bounds to fit within.
 */
function applyContainerSize(container: HTMLDivElement): void {
  const { width: cw, height: ch } = viewportToContainer(
    window.innerWidth,
    window.innerHeight,
  );
  const { width, height } = computeCanvasSize(cw, ch);
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
}

export default function Game() {
  const gameRef = useRef<unknown>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Guard: don't create a second instance if one already exists
    if (gameRef.current) return;

    const parent = containerRef.current;
    if (!parent) return;

    // Set initial container size before creating the game
    applyContainerSize(parent);

    let cancelled = false;
    let removeResizeListener: (() => void) | null = null;

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

      const onResize = () => {
        applyContainerSize(parent!);
        // Notify Phaser's scale manager so it re-fits the canvas
        game.scale.refresh();
      };

      window.addEventListener("resize", onResize);
      removeResizeListener = () => window.removeEventListener("resize", onResize);
    }

    init();

    return () => {
      cancelled = true;
      if (removeResizeListener) removeResizeListener();
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
