"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";

type PhaserGameInstance = {
  destroy: (removeCanvas: boolean, noReturn?: boolean) => void;
  scale?: {
    refresh?: () => void;
  };
};

type ArenaFitSize = Readonly<{
  width: number;
  height: number;
  scale: number;
}>;

function clampDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

export function fitArenaToContainer(
  containerWidth: number,
  containerHeight: number,
  arenaWidth: number,
  arenaHeight: number,
  gridCols: number,
  gridRows: number,
): ArenaFitSize {
  const safeContainerWidth = clampDimension(containerWidth);
  const safeContainerHeight = clampDimension(containerHeight);
  const safeArenaWidth = Math.max(1, clampDimension(arenaWidth));
  const safeArenaHeight = Math.max(1, clampDimension(arenaHeight));
  const safeGridCols = Math.max(1, clampDimension(gridCols));
  const safeGridRows = Math.max(1, clampDimension(gridRows));

  if (safeContainerWidth === 0 || safeContainerHeight === 0) {
    return {
      width: 0,
      height: 0,
      scale: 0,
    };
  }

  const maxScale = Math.min(
    safeContainerWidth / safeArenaWidth,
    safeContainerHeight / safeArenaHeight,
  );

  if (!Number.isFinite(maxScale) || maxScale <= 0) {
    return {
      width: 0,
      height: 0,
      scale: 0,
    };
  }

  const fittedWidth = Math.max(1, Math.floor(safeArenaWidth * maxScale));
  const fittedHeight = Math.max(1, Math.floor(safeArenaHeight * maxScale));
  const cellWidth = Math.floor(fittedWidth / safeGridCols);
  const cellHeight = Math.floor(fittedHeight / safeGridRows);
  const snappedCellSize = Math.min(cellWidth, cellHeight);

  if (snappedCellSize >= 1) {
    const width = snappedCellSize * safeGridCols;
    const height = snappedCellSize * safeGridRows;

    return {
      width,
      height,
      scale: width / safeArenaWidth,
    };
  }

  return {
    width: fittedWidth,
    height: fittedHeight,
    scale: Math.min(
      fittedWidth / safeArenaWidth,
      fittedHeight / safeArenaHeight,
    ),
  };
}

function PhaserGameMount() {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<PhaserGameInstance | null>(null);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let resizeFrameHandle: number | null = null;
    let handleViewportResize: (() => void) | null = null;
    let arenaWidth = 0;
    let arenaHeight = 0;
    let gridCols = 0;
    let gridRows = 0;

    const frameNode = frameRef.current;
    const mountNode = mountRef.current;

    if (!frameNode || !mountNode || gameRef.current) {
      return;
    }

    mountNode.replaceChildren();

    const applyResponsiveSizing = () => {
      if (arenaWidth <= 0 || arenaHeight <= 0 || gridCols <= 0 || gridRows <= 0) {
        return;
      }

      const bounds = frameNode.getBoundingClientRect();
      const fit = fitArenaToContainer(
        bounds.width,
        bounds.height,
        arenaWidth,
        arenaHeight,
        gridCols,
        gridRows,
      );

      mountNode.style.width = `${fit.width}px`;
      mountNode.style.height = `${fit.height}px`;
    };

    const clearResizeFrame = () => {
      if (resizeFrameHandle === null) {
        return;
      }

      if (typeof window !== "undefined" && window.cancelAnimationFrame) {
        window.cancelAnimationFrame(resizeFrameHandle);
      } else {
        clearTimeout(resizeFrameHandle);
      }

      resizeFrameHandle = null;
    };

    const scheduleScaleRefresh = () => {
      if (cancelled) {
        return;
      }

      clearResizeFrame();

      if (typeof window !== "undefined" && window.requestAnimationFrame) {
        resizeFrameHandle = window.requestAnimationFrame(() => {
          resizeFrameHandle = null;
          applyResponsiveSizing();
          gameRef.current?.scale?.refresh?.();
        });
      } else {
        resizeFrameHandle = setTimeout(() => {
          resizeFrameHandle = null;
          applyResponsiveSizing();
          gameRef.current?.scale?.refresh?.();
        }, 16) as unknown as number;
      }
    };

    void (async () => {
      try {
        const [
          { default: Phaser },
          { ARENA_HEIGHT, ARENA_WIDTH, GAME_CONFIG, GRID_COLS, GRID_ROWS },
        ] = await Promise.all([
          import("phaser"),
          import("@/game/config"),
        ]);

        if (cancelled || !mountNode.isConnected || gameRef.current) {
          return;
        }

        arenaWidth = ARENA_WIDTH;
        arenaHeight = ARENA_HEIGHT;
        gridCols = GRID_COLS;
        gridRows = GRID_ROWS;

        applyResponsiveSizing();

        gameRef.current = new Phaser.Game({
          ...(GAME_CONFIG as Record<string, unknown>),
          parent: mountNode,
        });

        handleViewportResize = () => {
          scheduleScaleRefresh();
        };

        if (typeof window !== "undefined") {
          window.addEventListener("resize", handleViewportResize);
          window.addEventListener("orientationchange", handleViewportResize);
          window.visualViewport?.addEventListener("resize", handleViewportResize);
        }

        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => {
            scheduleScaleRefresh();
          });

          resizeObserver.observe(frameNode);
        }

        scheduleScaleRefresh();
      } catch {
        // Keep the component resilient if game bootstrap fails.
      }
    })();

    return () => {
      cancelled = true;
      clearResizeFrame();

      if (handleViewportResize && typeof window !== "undefined") {
        window.removeEventListener("resize", handleViewportResize);
        window.removeEventListener("orientationchange", handleViewportResize);
        window.visualViewport?.removeEventListener("resize", handleViewportResize);
      }

      if (resizeObserver) {
        resizeObserver.disconnect();
      }

      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }

      mountNode.style.width = "";
      mountNode.style.height = "";
      mountNode.replaceChildren();
    };
  }, []);

  return (
    <div ref={frameRef} className="flex h-full w-full items-center justify-center">
      <div ref={mountRef} className="max-h-full max-w-full overflow-hidden" />
    </div>
  );
}

const ClientOnlyPhaserGame = dynamic(() => Promise.resolve(PhaserGameMount), {
  ssr: false,
});

export default function Game() {
  return <ClientOnlyPhaserGame />;
}
