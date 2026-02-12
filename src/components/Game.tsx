"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";

type PhaserGameInstance = {
  destroy: (removeCanvas: boolean, noReturn?: boolean) => void;
};

function PhaserGameMount() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<PhaserGameInstance | null>(null);

  useEffect(() => {
    let cancelled = false;
    const mountNode = mountRef.current;

    if (!mountNode || gameRef.current) {
      return;
    }

    mountNode.replaceChildren();

    void (async () => {
      try {
        const [{ default: Phaser }, { GAME_CONFIG }] = await Promise.all([
          import("phaser"),
          import("@/game/config"),
        ]);

        if (cancelled || !mountNode.isConnected || gameRef.current) {
          return;
        }

        gameRef.current = new Phaser.Game({
          ...(GAME_CONFIG as Record<string, unknown>),
          parent: mountNode,
        });
      } catch {
        // Keep the component resilient if game bootstrap fails.
      }
    })();

    return () => {
      cancelled = true;

      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }

      mountNode.replaceChildren();
    };
  }, []);

  return <div ref={mountRef} className="h-full w-full" />;
}

const ClientOnlyPhaserGame = dynamic(() => Promise.resolve(PhaserGameMount), {
  ssr: false,
});

export default function Game() {
  return <ClientOnlyPhaserGame />;
}
