"use client";

import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { createGameConfig } from "@/game/config";
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
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Guard: don't create a second instance if one already exists
    if (gameRef.current) return;

    const parent = containerRef.current;
    if (!parent) return;

    // Set initial container size before creating the game
    applyContainerSize(parent);

    const game = new Phaser.Game(createGameConfig(parent));
    gameRef.current = game;

    const onResize = () => {
      applyContainerSize(parent);
      // Notify Phaser's scale manager so it re-fits the canvas
      game.scale.refresh();
    };

    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      // Destroy the Phaser instance on unmount to prevent duplicate canvases
      game.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div id="game-container" ref={containerRef} />;
}
